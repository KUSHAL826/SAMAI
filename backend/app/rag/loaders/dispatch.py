from app.rag.loaders import doc_processor, pdf_processor, spreadsheet_processor, text_processor

_SPREADSHEET_TYPES = {"csv", "xls", "xlsx"}
_WORD_TYPES = {"doc", "docx"}


def extract_text(file_bytes: bytes, file_type: str) -> str:
    """Single entry point for document processing -- keeps processors
    modular so a new file type only needs one new function (spec section 21)."""
    file_type = file_type.lower().lstrip(".")

    if file_type == "pdf":
        return pdf_processor.extract_text(file_bytes)
    if file_type in _WORD_TYPES:
        return doc_processor.extract_text(file_bytes)
    if file_type in _SPREADSHEET_TYPES:
        return spreadsheet_processor.extract_text(file_bytes, file_type)
    if file_type == "txt":
        return text_processor.extract_text(file_bytes)

    raise ValueError(f"Unsupported file type: {file_type}")
