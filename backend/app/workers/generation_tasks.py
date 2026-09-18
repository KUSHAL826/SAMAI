import uuid

from app.db.models.curriculum import Chapter, ExamType, Subject, Topic
from app.db.models.job import AIGenerationJob, JobStatus
from app.db.models.question import Difficulty, GeneratedQuestion, GenerationStatus, QuestionBank, QuestionType
from app.db.models.sample import SampleQuestion
from app.db.sync_session import get_sync_db
from app.rag.embeddings import embed_query
from app.rag.generator import generate_questions
from app.rag.prompts import build_generation_prompt
from app.rag.retriever import has_approved_content, retrieve_relevant_chunks
from app.rag.validator import validate_question
from app.workers.celery_app import celery_app

MAX_ATTEMPTS = 3
BUFFER_MULTIPLIER = 1.6  # ask for a few extra so rejections don't starve the batch


def _existing_bank_texts(db, topic_id: uuid.UUID) -> list[str]:
    rows = db.query(QuestionBank.question_text).filter(QuestionBank.topic_id == topic_id).all()
    return [r[0] for r in rows]


@celery_app.task(name="app.workers.generation_tasks.generate_questions_task", bind=True, max_retries=1)
def generate_questions_task(self, job_id: str) -> dict:
    db = get_sync_db()
    try:
        job = db.get(AIGenerationJob, uuid.UUID(job_id))
        if job is None:
            raise ValueError(f"AIGenerationJob {job_id} not found")

        job.status = JobStatus.RUNNING
        job.celery_task_id = self.request.id
        db.commit()

        params = job.request_params
        exam_type_id = uuid.UUID(params["exam_type_id"])
        subject_id = uuid.UUID(params["subject_id"])
        chapter_id = uuid.UUID(params["chapter_id"])
        topic_id = uuid.UUID(params["topic_id"])
        difficulty: str = params["difficulty"]
        count: int = params["count"]

        exam_type = db.get(ExamType, exam_type_id)
        subject = db.get(Subject, subject_id)
        chapter = db.get(Chapter, chapter_id)
        topic = db.get(Topic, topic_id)
        if not all([exam_type, subject, chapter, topic]):
            raise ValueError("One or more curriculum references no longer exist.")

        # --- Guard: never generate without approved content (spec section 13) ---
        if not has_approved_content(db, exam_type_id, subject_id, topic_id):
            job.status = JobStatus.FAILED
            job.error_message = (
                "The syllabus/content for this topic has not yet been configured by the administrator."
            )
            db.commit()
            return {"status": "failed", "reason": job.error_message}

        # --- Retrieval (spec section 55) ---
        query_vector = embed_query(f"{subject.name} {chapter.name} {topic.name}")
        chunks = retrieve_relevant_chunks(db, query_vector, exam_type_id, subject_id, topic_id, k=6)
        retrieved_texts = [c.content for c in chunks]

        sample_rows = (
            db.query(SampleQuestion)
            .filter(SampleQuestion.topic_id == topic_id)
            .limit(5)
            .all()
        )
        sample_texts = [s.question_text for s in sample_rows]

        prompt = build_generation_prompt(
            exam=exam_type.name,
            subject=subject.name,
            chapter=chapter.name,
            topic=topic.name,
            difficulty=difficulty,
            retrieved_chunks=retrieved_texts,
            sample_questions=sample_texts,
        )

        existing_texts = _existing_bank_texts(db, topic_id)
        validated_ids: list[uuid.UUID] = []
        total_raw = 0

        for attempt in range(MAX_ATTEMPTS):
            still_needed = count - len(validated_ids)
            if still_needed <= 0:
                break

            request_count = max(still_needed, int(still_needed * BUFFER_MULTIPLIER))
            raw_questions = generate_questions(prompt, request_count)
            total_raw += len(raw_questions)

            for raw in raw_questions:
                if len(validated_ids) >= count:
                    break

                generated_row = GeneratedQuestion(
                    ai_generation_job_id=job.id,
                    raw_output=raw.model_dump(),
                    status=GenerationStatus.PENDING,
                )
                db.add(generated_row)
                db.flush()  # get an id without committing yet

                is_valid, reason = validate_question(raw, topic.name, difficulty, existing_texts)

                if is_valid:
                    try:
                        difficulty_enum = Difficulty(raw.difficulty.lower())
                    except ValueError:
                        difficulty_enum = Difficulty(difficulty.lower())

                    question_row = QuestionBank(
                        exam_type_id=exam_type_id,
                        subject_id=subject_id,
                        chapter_id=chapter_id,
                        topic_id=topic_id,
                        question_text=raw.question,
                        options=raw.options,
                        correct_answer=raw.correct_answer,
                        explanation=raw.explanation,
                        difficulty=difficulty_enum,
                        question_type=QuestionType.MCQ_SINGLE,
                        source_document_id=chunks[0].document_id if chunks else None,
                        source_chunk_id=chunks[0].id if chunks else None,
                    )
                    db.add(question_row)
                    db.flush()

                    generated_row.status = GenerationStatus.VALIDATED
                    generated_row.promoted_question_id = question_row.id
                    validated_ids.append(question_row.id)
                    existing_texts.append(raw.question)
                else:
                    generated_row.status = GenerationStatus.REJECTED
                    generated_row.rejection_reason = reason

            db.commit()

        job.questions_requested = count
        job.questions_generated = total_raw
        job.questions_validated = len(validated_ids)

        if validated_ids:
            job.status = JobStatus.SUCCEEDED
            if len(validated_ids) < count:
                job.error_message = (
                    f"Only {len(validated_ids)} of {count} requested questions passed validation "
                    f"after {MAX_ATTEMPTS} attempts."
                )
        else:
            job.status = JobStatus.FAILED
            job.error_message = "No generated questions passed validation."

        db.commit()
        return {
            "status": job.status.value,
            "validated": len(validated_ids),
            "requested": count,
            "question_ids": [str(i) for i in validated_ids],
        }

    except Exception as exc:
        db.rollback()
        job = db.get(AIGenerationJob, uuid.UUID(job_id))
        if job:
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            db.commit()
        raise
    finally:
        db.close()
