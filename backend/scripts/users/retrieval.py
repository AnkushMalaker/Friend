import os
import threading

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from models.memory import Memory
from utils.llm import get_model_name

# Use environment base URL if available
api_base = os.environ.get('OPENAI_API_BASE', None)

llm_mini = ChatOpenAI(
    model=get_model_name('gpt-4o-mini'),
    openai_api_base=api_base
)
embeddings = OpenAIEmbeddings(
    model=get_model_name("text-embedding-3-large"),
    openai_api_base=api_base
)

load_dotenv('../../.env')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '../../' + os.getenv('GOOGLE_APPLICATION_CREDENTIALS')

from database._client import get_users_uid
import database.memories as memories_db
from utils.memories.process_memory import save_structured_vector
from database.redis_db import has_migrated_retrieval_memory_id, save_migrated_retrieval_memory_id

if __name__ == '__main__':
    def single(uid, memory, update):
        save_structured_vector(uid, memory, update)
        save_migrated_retrieval_memory_id(memory.id)


    uids = get_users_uid()
    for uid in uids:
        memories = memories_db.get_memories(uid, limit=2000)
        threads = []
        for memory in memories:
            if has_migrated_retrieval_memory_id(memory['id']):
                print('Skipping', memory['id'])
                continue

            threads.append(threading.Thread(target=single, args=(uid, Memory(**memory), True)))
            if len(threads) == 20:
                [t.start() for t in threads]
                [t.join() for t in threads]
                threads = []

        [t.start() for t in threads]
        [t.join() for t in threads]
