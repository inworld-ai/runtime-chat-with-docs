export const WS_APP_PORT = 3001;

export const LLM_MODEL_NAME = 'gemini-2.5-flash-lite';
export const LLM_PROVIDER = 'google';

export const TEXT_GENERATION_CONFIG = {
  maxNewTokens: 500,
  maxPromptLength: 4000,
  repetitionPenalty: 1,
  topP: 0.9,
  temperature: 0.1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: [],
};

export const EMBEDDER_CONFIG = {
  MODEL_NAME: 'BAAI/bge-large-en-v1.5',
  PROVIDER: 'inworld',
  BATCH_SIZE: 100,
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,
};

export const KNOWLEDGE_CONFIG = {
  // Text chunking
  MAX_CHARS_PER_CHUNK: 600,
  MAX_CHUNKS_PER_DOCUMENT: 1000,

  // Retrieval settings
  RETRIEVAL_TOP_K: 5,
  RETRIEVAL_THRESHOLD: 0.5,
};

export const SCRAPER_MAX_PAGES = 100;
export const MAX_CONVERSATION_HISTORY = 10;
