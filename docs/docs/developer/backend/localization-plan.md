---
title: Omi Backend Localization Plan
description: 'Running Omi with local/open-source services'
---

# Omi Backend Localization Plan

This document outlines a strategy for replacing cloud-based services in the Omi backend with local or open-source alternatives. The goal is to create a more self-hosted, privacy-focused version of the Omi backend that can run entirely on your own infrastructure.
The priority is to get to a fully local quick deploy setup ASAP.

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

## Context Summary

Based on our initial implementation efforts, here are the specific files and modifications needed for Phase 1:

### Key Files to Modify

1. **`backend/utils/llm.py`**
   - This is the central file for LLM integration via LangChain
   - Contains all ChatOpenAI instance definitions and OpenAIEmbeddings configurations

2. **`backend/.env`**
   - Need to add:
   ```
   OPENAI_API_BASE=http://localhost:11434/v1 
   OPENAI_API_KEY=ollama
   ```

### Model Mapping Strategy

We've implemented a model mapping system to translate between OpenAI and Ollama models:

```python
OPENAI_TO_OLLAMA_MODELS = {
    'gpt-4o-mini': 'llama3',       # Using Llama3 as a substitute for gpt-4o-mini
    'gpt-4o': 'llama3:8b',         # Using Llama3 8B as a substitute for gpt-4o
    'o1-preview': 'llama3',        # Using Llama3 as a substitute for o1-preview
    'text-embedding-3-large': 'nomic-embed-text'  # For embeddings
}
```

### Required Ollama Models

For complete functionality, you'll need to download these models:
- `llama3` - Primary chat model (substitute for gpt-4o-mini and o1-preview)
- `llama3:8b` - Medium-sized model (substitute for gpt-4o)
- `nomic-embed-text` - For generating text embeddings

### Implementation Approach

The implementation modifies the LLM instance creation by:
1. Adding a function to dynamically select the appropriate model based on environment
2. Checking for the `OPENAI_API_BASE` environment variable to determine if Ollama should be used
3. Passing the API base URL to all LangChain model instances

This approach allows for a graceful fallback to OpenAI if needed and maintains compatibility with the existing codebase.

### Additional Files Requiring Updates

Beyond the central `utils/llm.py` file, several other files instantiate OpenAI clients directly and need to be updated:

#### Scripts Directory
1. **`backend/scripts/stt/h_brainstorming.py`**
   - Update direct OpenAI client instantiation to use environment variables
   - Replace `client = OpenAI()` with `client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'), base_url=os.getenv('OPENAI_API_BASE'))`

2. **`backend/scripts/users/retrieval.py`**
   - Update ChatOpenAI and OpenAIEmbeddings instantiations to use model mapping
   - Import `get_model_name` from `utils.llm` and apply to all model names

3. **`backend/scripts/rag/_shared.py`**
   - Update OpenAIEmbeddings instantiation to use model mapping

4. **`backend/scripts/nps.py`**
   - Update ChatOpenAI and OpenAIEmbeddings instantiations to use model mapping

#### Utils Directory (outside of llm.py)
1. **`backend/utils/retrieval/graph_realtime.py`** and **`backend/utils/retrieval/graph.py`**
   - Update ChatOpenAI instantiations to use model mapping

2. **`backend/utils/other/chat_file.py`**
   - Ensure OpenAI client initialization respects base URL configuration

#### Plugin Examples
Multiple plugin examples in `plugins/example/` directory contain direct OpenAI client instantiations that need to be updated to support the Ollama API base URL.

The pattern for updates is consistent across files:

1. Import the model mapping function:
   ```python
   from utils.llm import get_model_name
   ```

2. Update OpenAI client instantiations:
   ```python
   client = OpenAI(
       api_key=os.getenv('OPENAI_API_KEY'),
       base_url=os.getenv('OPENAI_API_BASE')
   )
   ```

3. Update ChatOpenAI instantiations:
   ```python
   model = ChatOpenAI(
       model=get_model_name('gpt-4o-mini'),
       openai_api_base=os.getenv('OPENAI_API_BASE')
   )
   ```

4. Update OpenAIEmbeddings instantiations:
   ```python
   embeddings = OpenAIEmbeddings(
       model=get_model_name('text-embedding-3-large'),
       openai_api_base=os.getenv('OPENAI_API_BASE')
   )
   ```

## Chosen Local Alternatives

Based on our analysis, we've selected the following local alternatives to replace Firebase services:

