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
    material_scope: str | None = Form("whole_subject"),  # "whole_exam" | "whole_subject" | "single_content"
    subject_id: uuid.UUID | None = Form(None),
    subject_name: str | None = Form(None),
    chapter_id: uuid.UUID | None = Form(None),
    chapter_name: str | None = Form(None),
    topic_id: uuid.UUID | None = Form(None),
    topic_name: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func

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

    storage = get_storage()
    created_docs = []
    last_job = None

    for target_exam_id in target_exam_ids:
        exam_type = await db.get(ExamType, target_exam_id)
        if not exam_type:
            continue

        resolved_subject_id = subject_id
        resolved_chapter_id = chapter_id
        resolved_topic_id = topic_id

        # Auto-provision Subject if name passed
        if not resolved_subject_id and subject_name and subject_name.strip():
            clean_sname = subject_name.strip().capitalize()
            subj_res = await db.execute(
                select(Subject).where(Subject.exam_type_id == target_exam_id, func.lower(Subject.name) == clean_sname.lower())
            )
            existing_s = subj_res.scalar_one_or_none()
            if existing_s:
                resolved_subject_id = existing_s.id
            else:
                new_s = Subject(exam_type_id=target_exam_id, name=clean_sname)
                db.add(new_s)
                await db.commit()
                await db.refresh(new_s)
                resolved_subject_id = new_s.id

        # Auto-provision Chapter if name passed or if topic_name passed without chapter
        if resolved_subject_id and not resolved_chapter_id:
            raw_cname = chapter_name.strip() if chapter_name and chapter_name.strip() else None
            raw_tname = topic_name.strip() if topic_name and topic_name.strip() else None
            if raw_cname or raw_tname:
                clean_cname = raw_cname or (f"{raw_tname} Chapter Module" if raw_tname else "General Syllabus Module")
                chap_res = await db.execute(
                    select(Chapter).where(Chapter.subject_id == resolved_subject_id, func.lower(Chapter.name) == clean_cname.lower())
                )
                existing_c = chap_res.scalar_one_or_none()
                if existing_c:
                    resolved_chapter_id = existing_c.id
                else:
                    new_c = Chapter(subject_id=resolved_subject_id, name=clean_cname)
                    db.add(new_c)
                    await db.commit()
                    await db.refresh(new_c)
                    resolved_chapter_id = new_c.id

        # Auto-provision Topic if name passed
        if resolved_chapter_id and not resolved_topic_id and topic_name and topic_name.strip():
            clean_tname = topic_name.strip()
            top_res = await db.execute(
                select(Topic).where(Topic.chapter_id == resolved_chapter_id, func.lower(Topic.name) == clean_tname.lower())
            )
            existing_t = top_res.scalar_one_or_none()
            if existing_t:
                resolved_topic_id = existing_t.id
            else:
                new_t = Topic(chapter_id=resolved_chapter_id, name=clean_tname)
                db.add(new_t)
                await db.commit()
                await db.refresh(new_t)
                resolved_topic_id = new_t.id

        storage_path = storage.save(file_bytes, file.filename, prefix=f"documents/{exam_type.code.lower()}")

        existing = await db.execute(
            select(Document).where(
                Document.exam_type_id == target_exam_id,
                Document.subject_id == resolved_subject_id,
                Document.chapter_id == resolved_chapter_id,
                Document.topic_id == resolved_topic_id,
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
            subject_id=resolved_subject_id,
            chapter_id=resolved_chapter_id,
            topic_id=resolved_topic_id,
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
