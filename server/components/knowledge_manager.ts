import { KNOWLEDGE_CONFIG } from '../../constants';
import { EmbedderService } from './embedder_service';
import { ScrapedPage } from './scraper';

export interface EmbeddedKnowledgeRecord {
  text: string;
  embedding: number[];
}

export class KnowledgeManager {
  private embeddedRecords: EmbeddedKnowledgeRecord[] = [];
  private embedderService: EmbedderService;

  constructor(apiKey: string) {
    this.embedderService = new EmbedderService(apiKey);
  }

  private chunkText(
    text: string,
    maxChars: number = KNOWLEDGE_CONFIG.MAX_CHARS_PER_CHUNK,
  ): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxChars) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // If single sentence is too long, split it
        if (sentence.length > maxChars) {
          const words = sentence.split(' ');
          let tempChunk = '';
          for (const word of words) {
            if ((tempChunk + ' ' + word).length <= maxChars) {
              tempChunk = tempChunk ? tempChunk + ' ' + word : word;
            } else {
              if (tempChunk) chunks.push(tempChunk.trim());
              tempChunk = word;
            }
          }
          if (tempChunk) currentChunk = tempChunk;
        } else {
          currentChunk = sentence;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  public async loadDocumentationWithEmbeddings(
    pages: ScrapedPage[],
  ): Promise<void> {
    this.embeddedRecords = [];

    await this.embedderService.initialize();

    // Collect all text chunks from all pages
    const texts: string[] = [];
    for (const page of pages) {
      const chunks = this.chunkText(page.content);
      texts.push(...chunks);
    }

    // Filter out empty/invalid chunks 
    const validTexts = texts.filter((text) => text.trim().length >= 10);

    if (validTexts.length === 0) {
      throw new Error('No valid text chunks found for embedding');
    }

    // Perform batch embedding
    const batchResult = await this.embedderService.embedBatch(validTexts);

    // Create embedded records directly
    let failureCount = 0;
    
    for (let i = 0; i < validTexts.length; i++) {
      const embedding = batchResult.embeddings[i];

      if (embedding && embedding.length > 0) {
        this.embeddedRecords.push({
          text: validTexts[i],
          embedding: embedding,
        });
      } else {
        failureCount++;
      }
    }

    // Fail if too many embeddings failed (API key or batch size issue)
    const failureRate = failureCount / validTexts.length;
    if (failureRate > 0.5) {
      throw new Error(`Embedding failure rate too high: ${Math.round(failureRate * 100)}% (${failureCount}/${validTexts.length}).`);
    }

  }

  public getEmbeddedRecords(): EmbeddedKnowledgeRecord[] {
    return this.embeddedRecords;
  }

  public hasEmbeddings(): boolean {
    return this.embeddedRecords.length > 0;
  }

  public clear(): void {
    this.embeddedRecords = [];
  }

  public async destroy(): Promise<void> {
    await this.embedderService.destroy();
    this.clear();
  }
}
