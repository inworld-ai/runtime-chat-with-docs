import { GraphTypes } from '@inworld/runtime/common';
import {
  CustomNode,
  Graph,
  GraphBuilder,
  GraphOutputStream,
  ProcessContext,
  ProxyNode,
  RemoteLLMChatNode,
} from '@inworld/runtime/graph';
import { renderJinja } from '@inworld/runtime/primitives/llm';
import { readFileSync } from 'fs';
import * as path from 'path';

import {
  KNOWLEDGE_CONFIG,
  LLM_MODEL_NAME,
  LLM_PROVIDER,
  MAX_CONVERSATION_HISTORY,
  TEXT_GENERATION_CONFIG,
} from '../../constants';
import { Message } from '../types';
import { EmbedderService } from './embedder_service';
import { KnowledgeManager } from './knowledge_manager';

export interface CreateGraphProps {
  apiKey: string;
  knowledgeManager: KnowledgeManager;
  conversationHistory?: Message[];
}

export class InworldGraph {
  public executor: Graph;
  private embedderService: EmbedderService;

  private constructor(executor: Graph, embedderService: EmbedderService) {
    this.executor = executor;
    this.embedderService = embedderService;
  }

  public async destroy() {
    this.executor.stopExecutor();
    this.executor.cleanupAllExecutions();
    this.executor.destroy();
    await this.embedderService.destroy();
  }

  static async create({
    apiKey,
    knowledgeManager,
    conversationHistory = [],
  }: CreateGraphProps): Promise<InworldGraph> {
    if (!knowledgeManager.hasEmbeddings()) {
      throw new Error(
        'KnowledgeManager must have pre-computed embeddings. Call loadDocumentationWithEmbeddings() first.',
      );
    }

    const llmProvider = process.env.LLM_PROVIDER || LLM_PROVIDER;
    const llmModelName = process.env.LLM_MODEL_NAME || LLM_MODEL_NAME;

    const embedderService = new EmbedderService(apiKey);
    await embedderService.initialize();

    const embeddedRecords = knowledgeManager.getEmbeddedRecords();

    // Custom node classes
    class QueryEmbedderNode extends CustomNode {
      async process(_context: ProcessContext, queryText: string) {
        const result = await embedderService.embedSingle(queryText.trim());
        return {
          queryText,
          queryEmbedding: result.embedding,
        };
      }
    }

    class KnowledgeRetrievalNode extends CustomNode {
      process(
        _context: ProcessContext,
        queryData: { queryText: string; queryEmbedding: number[] },
      ) {
        if (embeddedRecords.length === 0) {
          throw new Error('No embedded records available');
        }

        const similarities = embeddedRecords.map((record, index) => {
          try {
            const similarity = EmbedderService.cosineSimilarity(
              queryData.queryEmbedding,
              record.embedding,
            );
            return {
              record: record.text,
              similarity,
              index,
            };
          } catch (error: any) {
            console.error(
              `Error calculating similarity for record ${index}:`,
              error.message,
            );
            return {
              record: record.text,
              similarity: 0,
              index,
            };
          }
        });

        // Sort by similarity score
        const sortedSimilarities = similarities.sort(
          (a, b) => b.similarity - a.similarity,
        );

        if (process.env.DEBUG) {
          // Log top 5 similarities for debugging (FULL TEXT)
          console.log(`\n[Retrieval] Query: "${queryData.queryText}"`);
          sortedSimilarities.slice(0, 5).forEach((item, idx) => {
            console.log(
              `\n--- Record ${idx + 1} | Score: ${item.similarity.toFixed(4)} ---`,
            );
            console.log(item.record);
            console.log('---');
          });
          console.log(
            `[Retrieval] Current threshold: ${KNOWLEDGE_CONFIG.RETRIEVAL_THRESHOLD}`,
          );
        }

        // Filter by threshold
        const aboveThreshold = sortedSimilarities.filter(
          (item) => item.similarity >= KNOWLEDGE_CONFIG.RETRIEVAL_THRESHOLD,
        );

        // Get top K records
        const topRecords = aboveThreshold
          .slice(0, KNOWLEDGE_CONFIG.RETRIEVAL_TOP_K)
          .map((item) => item.record);

        return {
          queryText: queryData.queryText,
          relevantRecords: topRecords,
        };
      }
    }

    class JinjaPromptRenderNode extends CustomNode {
      async process(
        _context: ProcessContext,
        retrievalData: { queryText: string; relevantRecords: string[] },
      ) {
        const templatePath = path.join(
          __dirname,
          '..',
          'prompts',
          'documentation_assistant.jinja',
        );
        const template = readFileSync(templatePath, 'utf-8');

        const templateData = {
          query: retrievalData.queryText,
          knowledge_records: retrievalData.relevantRecords,
          conversation_history: conversationHistory
            .slice(0, -1) // Remove last message (current user query)
            .slice(-MAX_CONVERSATION_HISTORY),
        };

        const renderedPrompt = await renderJinja(
          template,
          JSON.stringify(templateData),
        );

        if (process.env.DEBUG) {
          // Log the FULL rendered prompt for debugging
          console.log('\n[JinjaPrompt] === FULL PROMPT SENT TO LLM ===');
          console.log('='.repeat(80));
          console.log(renderedPrompt);
          console.log('='.repeat(80));
          console.log('[JinjaPrompt] === END OF PROMPT ===\n');
        }

        // Return proper LLMChatRequest format
        return new GraphTypes.LLMChatRequest({
          messages: [
            {
              role: 'user',
              content: renderedPrompt,
            },
          ],
        });
      }
    }

    // Create node instances
    const inputNode = new ProxyNode();
    const queryEmbedderNode = new QueryEmbedderNode();
    const knowledgeRetrievalNode = new KnowledgeRetrievalNode();
    const jinjaPromptRenderNode = new JinjaPromptRenderNode();

    const llmNode = new RemoteLLMChatNode({
      provider: llmProvider,
      modelName: llmModelName,
      stream: true,
      textGenerationConfig: TEXT_GENERATION_CONFIG,
    });

    // Build graph
    const graphBuilder = new GraphBuilder({
      id: 'chat-with-docs-graph',
      apiKey,
      enableRemoteConfig: false,
    });
    graphBuilder.addNode(inputNode);
    graphBuilder.addNode(queryEmbedderNode);
    graphBuilder.addNode(knowledgeRetrievalNode);
    graphBuilder.addNode(jinjaPromptRenderNode);
    graphBuilder.addNode(llmNode);

    graphBuilder.addEdge(inputNode, queryEmbedderNode);
    graphBuilder.addEdge(queryEmbedderNode, knowledgeRetrievalNode);
    graphBuilder.addEdge(knowledgeRetrievalNode, jinjaPromptRenderNode);
    graphBuilder.addEdge(jinjaPromptRenderNode, llmNode);

    graphBuilder.setStartNode(inputNode);
    graphBuilder.setEndNode(llmNode);

    const executor = graphBuilder.build();

    console.log(
      `Graph created with ${embeddedRecords.length} knowledge records`,
    );

    return new InworldGraph(executor, embedderService);
  }

  async processQuery(
    query: string,
    sessionId: string,
  ): Promise<GraphOutputStream> {
    return this.executor.start(query, sessionId);
  }
}
