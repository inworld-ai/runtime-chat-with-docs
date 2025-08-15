import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { WS_APP_PORT } from '../constants';
import { MessageHandler } from './components/message_handler';

const PORT = parseInt(String(WS_APP_PORT), 10);
const API_KEY = process.env.INWORLD_API_KEY;

if (!API_KEY) {
  console.error('INWORLD_API_KEY is required in .env file');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Create message handler
const messageHandler = new MessageHandler(API_KEY);

// Handle WebSocket connections
wss.on('connection', (ws) => {
  messageHandler.handleConnection(ws);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  messageHandler.destroy();
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     Chat with Docs Server Started         ║
╠════════════════════════════════════════════╣
║ HTTP Server:   http://localhost:${PORT}      ║
║ WebSocket:     ws://localhost:${PORT}        ║
╚════════════════════════════════════════════╝

Ready to accept connections...
  `);
});
