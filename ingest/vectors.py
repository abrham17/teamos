import logging
from django.conf import settings
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from openai import OpenAI

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self):
        self.qdrant = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )
        self.openai = None
        if settings.OPENAI_API_KEY:
            self.openai = OpenAI(api_key=settings.OPENAI_API_KEY)

    def _get_embedding(self, text: str, model: str = "text-embedding-3-small"):
        if not self.openai:
            # Mock embedding (all zeros) if no API key
            logger.warning("No OpenAI API key found, using mock embeddings.")
            return [0.0] * 1536
        
        response = self.openai.embeddings.create(
            input=[text.replace("\n", " ")],
            model=model
        )
        return response.data[0].embedding

    def ensure_collection(self, team_id: str, vector_size: int = 1536):
        collection_name = f"team_{team_id}"
        collections = self.qdrant.get_collections().collections
        if not any(c.name == collection_name for c in collections):
            logger.info(f"Creating Qdrant collection: {collection_name}")
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=rest.VectorParams(
                    size=vector_size,
                    distance=rest.Distance.COSINE
                ),
            )
        return collection_name

    def upsert_chunks(self, team_id: str, page_id: str, chunks_data: list):
        """
        chunks_data: list of dicts with {id, content, index, title}
        """
        collection_name = self.ensure_collection(str(team_id))
        points = []
        
        for chunk in chunks_data:
            vector = self._get_embedding(chunk["content"])
            points.append(
                rest.PointStruct(
                    id=chunk["id"],
                    vector=vector,
                    payload={
                        "page_id": str(page_id),
                        "page_title": chunk["title"],
                        "chunk_index": chunk["index"],
                        "content": chunk["content"],
                        "team_id": str(team_id)
                    }
                )
            )
        
        self.qdrant.upsert(
            collection_name=collection_name,
            points=points
        )
    def search_similar_pages(self, team_id: str, query_text: str, limit: int = 5):
        collection_name = self.ensure_collection(str(team_id))
        vector = self._get_embedding(query_text)
        
        results = self.qdrant.search(
            collection_name=collection_name,
            query_vector=vector,
            limit=limit,
            with_payload=True
        )
        
        return results

vector_store = VectorStore()
