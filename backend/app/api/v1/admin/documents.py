"""
Admin document upload (spec sections 17-20). Upload completes immediately;
extraction/chunking/embedding runs asynchronously in a Celery worker so
the admin UI never freezes on a large textbook (spec section 49).
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.db.models.curriculum import Chapter, ExamType, Subject, Topic
from app.db.models.document import Document, DocumentStatus, DocumentType
from app.db.models.job import DocumentProcessingJob, JobStatus
from app.db.session import get_db
from app.schemas.document import DocumentOut, DocumentProcessingStatusOut, DocumentUploadResponse
from app.workers.document_tasks import process_document

router = APIRouter(prefix="/api/v1/admin/documents", tags=["admin:documents"])

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "csv", "xls", "xlsx"}
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024  # 200MB -- generous for a full textbook


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    exam_type_id: uuid.UUID = Form(...),
    document_type: DocumentType = Form(...),
    subject_id: uuid.UUID | None = Form(None),
    chapter_id: uuid.UUID | None = Form(None),
    topic_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    # --- Validate references exist ---
    exam_type = await db.get(ExamType, exam_type_id)
    if not exam_type:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam type not found.")
    if subject_id and not await db.get(Subject, subject_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found.")
    if chapter_id and not await db.get(Chapter, chapter_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")
    if topic_id and not await db.get(Topic, topic_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found.")

    # --- Validate file type/size ---
    ext = Path(file.filename or "").suffix.lstrip(".").lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File exceeds the 200MB limit.")
    if len(file_bytes) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

    # --- Persist file to object storage (local disk or R2, per STORAGE_PROVIDER) ---
    storage = get_storage()
    storage_path = storage.save(file_bytes, file.filename, prefix=f"documents/{exam_type.code.lower()}")

    # --- Version handling: bump version if this exact combo already has a document ---
    existing = await db.execute(
        select(Document).where(
            Document.exam_type_id == exam_type_id,
            Document.subject_id == subject_id,
            Document.chapter_id == chapter_id,
            Document.topic_id == topic_id,
            Document.document_type == document_type,
        )
    )
    prior = existing.scalars().first()
    next_version = (prior.version + 1) if prior else 1

    document = Document(
        original_filename=file.filename,
        file_type=ext,
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(file_bytes),
        storage_path=storage_path,
        exam_type_id=exam_type_id,
        subject_id=subject_id,
        chapter_id=chapter_id,
        topic_id=topic_id,
        document_type=document_type,
        version=next_version,
        status=DocumentStatus.UPLOADED,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    job = DocumentProcessingJob(document_id=document.id, status=JobStatus.QUEUED)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Hand off to the Celery worker -- this call returns immediately.
    process_document.delay(str(document.id))

    return DocumentUploadResponse(
        document=DocumentOut.model_validate(document),
        job_id=job.id,
        job_status=job.status,
        message="Upload received. Processing has started in the background.",
    )


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    exam_type_id: uuid.UUID | None = None,
    document_type: DocumentType | None = None,
    status_filter: DocumentStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Document)
    if exam_type_id:
        query = query.where(Document.exam_type_id == exam_type_id)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if status_filter:
        query = query.where(Document.status == status_filter)
    result = await db.execute(query.order_by(Document.created_at.desc()))
    return result.scalars().all()


@router.get("/{document_id}/status", response_model=DocumentProcessingStatusOut)
async def get_document_status(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

    result = await db.execute(
        select(DocumentProcessingJob)
        .where(DocumentProcessingJob.document_id == document_id)
        .order_by(DocumentProcessingJob.created_at.desc())
    )
    job = result.scalars().first()

    return DocumentProcessingStatusOut(
        document_id=document.id,
        document_status=document.status,
        job_status=job.status if job else JobStatus.QUEUED,
        current_step=job.current_step if job else None,
        error_message=job.error_message if job else None,
    )
