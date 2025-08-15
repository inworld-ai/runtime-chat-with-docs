import { primitives } from '@inworld/runtime';

import { EMBEDDER_CONFIG } from '../../constants';

const { TextEmbedderFactory } = primitives.embedder;

export interface EmbeddingResult {
  embedding: number[];
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
}

export class EmbedderService {
  private embedder: any;
  private initialized = false;

  constructor(private apiKey: string) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.embedder = await TextEmbedderFactory.createRemote({
        modelName: EMBEDDER_CONFIG.MODEL_NAME,
        provider: EMBEDDER_CONFIG.PROVIDER,
        apiKey: this.apiKey,
      });

      this.initialized = true;
    } catch (error: any) {
      console.error(`[EmbedderService] Initialization failed:`, error.message);
      throw error;
    }
  }

  async embedSingle(text: string): Promise<EmbeddingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const embedding = await this.embedder.embed(text);
      return { embedding };
    } catch (error: any) {
      console.error(
        `[EmbedderService] Single embedding failed:`,
        error.message,
      );
      throw new Error(`Failed to embed text: ${error.message}`);
    }
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBEDDER_CONFIG.BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDER_CONFIG.BATCH_SIZE);

      try {
        const batchEmbeddings = await this.embedder.embedBatch(batch);
        allEmbeddings.push(...batchEmbeddings);
      } catch (error: any) {
        console.error(
          `[EmbedderService] Batch embedding failed:`,
          error.message,
        );
        throw new Error(`Batch embedding failed: ${error.message}`);
      }
    }

    return { embeddings: allEmbeddings };
  }

  async destroy(): Promise<void> {
    if (this.embedder && typeof this.embedder.destroy === 'function') {
      await this.embedder.destroy();
    }
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Utility method for cosine similarity calculation
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
