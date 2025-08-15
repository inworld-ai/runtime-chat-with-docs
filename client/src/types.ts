export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface DocsInfo {
  url: string;
  pageCount: number;
  recordCount: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: number;
}
