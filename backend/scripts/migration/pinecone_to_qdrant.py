import os
import argparse
from tqdm import tqdm
from dotenv import load_dotenv

from pinecone import Pinecone
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct

# Load environment variables
load_dotenv()

# Default values
PINECONE_NAMESPACE = "ns1"
DEFAULT_COLLECTION_NAME = "omi_memories"
DEFAULT_VECTOR_SIZE = 1536
BATCH_SIZE = 100


def migrate_pinecone_to_qdrant(
    pinecone_api_key=None,
    pinecone_index_name=None,
    qdrant_host=None,
    qdrant_port=None,
    collection_name=None,
    vector_size=None
):
    """
    Migrate data from Pinecone to Qdrant.
    
    Args:
        pinecone_api_key: Pinecone API key
        pinecone_index_name: Pinecone index name
        qdrant_host: Qdrant host
        qdrant_port: Qdrant port
        collection_name: Qdrant collection name
        vector_size: Vector size for the collection
    """
    # Get values from environment variables if not provided
    pinecone_api_key = pinecone_api_key or os.getenv('PINECONE_API_KEY')
    pinecone_index_name = pinecone_index_name or os.getenv('PINECONE_INDEX_NAME')
    qdrant_host = qdrant_host or os.getenv('VECTOR_DB_HOST')
    qdrant_port = int(qdrant_port or os.getenv('VECTOR_DB_PORT', '6333'))
    collection_name = collection_name or os.getenv('COLLECTION_NAME', DEFAULT_COLLECTION_NAME)
    vector_size = int(vector_size or os.getenv('VECTOR_SIZE', DEFAULT_VECTOR_SIZE))
    
    # Validate required parameters
    if not pinecone_api_key or not pinecone_index_name:
        raise ValueError("Pinecone API key and index name are required")
    
    if not qdrant_host:
        raise ValueError("Qdrant host is required")
    
    # Initialize Pinecone
    print(f"Connecting to Pinecone index: {pinecone_index_name}")
    pc = Pinecone(api_key=pinecone_api_key)
    index = pc.Index(pinecone_index_name)
    
    # Initialize Qdrant
    print(f"Connecting to Qdrant at {qdrant_host}:{qdrant_port}")
    qdrant_client = QdrantClient(host=qdrant_host, port=qdrant_port)
    
    # Create collection if it doesn't exist
    if not qdrant_client.collection_exists(collection_name):
        print(f"Creating Qdrant collection: {collection_name}")
        qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
    
    # Get stats from Pinecone to prepare for migration
    stats = index.describe_index_stats()
    total_vectors = stats.get('total_vector_count', 0)
    print(f"Found {total_vectors} vectors in Pinecone index")
    
    if total_vectors == 0:
        print("No vectors to migrate")
        return
    
    # Fetch and migrate vectors in batches
    print("Starting migration...")
    
    # Initialize pagination
    paginate_ids = None
    total_migrated = 0
    
    with tqdm(total=total_vectors, desc="Migrating vectors") as pbar:
        while True:
            # Fetch a batch of vectors from Pinecone
            query_response = index.query(
                vector=[0.0] * vector_size,  # Dummy vector for fetching
                top_k=BATCH_SIZE,
                include_values=True,
                include_metadata=True,
                namespace=PINECONE_NAMESPACE,
                filter={},  # No filter to get all vectors
                paginate_ids=paginate_ids,
            )
            
            matches = query_response.get('matches', [])
            if not matches:
                break
            
            # Prepare points for Qdrant
            points = []
            for item in matches:
                vector_id = item.get('id')
                vector = item.get('values', [])
                metadata = item.get('metadata', {})
                
                points.append(PointStruct(
                    id=vector_id,
                    vector=vector,
                    payload=metadata
                ))
            
            # Upsert points to Qdrant
            if points:
                qdrant_client.upsert(
                    collection_name=collection_name,
                    points=points
                )
            
            # Update progress
            total_migrated += len(points)
            pbar.update(len(points))
            
            # Update pagination for next batch
            if len(matches) < BATCH_SIZE:
                break
            
            paginate_ids = matches[-1].get('id')
    
    print(f"Migration complete. Migrated {total_migrated} vectors to Qdrant.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Migrate data from Pinecone to Qdrant')
    parser.add_argument('--pinecone-api-key', help='Pinecone API key')
    parser.add_argument('--pinecone-index-name', help='Pinecone index name')
    parser.add_argument('--qdrant-host', help='Qdrant host')
    parser.add_argument('--qdrant-port', help='Qdrant port')
    parser.add_argument('--collection-name', help='Qdrant collection name')
    parser.add_argument('--vector-size', help='Vector size for the collection')
    
    args = parser.parse_args()
    
    migrate_pinecone_to_qdrant(
        pinecone_api_key=args.pinecone_api_key,
        pinecone_index_name=args.pinecone_index_name,
        qdrant_host=args.qdrant_host,
        qdrant_port=args.qdrant_port,
        collection_name=args.collection_name,
        vector_size=args.vector_size
    ) 