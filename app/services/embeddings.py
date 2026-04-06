from fastembed import TextEmbedding

from app.core.config import settings

_model: TextEmbedding | None = None


def get_embedding_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=settings.embedding_model)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    model = get_embedding_model()
    return list(model.embed(texts))


def embed_query(query: str) -> list[float]:
    """Generate embedding for a single search query."""
    model = get_embedding_model()
    return list(model.query_embed(query))[0].tolist()
