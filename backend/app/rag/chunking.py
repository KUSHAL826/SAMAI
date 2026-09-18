from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_text(text: str, chunk_size: int = 1200, chunk_overlap: int = 150) -> list[str]:
    """Splits cleaned document text into overlapping chunks for embedding.
    Overlap keeps concepts that straddle a chunk boundary retrievable
    from either side (spec section 20)."""
    if not text or not text.strip():
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(text)
    return [c.strip() for c in chunks if c.strip()]
