import { WebSocket } from 'ws';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
  timestamp?: number;
}

export interface State {
  messages: Message[];
  knowledgeLoaded: boolean;
  documentationUrl?: string;
}

export interface Connection {
  ws: WebSocket;
  state: State;
  sessionId: string;
}

export interface EventMessage {
  type: string;
  data: any;
  timestamp?: number;
}

export interface KnowledgeRecord {
  id: string;
  text: string;
  metadata?: {
    url?: string;
    title?: string;
  };
}
