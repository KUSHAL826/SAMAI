import uuid
from datetime import datetime

from pydantic import BaseModel

from app.db.models.document import DocumentStatus, DocumentType
from app.db.models.job import JobStatus


class DocumentOut(BaseModel):
    id: uuid.UUID
    original_filename: str
    file_type: str
    file_size: int
    exam_type_id: uuid.UUID
    subject_id: uuid.UUID | None
    chapter_id: uuid.UUID | None
    topic_id: uuid.UUID | None
    document_type: DocumentType
    version: int
    status: DocumentStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    document: DocumentOut
    job_id: uuid.UUID
    job_status: JobStatus
    message: str


class DocumentProcessingStatusOut(BaseModel):
    document_id: uuid.UUID
    document_status: DocumentStatus
    job_status: JobStatus
    current_step: str | None
    error_message: str | None
