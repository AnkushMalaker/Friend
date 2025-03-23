# Ollama Integration for Omi Backend

This document describes how to use Ollama as a local alternative to OpenAI for the Omi backend (Phase 1 of the localization plan).

## Prerequisites

- Docker and Docker Compose installed
- At least 8GB of RAM (16GB recommended) for running Llama models

## Setup Instructions

1. Ensure you have the correct configuration in your `.env` file:
   ```
   OPENAI_API_BASE=http://localhost:11434/v1
   OPENAI_API_KEY=ollama
   ```

2. Navigate to the backend directory and start the services using Docker Compose:
   ```bash
   # Navigate to the backend directory
   cd backend
   
   # Start all services including Ollama (as llm-service)
   docker compose up -d
   ```

3. Wait until Ollama initializes (about 10 seconds), then pull the required models:
   ```bash
   # Get the Ollama container ID
   OLLAMA_CONTAINER=$(docker ps -q -f name=llm-service)
   
   # Pull the required models
   docker exec -it $OLLAMA_CONTAINER ollama pull llama3
   docker exec -it $OLLAMA_CONTAINER ollama pull llama3:8b
   docker exec -it $OLLAMA_CONTAINER ollama pull nomic-embed-text
   ```

4. Verify that the models were pulled successfully:
   ```bash
   # List all pulled models
   docker exec -it $OLLAMA_CONTAINER ollama list
   ```

5. Start your Omi backend as usual. It will automatically connect to the Ollama service.

## Model Mapping

The following OpenAI models are mapped to Ollama models:

| OpenAI Model | Ollama Model |
|--------------|--------------|
| gpt-4o-mini | llama3 |
| gpt-4o | llama3:8b |
| o1-preview | llama3 |
| text-embedding-3-large | nomic-embed-text |

## Performance Considerations

- Local models may be slower than cloud-based ones, depending on your hardware
- For best performance, a machine with a GPU is recommended
- Model responses might differ slightly from the OpenAI versions

## Switching Back to OpenAI

To switch back to OpenAI, modify your `.env` file:
1. Comment out or remove the `OPENAI_API_BASE` line
2. Set `OPENAI_API_KEY` to your OpenAI API key 