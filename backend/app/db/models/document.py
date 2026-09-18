import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin

settings = get_settings()


class DocumentType(str, enum.Enum):
    TABLE_OF_CONTENTS = "table_of_contents"
    TEXTBOOK = "textbook"
    EXPLANATION = "explanation"
    EXAM_PATTERN = "exam_pattern"
    SAMPLE_QUESTIONS = "sample_questions"
    SAMPLE_QUESTION_PAPER = "sample_question_paper"


class DocumentStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    ARCHIVED = "archived"


class Document(Base, UUIDPKMixin, TimestampMixin):
    """Metadata only. The actual file bytes live in object storage
    (local disk in dev, Cloudflare R2 in production) -- see core/storage.py."""

    __tablename__ = "documents"

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)  # pdf, docx, csv, ...
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)

    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_types.id"), index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True
    )
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id"), nullable=True
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True
    )

    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type_enum"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status_enum"),
        default=DocumentStatus.UPLOADED,
        nullable=False,
    )

    chunks: Mapped[list["DocumentChunk"]] = relationship(back_populates="document")
    versions: Mapped[list["DocumentVersion"]] = relationship(back_populates="document")


class DocumentVersion(Base, UUIDPKMixin, TimestampMixin):
    """Keeps history when an admin re-uploads a corrected version of a document."""

    __tablename__ = "document_versions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)

    document: Mapped["Document"] = relationship(back_populates="versions")


class DocumentChunk(Base, UUIDPKMixin, TimestampMixin):
    """One retrievable, embedded chunk of an approved document.
    This is what the RAG retriever actually searches (spec sections 20, 55)."""

    __tablename__ = "document_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Denormalized metadata copied onto every chunk so retrieval can filter
    # by exam/subject/topic without a join (spec section 55).
    exam_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type_enum")
    )

    embedding: Mapped[list[float]] = mapped_column(Vector(settings.GEMINI_EMBEDDING_DIM))

    document: Mapped["Document"] = relationship(back_populates="chunks")
