from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings

client = QdrantClient(
    url=f"http://{settings.qdrant_host}:{settings.qdrant_port}",
    api_key=settings.qdrant_api_key or None,
    timeout=60,
)

COLLECTIONS = {
    "company_knowledge": {
        "size": settings.embedding_dimensions,
        "distance": Distance.COSINE,
    },
    "architectural_decisions": {
        "size": settings.embedding_dimensions,
        "distance": Distance.COSINE,
    },
    "memories": {
        # Memórias canônicas indexadas semanticamente para busca por
        # similaridade — usado pelo conflict_detector para encontrar
        # memórias relacionadas ao diff (não só por overlap de tokens).
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