### Database: MongoDB
- Replaces Firestore for document storage
- Maintains similar document structure and query patterns
- Flexible schema for varying memory structures
- Easy migration path from Firestore
- No external API keys required

### Authentication: FastAPI + JWT
- Replaces Firebase Auth with custom FastAPI authentication
- Self-contained solution with no external dependencies
- JWT-based token system for secure authentication
- Built-in password hashing and security features
- Easy integration with MongoDB
- Supports all current auth features:
  - User registration and login
  - Token management
  - Password reset
  - Profile management
  - Session handling

### Storage: Local File System
- Replaces Firebase Storage with local file system
- Uses `STORAGE_PATH` environment variable for configuration
- Volume mounting for containerized deployments
- Simple and secure file management
- No external dependencies

### Messaging: RabbitMQ
- Replaces Firebase Cloud Messaging
- Handles both real-time notifications and background tasks
- Can be containerized easily
- No external API keys required
- Provides reliable message delivery and queue management

### Benefits of This Approach
1. **Minimal External Dependencies**: No need for external API keys or services
2. **Complete Control**: Full control over data and infrastructure
3. **Simplified Architecture**: Fewer moving parts and services to manage
4. **Cost Effective**: No usage-based pricing or external service costs
5. **Privacy Focused**: All data stays within your infrastructure
6. **Document-First**: Maintains document-style storage for flexible data structures
7. **Self-Contained Auth**: Full control over authentication with no external dependencies

### Implementation Considerations
1. **Database Migration**: Need to migrate Firestore data to MongoDB schema
2. **Auth Migration**: 
   - Implement FastAPI auth system
   - Convert Firebase auth tokens to JWT
   - Migrate user data to MongoDB
3. **File Storage**: Implement file handling and serving logic
4. **Message Queue**: Set up RabbitMQ for notification delivery 

## Phase 2 Implementation: Replacing Pinecone with Qdrant

Phase 2 of the localization plan has been successfully implemented. Pinecone has been replaced with Qdrant as the vector database for storing memory embeddings.

### Implementation Details

1. **Modified Files**:
   - `backend/database/vector_db.py`: Replaced Pinecone client with Qdrant client
   - `backend/README.md`: Added documentation for Qdrant setup
   - Created migration script: `backend/scripts/migration/pinecone_to_qdrant.py`
   - Created test script: `backend/scripts/test_qdrant.py`

2. **Docker Compose Configuration**:
   The Docker Compose file already included the Qdrant service:

   ```yaml
   # Vector database (Qdrant)
   vectordb:
     image: qdrant/qdrant:latest
     ports:
       - "6333:6333"
     volumes:
       - qdrant-data:/qdrant/storage
   ```

3. **Environment Variable Changes**:
   - Removed:
     - `PINECONE_API_KEY`
     - `PINECONE_INDEX_NAME`
   - Added:
     - `VECTOR_DB_HOST`: The hostname or IP address of the Qdrant server (default: vectordb for Docker)
     - `VECTOR_DB_PORT`: The port of the Qdrant server (default: 6333)
     - `COLLECTION_NAME`: The name of the collection (default: omi_memories)

4. **API Compatibility**:
   - The public API of the vector database functions remains unchanged
   - All existing code that uses the vector_db module will continue to work
   - Internal implementation has been completely replaced

5. **Data Migration**:
   - Created a migration script to transfer data from Pinecone to Qdrant
   - The script handles:
     - Paginated vector retrieval from Pinecone
     - Metadata preservation
     - Batched uploads to Qdrant

### Testing the Implementation

To test the Qdrant implementation:

1. Start the Qdrant container:
   ```bash
   docker-compose up -d vectordb
   ```

2. Set environment variables:
   ```bash
   export VECTOR_DB_HOST=localhost
   export VECTOR_DB_PORT=6333
   ```

3. Run the test script:
   ```bash
   python backend/scripts/test_qdrant.py
   ```

### Migrating Existing Data

To migrate data from Pinecone to Qdrant:

1. Ensure both Pinecone and Qdrant credentials are available in environment variables
2. Run the migration script:
   ```bash
   python backend/scripts/migration/pinecone_to_qdrant.py
   ```

3. Verify data migration:
   ```bash
   # Connect to Qdrant container
   docker exec -it omi_vectordb_1 bash
   
   # Use Qdrant CLI tools to verify data
   qdrant collections list
   qdrant collections info omi_memories
   ```

### Next Steps

After successfully replacing Pinecone with Qdrant, proceed to Phase 3 to implement a local Redis instance as a replacement for Upstash Redis. 