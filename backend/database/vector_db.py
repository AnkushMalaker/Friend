import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.models import Distance, VectorParams, Filter, FieldCondition, MatchValue, PointStruct, Range, Condition

from models.memory import Memory
from utils.llm import embeddings

# Constants
COLLECTION_NAME = os.getenv('COLLECTION_NAME', 'omi_memories')
VECTOR_SIZE = 1536  # Default size for text-embedding-3-large (may need to be adjusted based on model)

class VectorDB:
    def __init__(self):
        """Initialize the VectorDB with QdrantClient."""
        self.client = None
        
        if os.getenv('VECTOR_DB_HOST') is not None:
            self.client = QdrantClient(
                host=os.getenv('VECTOR_DB_HOST'),
                port=int(os.getenv('VECTOR_DB_PORT', '6333'))
            )
            
            # Create collection if it doesn't exist
            try:
                if not self.client.collection_exists(COLLECTION_NAME):
                    self.client.create_collection(
                        collection_name=COLLECTION_NAME,
                        vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
                    )
            except Exception as e:
                print(f"Error creating collection: {e}")

    def _get_data(self, uid: str, memory_id: str, vector: List[float]):
        """Format data for Qdrant storage"""
        return {
            "id": f'{uid}-{memory_id}',
            "vector": vector,
            "metadata": {
                'uid': uid,
                'memory_id': memory_id,
                'created_at': int(datetime.now(timezone.utc).timestamp()),
            }
        }

    def upsert_vector(self, uid: str, memory: Memory, vector: List[float]):
        """Upsert a single vector to Qdrant"""
        if not self.client:
            print("Client not initialized")
            return None
            
        data = self._get_data(uid, memory.id, vector)
        point = PointStruct(
            id=data["id"],
            vector=data["vector"],
            payload=data["metadata"]
        )
        res = self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=[point]
        )
        print('upsert_vector', res)
        return res

    def upsert_vector2(self, uid: str, memory: Memory, vector: List[float], metadata: dict):
        """Upsert a single vector with extended metadata to Qdrant"""
        if not self.client:
            print("Client not initialized")
            return None
            
        data = self._get_data(uid, memory.id, vector)
        data['metadata'].update(metadata)
        point = PointStruct(
            id=data["id"],
            vector=data["vector"],
            payload=data["metadata"]
        )
        res = self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=[point]
        )
        print('upsert_vector', res)
        return res

    def update_vector_metadata(self, uid: str, memory_id: str, metadata: dict):
        """Update vector metadata in Qdrant"""
        if not self.client:
            print("Client not initialized")
            return None
            
        metadata['uid'] = uid
        metadata['memory_id'] = memory_id
        point_id = f'{uid}-{memory_id}'
        return self.client.set_payload(
            collection_name=COLLECTION_NAME,
            payload=metadata,
            points=[point_id]
        )

    def upsert_vectors(self, uid: str, vectors: List[List[float]], memories: List[Memory]):
        """Upsert multiple vectors to Qdrant"""
        if not self.client:
            print("Client not initialized")
            return None
            
        points = []
        for memory, vector in zip(memories, vectors):
            data = self._get_data(uid, memory.id, vector)
            points.append(PointStruct(
                id=data["id"],
                vector=data["vector"],
                payload=data["metadata"]
            ))
        
        res = self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
        print('upsert_vectors', res)
        return res

    def query_vectors(self, query: str, uid: str, starts_at: Optional[int] = None, ends_at: Optional[int] = None, k: int = 5) -> List[str]:
        """Query vectors by embedding similarity with basic filtering"""
        if not self.client:
            print("Client not initialized")
            return []
            
        filter_conditions: List[Condition] = [
            FieldCondition(
                key="uid",
                match=MatchValue(value=uid)
            )
        ]
        
        if starts_at is not None and ends_at is not None:
            filter_conditions.append(
                FieldCondition(
                    key="created_at",
                    range=Range(
                        gte=starts_at,
                        lte=ends_at
                    )
                )
            )
        
        # Create the query filter
        query_filter = Filter(
            must=filter_conditions
        )
        
        # Get query embedding
        xq = embeddings.embed_query(query)
        
        # Perform search
        search_results = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=xq,
            query_filter=query_filter,
            limit=k,
            with_payload=True
        )
        
        # Extract memory IDs from results
        result = []
        for item in search_results:
            if item.payload and 'memory_id' in item.payload:
                memory_id = item.payload['memory_id']
                if isinstance(memory_id, str):
                    result.append(memory_id)
        return result

    def query_vectors_by_metadata(
            self, uid: str, vector: List[float], dates_filter: List[datetime], people: List[str], topics: List[str],
            entities: List[str], dates: List[str], limit: int = 5,
    ) -> List[str]:
        """Query vectors by embedding similarity with advanced metadata filtering"""
        if not self.client:
            print("Client not initialized")
            return []
            
        must_conditions: List[Condition] = [
            FieldCondition(
                key="uid",
                match=MatchValue(value=uid)
            )
        ]
        
        should_conditions: List[Condition] = []
        
        # Add conditions for people, topics, entities
        if people or topics or entities:
            for person in people:
                should_conditions.append(
                    FieldCondition(
                        key="people",
                        match=MatchValue(value=person)
                    )
                )
            
            for topic in topics:
                should_conditions.append(
                    FieldCondition(
                        key="topics",
                        match=MatchValue(value=topic)
                    )
                )
            
            for entity in entities:
                should_conditions.append(
                    FieldCondition(
                        key="entities",
                        match=MatchValue(value=entity)
                    )
                )
        
        # Add date range condition
        if dates_filter and len(dates_filter) == 2 and dates_filter[0] and dates_filter[1]:
            print('dates_filter', dates_filter)
            must_conditions.append(
                FieldCondition(
                    key="created_at",
                    range=Range(
                        gte=int(dates_filter[0].timestamp()),
                        lte=int(dates_filter[1].timestamp())
                    )
                )
            )
        
        # Create the query filter
        query_filter = Filter(
            must=must_conditions,
            should=should_conditions
        ) if should_conditions else Filter(must=must_conditions)
        
        print('query_vectors_by_metadata:', json.dumps(query_filter.dict(), default=str))
        
        # Perform search with this filter
        search_results = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=vector,
            query_filter=query_filter,
            limit=10000,  # We'll refine this later
            with_payload=True,
            with_vectors=False
        )
        
        # If no results with filters, try without structured filters
        if not search_results and len(must_conditions) > 1:
            # Simplify filter to just user ID
            simplified_filter = Filter(
                must=[must_conditions[0]]  # Just keep the UID filter
            )
            print('query_vectors_by_metadata retrying without structured filters:', json.dumps(simplified_filter.dict(), default=str))
            
            search_results = self.client.search(
                collection_name=COLLECTION_NAME,
                query_vector=vector,
                query_filter=simplified_filter,
                limit=20,
                with_payload=True,
                with_vectors=False
            )
            
            if not search_results:
                return []
        
        # Post-process results based on metadata matches
        memory_id_to_matches = defaultdict(int)
        memory_ids = []
        
        for item in search_results:
            if not item.payload or 'memory_id' not in item.payload:
                continue
                
            metadata = item.payload
            memory_id = metadata['memory_id']
            if not isinstance(memory_id, str):
                continue
                
            memory_ids.append(memory_id)
            
            for topic in topics:
                topics_list = metadata.get('topics', []) if metadata else []
                if topic in topics_list:
                    memory_id_to_matches[memory_id] += 1
            
            for entity in entities:
                entities_list = metadata.get('entities', []) if metadata else []
                if entity in entities_list:
                    memory_id_to_matches[memory_id] += 1
            
            for person in people:
                people_list = metadata.get('people_mentioned', []) if metadata else []
                if person in people_list:
                    memory_id_to_matches[memory_id] += 1
        
        # Sort memory IDs by match count
        memory_ids.sort(key=lambda x: memory_id_to_matches[x], reverse=True)
        
        print('query_vectors_by_metadata result:', memory_ids)
        return memory_ids[:limit] if len(memory_ids) > limit else memory_ids

    def delete_vector(self, memory_id: str):
        """Delete a vector from Qdrant"""
        if not self.client:
            print("Client not initialized")
            return None
            
        try:
            result = self.client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=models.PointIdsList(
                    points=[memory_id]
                )
            )
            print('delete_vector', result)
            return result
        except Exception as e:
            print(f"Error deleting vector: {e}")
            return None

