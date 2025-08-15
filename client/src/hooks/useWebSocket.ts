import { useCallback, useEffect, useRef, useState } from 'react';

import { WS_APP_PORT } from '../../../constants';
import {
  ConnectionStatus,
  DocsInfo,
  Message,
  WebSocketMessage,
} from '../types';

// WebSocket URL
export const WS_URL = `ws://localhost:${WS_APP_PORT}`;

export const useWebSocket = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsInfo, setDocsInfo] = useState<DocsInfo | undefined>();
  const [scrapingProgress, setScrapingProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
    title: string;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const currentAssistantMessage = useRef<string>('');
  const currentAssistantId = useRef<string>('');

  const connect = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            setSessionId(message.data.sessionId);
            break;

          case 'message':
            if (message.data.role !== 'user') {
              setMessages((prev) => [...prev, message.data]);
            }
            break;

          case 'message_start':
            setIsTyping(true);
            currentAssistantMessage.current = message.data.content;
            currentAssistantId.current = message.data.id;
            setMessages((prev) => [
              ...prev,
              {
                id: message.data.id,
                role: message.data.role,
                content: message.data.content,
              },
            ]);
            break;

          case 'message_chunk':
            currentAssistantMessage.current += message.data.content;
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (
                lastMessage &&
                lastMessage.id === currentAssistantId.current
              ) {
                lastMessage.content = currentAssistantMessage.current;
              }
              return newMessages;
            });
            break;

          case 'message_end':
            setIsTyping(false);
            currentAssistantMessage.current = '';
            currentAssistantId.current = '';
            break;

          case 'clear_messages':
            setMessages([]);
            setDocsInfo(undefined);
            break;

          case 'loading_docs':
            setIsLoadingDocs(true);
            setScrapingProgress(null);
            break;

          case 'scraping_progress':
            setScrapingProgress({
              current: message.data.current,
              total: message.data.total,
              percentage: message.data.percentage,
              title: message.data.title,
            });
            break;

          case 'docs_loaded':
            setIsLoadingDocs(false);
            setScrapingProgress(null);
            setDocsInfo({
              url: message.data.url,
              pageCount: message.data.pageCount,
              recordCount: message.data.recordCount,
            });
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system',
                content: `Documentation loaded successfully! I now have access to ${message.data.pageCount} pages from ${message.data.url}.`,
              },
            ]);
            break;

          case 'error':
            console.error('Server error:', message.data.error);
            setIsLoadingDocs(false);
            setIsTyping(false);
            // Add error message to chat
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system',
                content: `⚠️ ${message.data.error}`,
              },
            ]);
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');

      // Only reconnect if this is still the current WebSocket
      if (wsRef.current === ws) {
        wsRef.current = null;

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: content,
      };
      setMessages((prev) => [...prev, userMessage]);

      wsRef.current.send(
        JSON.stringify({
          type: 'chat',
          data: { message: content },
        }),
      );
    }
  }, []);

  const loadDocumentation = useCallback((url: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'load_docs',
          data: { url },
        }),
      );
    }
  }, []);

  useEffect(() => {
    // Small delay to ensure only one connection in StrictMode
    const connectTimeout = setTimeout(() => {
      connect();
    }, 100);

    return () => {
      clearTimeout(connectTimeout);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    connectionStatus,
    isTyping,
    isLoadingDocs,
    docsInfo,
    sessionId,
    scrapingProgress,
    sendMessage,
    loadDocumentation,
  };
};
