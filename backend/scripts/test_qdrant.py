#!/usr/bin/env python
"""
Test script for Qdrant vector database implementation.
This script tests the basic functionality of the Qdrant vector database.
"""

import os
import sys
import random
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

# Add the parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the database module
from database.vector_db import (
    upsert_vector, 
    query_vectors, 
    query_vectors_by_metadata,
    delete_vector
)
from models.memory import Memory

# Load environment variables
load_dotenv()

# Check if the vector database is configured
if not os.getenv('VECTOR_DB_HOST'):
    print("Error: VECTOR_DB_HOST environment variable is not set.")
    print("Please set the following environment variables:")
    print("  VECTOR_DB_HOST: The hostname or IP address of the Qdrant server")
    print("  VECTOR_DB_PORT: The port of the Qdrant server (default: 6333)")
    print("  COLLECTION_NAME: The name of the collection (default: omi_memories)")
    sys.exit(1)

def create_test_memory(uid, memory_id=None):
    """Create a test memory object"""
    if memory_id is None:
        memory_id = str(uuid.uuid4())
    
    return Memory(
        id=memory_id,
        text=f"This is a test memory {memory_id}",
        created_at=int(datetime.now(timezone.utc).timestamp()),
        updated_at=int(datetime.now(timezone.utc).timestamp()),
        type="session"
    )

def create_random_vector(size=1536):
    """Create a random vector of the specified size"""
    return [random.uniform(-1, 1) for _ in range(size)]

def test_upsert_and_query():
    """Test upserting and querying vectors"""
    print("\n=== Testing Upsert and Query ===")
    
    # Create a test user ID
    uid = f"test-user-{uuid.uuid4()}"
    print(f"Using test UID: {uid}")
    
    # Create test memories
    memories = []
    vectors = []
    for i in range(5):
        memory_id = f"test-memory-{i}"
        memory = create_test_memory(uid, memory_id)
        vector = create_random_vector()
        
        memories.append(memory)
        vectors.append(vector)
        
        print(f"Creating test memory {i+1}/5: {memory_id}")
        upsert_vector(uid, memory, vector)
    
    # Test query_vectors
    print("\nTesting query_vectors...")
    query = "test query"
    results = query_vectors(query, uid, k=3)
    print(f"Query results: {results}")
    
    # Clean up
    print("\nCleaning up test data...")
    for memory in memories:
        delete_vector(f"{uid}-{memory.id}")
    
    print("Test completed successfully!")

def test_metadata_query():
    """Test querying vectors by metadata"""
    print("\n=== Testing Metadata Query ===")
    
    # Create a test user ID
    uid = f"test-user-{uuid.uuid4()}"
    print(f"Using test UID: {uid}")
    
    # Create test memories with metadata
    memories = []
    vectors = []
    
    # Create 5 memories with different metadata
    topics = ["AI", "Machine Learning", "Vector Databases", "Embeddings", "Semantic Search"]
    people = ["Alice", "Bob", "Charlie", "Dave", "Eve"]
    entities = ["Qdrant", "Pinecone", "Omi", "OpenAI", "Langchain"]
    
    for i in range(5):
        memory_id = f"test-metadata-{i}"
        memory = create_test_memory(uid, memory_id)
        vector = create_random_vector()
        
        # Create metadata
        metadata = {
            "topics": [topics[i]],
            "people": [people[i]],
            "entities": [entities[i]],
            "people_mentioned": [people[i]]
        }
        
        memories.append(memory)
        vectors.append(vector)
        
        from database.vector_db import upsert_vector2
        print(f"Creating test memory with metadata {i+1}/5: {memory_id}")
        upsert_vector2(uid, memory, vector, metadata)
    
    # Test query_vectors_by_metadata with different filter conditions
    print("\nTesting query_vectors_by_metadata...")
    
    # Filter by topic
    print("\n- Testing filter by topic...")
    results = query_vectors_by_metadata(
        uid=uid,
        vector=create_random_vector(),
        dates_filter=[],
        people=[],
        topics=["AI"],
        entities=[],
        dates=[]
    )
    print(f"Query results (topic=AI): {results}")
    
    # Filter by person
    print("\n- Testing filter by person...")
    results = query_vectors_by_metadata(
        uid=uid,
        vector=create_random_vector(),
        dates_filter=[],
        people=["Bob"],
        topics=[],
        entities=[],
        dates=[]
    )
    print(f"Query results (person=Bob): {results}")
    
    # Filter by entity
    print("\n- Testing filter by entity...")
    results = query_vectors_by_metadata(
        uid=uid,
        vector=create_random_vector(),
        dates_filter=[],
        people=[],
        topics=[],
        entities=["Omi"],
        dates=[]
    )
    print(f"Query results (entity=Omi): {results}")
    
    # Clean up
    print("\nCleaning up test data...")
    for memory in memories:
        delete_vector(f"{uid}-{memory.id}")
    
    print("Test completed successfully!")

if __name__ == "__main__":
    print("=== Qdrant Vector Database Test ===")
    test_upsert_and_query()
    test_metadata_query()
    print("\nAll tests completed successfully!") 