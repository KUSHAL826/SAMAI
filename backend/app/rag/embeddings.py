from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.core.config import get_settings

settings = get_settings()

_embeddings_client: GoogleGenerativeAIEmbeddings | None = None


def get_embeddings_client() -> GoogleGenerativeAIEmbeddings:
    global _embeddings_client
    if _embeddings_client is None:
        _embeddings_client = GoogleGenerativeAIEmbeddings(
            model=settings.GEMINI_EMBEDDING_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
        )
    return _embeddings_client


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Batch-embeds chunk text for storage in pgvector. Batching (rather
    than one call per chunk) keeps Gemini API cost and latency down."""
    if not texts:
        return []
    client = get_embeddings_client()
    return client.embed_documents(texts)


def embed_query(text: str) -> list[float]:
    """Embeds a single query string (e.g. a topic name) for similarity search."""
    client = get_embeddings_client()
    return client.embed_query(text)
