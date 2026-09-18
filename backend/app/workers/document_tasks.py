import re
import uuid

from app.core.storage import get_storage
from app.db.models.document import Document, DocumentChunk, DocumentStatus
from app.db.models.job import DocumentProcessingJob, JobStatus
from app.db.sync_session import get_sync_db
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_documents
from app.rag.loaders.dispatch import extract_text
from app.workers.celery_app import celery_app


def _clean_text(text: str) -> str:
    """Collapses excess whitespace left over from PDF/DOCX extraction."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _set_job_step(db, job: DocumentProcessingJob, step: str) -> None:
    job.current_step = step
    db.commit()


@celery_app.task(name="app.workers.document_tasks.process_document", bind=True, max_retries=2)
def process_document(self, document_id: str) -> dict:
    """
    Pipeline (spec section 20):
    Uploaded -> Processing -> Text Extraction -> Cleaning -> Chunking
    -> Metadata Assignment -> Embedding -> Vector Index -> Ready
    """
    db = get_sync_db()
    try:
        document = db.get(Document, uuid.UUID(document_id))
        if document is None:
            raise ValueError(f"Document {document_id} not found")

        job = (
            db.query(DocumentProcessingJob)
            .filter(DocumentProcessingJob.document_id == document.id)
            .order_by(DocumentProcessingJob.created_at.desc())
            .first()
        )
        if job is None:
            job = DocumentProcessingJob(document_id=document.id, status=JobStatus.QUEUED)
            db.add(job)
            db.commit()

        job.status = JobStatus.RUNNING
        job.celery_task_id = self.request.id
        document.status = DocumentStatus.PROCESSING
        db.commit()

        # --- Text Extraction ---
        _set_job_step(db, job, "extracting_text")
        storage = get_storage()
        file_bytes = storage.read(document.storage_path)
        raw_text = extract_text(file_bytes, document.file_type)

        # --- Cleaning ---
        _set_job_step(db, job, "cleaning")
        cleaned_text = _clean_text(raw_text)

        if not cleaned_text:
            raise ValueError("No extractable text found in this document.")

        # --- Chunking ---
        _set_job_step(db, job, "chunking")
        chunks = chunk_text(cleaned_text)
        if not chunks:
            raise ValueError("Document produced no usable chunks after cleaning.")

        # --- Embedding ---
        _set_job_step(db, job, "embedding")
        vectors = embed_documents(chunks)

        # --- Metadata Assignment + Vector Index (bulk insert) ---
        _set_job_step(db, job, "indexing")
        # Remove any previous chunks if this is a reprocess.
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()

        for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=idx,
                    content=chunk,
                    exam_type_id=document.exam_type_id,
                    subject_id=document.subject_id,
                    chapter_id=document.chapter_id,
                    topic_id=document.topic_id,
                    document_type=document.document_type,
                    embedding=vector,
                )
            )

        # --- Ready ---
        document.status = DocumentStatus.READY
        job.status = JobStatus.SUCCEEDED
        job.current_step = "ready"
        db.commit()

        return {"document_id": str(document.id), "chunks_indexed": len(chunks)}

    except Exception as exc:
        db.rollback()
        document = db.get(Document, uuid.UUID(document_id))
        if document:
            document.status = DocumentStatus.FAILED
        job = (
            db.query(DocumentProcessingJob)
            .filter(DocumentProcessingJob.document_id == uuid.UUID(document_id))
            .order_by(DocumentProcessingJob.created_at.desc())
            .first()
        )
        if job:
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
        db.commit()
        raise
    finally:
        db.close()
