import React from 'react';

import { Chat } from './components/Chat';
import { URLInput } from './components/URLInput';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const {
    messages,
    connectionStatus,
    isTyping,
    isLoadingDocs,
    docsInfo,
    scrapingProgress,
    sendMessage,
    loadDocumentation,
  } = useWebSocket();

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Chat with Documentation</h1>
        <div style={styles.status}>
          <span
            style={{
              ...styles.statusIndicator,
              backgroundColor:
                connectionStatus === 'connected'
                  ? '#4caf50'
                  : connectionStatus === 'connecting'
                    ? '#ff9800'
                    : '#f44336',
            }}
          />
          <span style={styles.statusText}>
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'}
          </span>
        </div>
      </header>

      <URLInput
        onLoadDocs={loadDocumentation}
        isLoading={isLoadingDocs}
        docsInfo={docsInfo}
        scrapingProgress={scrapingProgress}
      />

      <main style={styles.main}>
        <Chat
          messages={messages}
          onSendMessage={sendMessage}
          isConnected={connectionStatus === 'connected'}
          isTyping={isTyping}
        />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    backgroundColor: '#2c3e50',
    color: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '500',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusIndicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  statusText: {
    fontSize: '14px',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
};

export default App;
