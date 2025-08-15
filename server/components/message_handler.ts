import {
  ContentStreamIterator,
  GraphTypes,
  TextStreamIterationResult,
  TextStreamIterator,
} from '@inworld/runtime/common';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

import { Connection, EventMessage } from '../types';
import { InworldGraph } from './graph';
import { KnowledgeManager } from './knowledge_manager';
import { DocumentationScraper } from './scraper';

export class MessageHandler {
  private connections: Record<string, Connection> = {};
  private graph: InworldGraph | null = null;
  private knowledgeManager: KnowledgeManager;
  private scraper: DocumentationScraper;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.knowledgeManager = new KnowledgeManager(apiKey);
    this.scraper = new DocumentationScraper();
  }

  public async handleConnection(ws: WebSocket): Promise<void> {
    const sessionId = uuidv4();
    const connection: Connection = {
      ws,
      sessionId,
      state: {
        messages: [],
        knowledgeLoaded: false,
      },
    };

    this.connections[sessionId] = connection;
    console.log(`New connection established: ${sessionId}`);

    // Send welcome message
    this.sendMessage(ws, {
      type: 'connected',
      data: { sessionId },
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(sessionId, message);
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendMessage(ws, {
          type: 'error',
          data: { error: 'Failed to process message' },
        });
      }
    });

    ws.on('close', () => {
      console.log(`Connection closed: ${sessionId}`);
      delete this.connections[sessionId];
    });
  }

  private async handleMessage(sessionId: string, message: any): Promise<void> {
    const connection = this.connections[sessionId];
    if (!connection) return;

    switch (message.type) {
      case 'load_docs':
        await this.handleLoadDocs(connection, message.data.url);
        break;
      case 'chat':
        await this.handleChat(connection, message.data.message);
        break;
    }
  }

  private async handleLoadDocs(
    connection: Connection,
    url: string,
  ): Promise<void> {
    try {
      // Clear messages when loading new docs
      connection.state.messages = [];

      // Send clear messages signal to frontend
      this.sendMessage(connection.ws, {
        type: 'clear_messages',
        data: {},
      });

      // Send loading status
      this.sendMessage(connection.ws, {
        type: 'loading_docs',
        data: { status: 'started', url },
      });

      // Scrape documentation with progress updates
      const pages = await this.scraper.scrapeDocumentation(
        url,
        (current, total, title) => {
          this.sendMessage(connection.ws, {
            type: 'scraping_progress',
            data: {
              current,
              total,
              title,
              percentage: Math.round((current / total) * 100),
            },
          });
        },
      );

      if (pages.length === 0) {
        // Send error if no pages scraped
        this.sendMessage(connection.ws, {
          type: 'error',
          data: {
            error:
              'Unable to scrape any documentation from this URL. Please try a different documentation URL.',
          },
        });
        return;
      }

      // Load documentation with pre-computed embeddings
      await this.knowledgeManager.loadDocumentationWithEmbeddings(pages);

      // Create graph with embedded knowledge
      if (this.graph) {
        await this.graph.destroy();
        this.graph = null;
      }

      this.graph = await InworldGraph.create({
        apiKey: this.apiKey,
        knowledgeManager: this.knowledgeManager,
        conversationHistory: connection.state.messages,
      });

      // Update connection state
      connection.state.knowledgeLoaded = true;
      connection.state.documentationUrl = url;

      // Send success message
      this.sendMessage(connection.ws, {
        type: 'docs_loaded',
        data: {
          url,
          pageCount: pages.length,
          recordCount: this.knowledgeManager.getEmbeddedRecords().length,
        },
      });
    } catch (error) {
      console.error('Error loading documentation:', error);
      this.sendMessage(connection.ws, {
        type: 'error',
        data: {
          error:
            'Failed to load documentation. Please check the URL and try again.',
        },
      });
    }
  }

  private async handleChat(
    connection: Connection,
    message: string,
  ): Promise<void> {
    if (!this.graph || !connection.state.knowledgeLoaded) {
      this.sendMessage(connection.ws, {
        type: 'error',
        data: {
          error: 'Please load documentation first before asking questions.',
        },
      });
      return;
    }

    const messageId = uuidv4();

    // Add user message to state
    connection.state.messages.push({
      role: 'user',
      content: message,
      id: messageId,
      timestamp: Date.now(),
    });

    try {
      const outputStream = await this.graph.processQuery(
        message,
        connection.sessionId,
      );

      const assistantId = uuidv4();
      let fullResponse = '';
      let isFirstChunk = true;

      for await (const result of outputStream) {
        await new Promise<void>((resolve, reject) => {
          result.processResponse({
            ContentStream: async (contentStream: ContentStreamIterator) => {
              try {
                let chunk: TextStreamIterationResult =
                  await contentStream.next();
                while (!chunk.done) {
                  if (chunk.text) {
                    fullResponse += chunk.text;
                    this.sendMessage(connection.ws, {
                      type: isFirstChunk ? 'message_start' : 'message_chunk',
                      data: {
                        role: 'assistant',
                        content: chunk.text,
                        id: assistantId,
                      },
                    });
                    isFirstChunk = false;
                  }
                  chunk = await contentStream.next();
                }
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            TextStream: async (textStream: TextStreamIterator) => {
              try {
                let text: TextStreamIterationResult = await textStream.next();
                while (!text.done) {
                  if (text.text) {
                    fullResponse += text.text;
                    this.sendMessage(connection.ws, {
                      type: isFirstChunk ? 'message_start' : 'message_chunk',
                      data: {
                        role: 'assistant',
                        content: text.text,
                        id: assistantId,
                      },
                    });
                    isFirstChunk = false;
                  }
                  text = await textStream.next();
                }
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            Content: (content: GraphTypes.Content) => {
              if (content?.content) {
                fullResponse += content.content;
                this.sendMessage(connection.ws, {
                  type: 'message',
                  data: {
                    role: 'assistant',
                    content: content.content,
                    id: assistantId,
                  },
                });
              }
              resolve();
            },
            string: (data: string) => {
              if (!data) {
                this.sendMessage(connection.ws, {
                  type: 'message',
                  data: {
                    role: 'assistant',
                    content:
                      "I couldn't find any information about that in the current documentation. Please try asking about topics covered in the loaded documentation.",
                    id: assistantId,
                  },
                });
              } else {
                fullResponse += data;
                this.sendMessage(connection.ws, {
                  type: 'message',
                  data: {
                    role: 'assistant',
                    content: data,
                    id: assistantId,
                  },
                });
              }
              resolve();
            },
            default: (data: any) => {
              console.log('Unhandled result type:', data);
              resolve();
            },
          });
        });
      }

      if (fullResponse) {
        this.sendMessage(connection.ws, {
          type: 'message_end',
          data: {
            role: 'assistant',
            id: assistantId,
          },
        });

        connection.state.messages.push({
          role: 'assistant',
          content: fullResponse,
          id: assistantId,
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      console.error('Error processing chat:', error);

      // Check if it's a safety filter error
      let errorMessage = 'Failed to process your question. Please try again.';
      if (
        error.message?.includes('blocked by the safety filters') ||
        error.context?.includes('blocked by the safety filters')
      ) {
        errorMessage =
          'Your question was blocked by safety filters. Please try rephrasing your question.';
      }

      this.sendMessage(connection.ws, {
        type: 'error',
        data: { error: errorMessage },
      });
    }
  }

  private sendMessage(ws: WebSocket, message: EventMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          ...message,
          timestamp: Date.now(),
        }),
      );
    }
  }

  public async destroy(): Promise<void> {
    // Close all connections first
    const closePromises = Object.values(this.connections).map(
      (connection) =>
        new Promise<void>((resolve) => {
          if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.on('close', () => resolve());
            connection.ws.close();
          } else {
            resolve();
          }
        }),
    );

    await Promise.all(closePromises);

    // Then cleanup resources
    await Promise.all(
      [this.graph?.destroy(), this.knowledgeManager.destroy()].filter(Boolean),
    );

    this.connections = {};
    this.graph = null;
  }
}
