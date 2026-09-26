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

from app.api.deps import get_current_admin

router = APIRouter(
    prefix="/api/v1/admin/documents",
    tags=["admin:documents"],
    dependencies=[Depends(get_current_admin)],
)

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "csv", "xls", "xlsx"}
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024  # 200MB -- generous for a full textbook


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    exam_type_id: uuid.UUID | None = Form(None),
    exam_type_ids: str | None = Form(None),
    document_type: DocumentType = Form(...),
    subject_id: uuid.UUID | None = Form(None),
    chapter_id: uuid.UUID | None = Form(None),
    topic_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    # Parse target exam IDs (single or multiple)
    target_exam_ids: list[uuid.UUID] = []
    if exam_type_ids:
        for raw in exam_type_ids.split(","):
            raw_clean = raw.strip()
            if raw_clean:
                try:
                    target_exam_ids.append(uuid.UUID(raw_clean))
                except ValueError:
                    pass
    if not target_exam_ids and exam_type_id:
        target_exam_ids.append(exam_type_id)

    if not target_exam_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one exam type must be selected.")

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

    # Validate non-exam references
    if subject_id and not await db.get(Subject, subject_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found.")
    if chapter_id and not await db.get(Chapter, chapter_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")
    if topic_id and not await db.get(Topic, topic_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found.")

    storage = get_storage()
    created_docs = []
    last_job = None

    for target_exam_id in target_exam_ids:
        exam_type = await db.get(ExamType, target_exam_id)
        if not exam_type:
            continue

        storage_path = storage.save(file_bytes, file.filename, prefix=f"documents/{exam_type.code.lower()}")

        existing = await db.execute(
            select(Document).where(
                Document.exam_type_id == target_exam_id,
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
            exam_type_id=target_exam_id,
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

        process_document.delay(str(document.id))
        created_docs.append(document)
        last_job = job

    if not created_docs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to upload document for selected exams.")

    primary_doc = created_docs[0]
    return DocumentUploadResponse(
        document=DocumentOut.model_validate(primary_doc),
        job_id=last_job.id if last_job else primary_doc.id,
        job_status=last_job.status if last_job else JobStatus.QUEUED,
        message=f"Upload received for {len(created_docs)} exam(s). Background training has started.",
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
