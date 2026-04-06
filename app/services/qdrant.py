from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings

client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

COLLECTIONS = {
    "company_knowledge": {
        "size": settings.embedding_dimensions,
        "distance": Distance.COSINE,
    },
    "architectural_decisions": {
        "size": settings.embedding_dimensions,
        "distance": Distance.COSINE,
    },
}


async def init_collections():
    """Create Qdrant collections if they don't exist."""
    existing = [c.name for c in client.get_collections().collections]
    for name, params in COLLECTIONS.items():
        if name not in existing:
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=params["size"],
                    distance=params["distance"],
                ),
            )
