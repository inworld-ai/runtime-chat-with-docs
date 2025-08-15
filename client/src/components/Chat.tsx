import React, { useEffect, useRef, useState } from 'react';

import { Message } from '../types';

interface ChatProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  isTyping: boolean;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  onSendMessage,
  isConnected,
  isTyping,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && isConnected) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.messagesContainer}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              ...styles.messageWrapper,
              justifyContent:
                message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                ...styles.message,
                ...(message.role === 'user'
                  ? styles.userMessage
                  : styles.assistantMessage),
              }}
            >
              <div style={styles.messageContent}>{message.content}</div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={styles.messageWrapper}>
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.typingIndicator}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isConnected ? 'Type your message...' : 'Initializing...'}
          style={styles.input}
          disabled={!isConnected}
        />
        <button
          type="submit"
          style={styles.sendButton}
          disabled={!isConnected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  messagesContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
    backgroundColor: '#ffffff',
  },
  messageWrapper: {
    display: 'flex',
    marginBottom: '15px',
  },
  message: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: '12px',
    wordWrap: 'break-word',
  },
  userMessage: {
    backgroundColor: '#007bff',
    color: 'white',
    marginLeft: 'auto',
  },
  assistantMessage: {
    backgroundColor: '#f1f3f5',
    color: '#333',
  },
  messageContent: {
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },
  inputForm: {
    display: 'flex',
    padding: '20px',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  input: {
    flex: 1,
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginRight: '10px',
    outline: 'none',
  },
  sendButton: {
    padding: '12px 24px',
    fontSize: '14px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
};
