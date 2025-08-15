import React, { useState } from 'react';

interface URLInputProps {
  onLoadDocs: (url: string) => void;
  isLoading: boolean;
  docsInfo?: {
    url: string;
    pageCount: number;
    recordCount: number;
  };
  scrapingProgress?: {
    current: number;
    total: number;
    percentage: number;
    title: string;
  } | null;
}

export const URLInput: React.FC<URLInputProps> = ({
  onLoadDocs,
  isLoading,
  docsInfo,
  scrapingProgress,
}) => {
  const [url, setUrl] = useState('https://docs.inworld.ai/docs/introduction');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url && !isLoading) {
      onLoadDocs(url);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter documentation URL (e.g., https://docs.inworld.ai/docs/introduction)"
          style={styles.input}
          disabled={isLoading}
          required
        />
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Load Documentation'}
        </button>
      </form>

      {scrapingProgress && (
        <div style={styles.progressContainer}>
          <div style={styles.progressText}>
            Scraping page {scrapingProgress.current} of {scrapingProgress.total}{' '}
            ({scrapingProgress.percentage}%)
          </div>
          <div style={styles.progressTitle}>{scrapingProgress.title}</div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${scrapingProgress.percentage}%`,
              }}
            />
          </div>
        </div>
      )}

      {docsInfo && (
        <div style={styles.info}>
          <span style={styles.infoText}>✅ Loaded: {docsInfo.url}</span>
          <span style={styles.infoStats}>
            {docsInfo.pageCount} pages | {docsInfo.recordCount} knowledge
            records
          </span>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  form: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
  },
  input: {
    flex: 1,
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    outline: 'none',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  info: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
  },
  infoText: {
    fontSize: '14px',
    color: '#2e7d32',
  },
  infoStats: {
    fontSize: '12px',
    color: '#666',
  },
  progressContainer: {
    padding: '12px',
    backgroundColor: '#fff3cd',
    borderRadius: '4px',
    border: '1px solid #ffeaa7',
    marginBottom: '10px',
  },
  progressText: {
    fontSize: '14px',
    color: '#856404',
    marginBottom: '4px',
    fontWeight: 'bold',
  },
  progressTitle: {
    fontSize: '12px',
    color: '#6c757d',
    marginBottom: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#f8f9fa',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffc107',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
};
