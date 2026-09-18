import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPKMixin


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class DocumentProcessingJob(Base, UUIDPKMixin, TimestampMixin):
    """Tracks the async pipeline: extract -> clean -> chunk -> embed -> index
    (spec sections 20, 49) so the admin UI can show live status."""

    __tablename__ = "document_processing_jobs"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, name="job_status_enum"), default=JobStatus.QUEUED)
    current_step: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(Text, nullable=True)


class AIGenerationJob(Base, UUIDPKMixin, TimestampMixin):
    """Tracks a batch question-generation request (concept exam or full mock)
    so generation can happen async and be cached/reused (spec sections 47-48)."""

    __tablename__ = "ai_generation_jobs"

    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=True, index=True
    )
    request_params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, name="job_status_enum"), default=JobStatus.QUEUED)
    questions_requested: Mapped[int] = mapped_column(default=0)
    questions_generated: Mapped[int] = mapped_column(default=0)
    questions_validated: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(Text, nullable=True)
