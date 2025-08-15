# Chat with Documentation Application

This README guides you through setting up and running the Chat with Documentation application, which demonstrates how to scrape documentation websites and use Inworld's Knowledge nodes to provide accurate, context-aware responses.

## Prerequisites

- Node.js 18 or higher

## Project Structure

The application consists of two main components:

- **server**: Handles documentation scraping, knowledge management, and communication with Inworld's services

- **client**: Provides a user interface for loading documentation and chatting with the AI

## Setup

### Environment Variables

Copy `server/.env-sample` to `server/.env` and configure your settings:

```bash
cd server
cp .env-sample .env
# Edit .env and add your INWORLD_API_KEY + modify other vars if you want
```

### Install Dependencies and run the application

Install dependencies for both server and client:

```bash
# Install server dependencies
cd server
yarn install

# Start the server
yarn start
```

The server will start on port 3001.

```bash
# Install client dependencies
cd ../client
yarn install
yarn start
```

The client will start on port 3000 and should automatically open in your default browser.

## Using the Application

1. Load documentation:
   - Enter a documentation URL (e.g., `https://docs.inworld.ai/docs/introduction`)

   - Click "Load Documentation" and wait for the scraping to complete

   - The system will display the number of pages and knowledge records created

2. Start chatting:
   - Once documentation is loaded, type your questions in the chat input

   - The AI will respond based on the loaded documentation

   - If no relevant documentation is found, you'll be prompted to load a different URL

## Troubleshooting

- If you encounter connection issues, ensure both server and client are running. Server should be running on port 3001 and client on port 3000.

- Check that your API key is valid and properly set in the .env file.

- If documentation loading fails, verify the URL is accessible and contains scrapable content. Some sites may block automated scraping.

- For sites without sitemap.xml, the crawler will attempt to discover pages by following links from the base URL.

## Architecture

The application implements a custom RAG pipeline using Inworld Runtime:

```
ProxyNode → QueryEmbedderNode → KnowledgeRetrievalNode → JinjaPromptRenderNode → RemoteLLMChatNode
```

This demonstrates:

- Custom node implementation for specialized RAG workflows
- Pre-computed embeddings for efficient knowledge retrieval
- Jinja templating for dynamic prompt generation
- Streaming LLM responses with conversation history

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.