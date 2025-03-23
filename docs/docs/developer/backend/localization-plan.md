---
title: Omi Backend Localization Plan
description: 'Running Omi with local/open-source services'
---

# Omi Backend Localization Plan

This document outlines a strategy for replacing cloud-based services in the Omi backend with local or open-source alternatives. The goal is to create a more self-hosted, privacy-focused version of the Omi backend that can run entirely on your own infrastructure.

## Overview of Dependencies

The Omi backend currently relies on several external cloud services:

1. **Google Cloud & Firebase** - Authentication, storage, and project management
2. **OpenAI API** - Language models for chat and memory processing
3. **Deepgram API** - Speech-to-text conversion
4. **Pinecone** - Vector database for storing memory embeddings
5. **Redis (Upstash)** - Caching and real-time data
6. **Typesense** - Search functionality
7. **Hugging Face** - Voice activity detection models

## Localization Strategy

We'll approach this service by service, starting with the easiest to replace:

### Phase 1: Replace OpenAI with Ollama

Ollama provides a compatible API interface to OpenAI, making it a straightforward replacement for language model functionality. Models like Llama3, Mistral, or Phi can be used depending on your hardware capabilities.

#### Implementation Plan:

1. Set up Ollama in a Docker container
2. Configure the Omi backend to use the Ollama endpoint instead of OpenAI
3. Test basic chat functionality
4. Ensure memory embedding generation works

### Phase 2: Local Vector Database (Replace Pinecone)

Replace Pinecone with an open-source vector database such as:
- Qdrant
- Weaviate
- Milvus
- ChromaDB

This will require adapting the Omi code to work with the chosen vector database's API.

### Phase 3: Local Redis

Replace Upstash Redis with a self-hosted Redis instance for caching and real-time data storage.

### Phase 4: Local Typesense

Set up a local Typesense instance for search functionality.

### Phase 5: Speech-to-Text Alternative

Replace Deepgram with an open-source speech-to-text solution like:
- Whisper (local)
- Coqui STT
- Mozilla DeepSpeech

### Phase 6: Firebase Alternative

This is the most complex replacement. Options include:
- PostgreSQL or MongoDB for data storage
- Keycloak or Supabase for authentication

## Docker Compose Architecture

Below is a conceptual Docker Compose architecture that will be implemented incrementally:

```yaml
version: '3.8'

services:
  # Main Omi backend
  omi-backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8080"
    environment:
      - REDIS_DB_HOST=redis
      - REDIS_DB_PORT=6379
      - REDIS_DB_PASSWORD=yourpassword
      - VECTOR_DB_HOST=vectordb
      - VECTOR_DB_PORT=6333
      - TYPESENSE_HOST=typesense
      - TYPESENSE_HOST_PORT=8108
      - TYPESENSE_API_KEY=xyz
      - OPENAI_API_BASE=http://ollama:11434/v1
      - OPENAI_API_KEY=ollama
    volumes:
      - ./backend:/app
    depends_on:
      - redis
      - vectordb
      - typesense
      - ollama

  # Redis for caching and real-time data
  redis:
    image: redis:7
    ports:
      - "6379:6379"
    command: redis-server --requirepass yourpassword
    volumes:
      - redis-data:/data

  # Vector database (Qdrant as an example)
  vectordb:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage

  # Typesense for search
  typesense:
    image: typesense/typesense:0.24.1
    ports:
      - "8108:8108"
    environment:
      - TYPESENSE_API_KEY=xyz
      - TYPESENSE_DATA_DIR=/data
    volumes:
      - typesense-data:/data

  # Local LLM service (Ollama)
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  redis-data:
  qdrant-data:
  typesense-data:
  ollama-data:
```

## Phase 1 Implementation: OpenAI to Ollama

### Step 1: Create a basic docker-compose.yml

Create a file `docker-compose.yml` in the root of the project with just the Ollama service:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  ollama-data:
```

### Step 2: Start Ollama and pull required models

```bash
docker compose up -d
docker exec -it <container_id> ollama pull llama3
```

### Step 3: Update the Omi backend configuration

Modify the `.env` file to point to your local Ollama instance:

```
OPENAI_API_BASE=http://localhost:11434/v1
OPENAI_API_KEY=ollama
```

### Step 4: Test the integration

Use the Omi API endpoints that interact with OpenAI to verify that they now work with Ollama.

## Challenges and Considerations

1. **Performance**: Local LLMs may be slower than cloud-based ones, depending on your hardware.
2. **API Compatibility**: Ollama's OpenAI-compatible API may not support all features used by Omi.
3. **Embedding Models**: Ensure that the embedding models used for vector storage are compatible with your local setup.
4. **Code Modifications**: Some code may need to be adjusted to work with the local alternatives.

## Next Steps

After successfully replacing OpenAI with Ollama, proceed to Phase 2 to implement a local vector database as a replacement for Pinecone. 