# Create a singleton instance of VectorDB
_vector_db = VectorDB()
# Refactor into a init_db() function later

# Expose class methods as module-level functions
def upsert_vector(uid: str, memory: Memory, vector: List[float]):
    return _vector_db.upsert_vector(uid, memory, vector)

def upsert_vector2(uid: str, memory: Memory, vector: List[float], metadata: dict):
    return _vector_db.upsert_vector2(uid, memory, vector, metadata)

def update_vector_metadata(uid: str, memory_id: str, metadata: dict):
    return _vector_db.update_vector_metadata(uid, memory_id, metadata)

def upsert_vectors(uid: str, vectors: List[List[float]], memories: List[Memory]):
    return _vector_db.upsert_vectors(uid, vectors, memories)

def query_vectors(query: str, uid: str, starts_at: Optional[int] = None, ends_at: Optional[int] = None, k: int = 5) -> List[str]:
    return _vector_db.query_vectors(query, uid, starts_at, ends_at, k)

def query_vectors_by_metadata(
        uid: str, vector: List[float], dates_filter: List[datetime], people: List[str], topics: List[str],
        entities: List[str], dates: List[str], limit: int = 5) -> List[str]:
    return _vector_db.query_vectors_by_metadata(uid, vector, dates_filter, people, topics, entities, dates, limit)

def delete_vector(memory_id: str):
    return _vector_db.delete_vector(memory_id)
