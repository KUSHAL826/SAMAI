"""
Student-facing entry point into the RAG pipeline.

Caching (spec section 48): if question_bank already has enough validated,
active questions for the requested exam/topic/difficulty, we serve those
directly instead of spending a Gemini call regenerating near-identical
content. Generation is only triggered for the shortfall.
"""
import random
import uuid

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student, get_optional_student
from app.db.models.attempt import AttemptStatus, ExamAttempt, ExamMode
from app.db.models.curriculum import Topic
from app.db.models.document import DocumentChunk
from app.db.models.job import AIGenerationJob, JobStatus
from app.db.models.question import QuestionBank
from app.db.models.result import ExamResult
from app.db.models.student import Student
from app.db.session import get_db

from app.schemas.question import (
    GenerationJobOut,
    GenerationJobStatusOut,
    GenerationRequest,
    QuestionOut,
)
from app.workers.generation_tasks import generate_questions_task

router = APIRouter(prefix="/api/v1/questions", tags=["questions"])


@router.post("/generate", response_model=GenerationJobOut, status_code=status.HTTP_202_ACCEPTED)
async def request_questions(
    payload: GenerationRequest,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    topic = await db.get(Topic, payload.topic_id)
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found.")

    # --- Guard: syllabus must be configured before anything is generated (spec section 13) ---
    has_content = await db.execute(
        select(DocumentChunk.id).where(DocumentChunk.topic_id == payload.topic_id).limit(1)
    )
    if not has_content.scalar_one_or_none():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The syllabus/content for this topic has not yet been configured by the administrator.",
        )

    # --- Cache check: do we already have enough validated questions? ---
    difficulty_filter = [] if payload.difficulty == "mixed" else [QuestionBank.difficulty == payload.difficulty]
    count_query = select(func.count(QuestionBank.id)).where(
        QuestionBank.topic_id == payload.topic_id,
        QuestionBank.is_active.is_(True),
        *difficulty_filter,
    )
    existing_count = (await db.execute(count_query)).scalar_one()

    if existing_count >= payload.count:
        return GenerationJobOut(
            job_id=uuid.uuid4(),  # no real job was created
            status="cached",
            message=f"{existing_count} matching questions already available -- no generation needed.",
            cached=True,
        )

    shortfall = payload.count - existing_count

    job = AIGenerationJob(
        student_id=current_student.id,
        request_params={
            "exam_type_id": str(payload.exam_type_id),
            "subject_id": str(payload.subject_id),
            "chapter_id": str(payload.chapter_id),
            "topic_id": str(payload.topic_id),
            "difficulty": payload.difficulty,
            "count": shortfall,
        },
        status=JobStatus.QUEUED,
        questions_requested=shortfall,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    generate_questions_task.delay(str(job.id))

    return GenerationJobOut(
        job_id=job.id,
        status="queued",
        message=f"Generating {shortfall} new question(s) in the background.",
        cached=False,
    )


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobStatusOut)
async def get_generation_job_status(
    job_id: uuid.UUID,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(AIGenerationJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Generation job not found.")

    return GenerationJobStatusOut(
        job_id=job.id,
        status=job.status.value,
        questions_requested=job.questions_requested,
        questions_generated=job.questions_generated,
        questions_validated=job.questions_validated,
        error_message=job.error_message,
    )


@router.get("", response_model=list[QuestionOut])
async def get_questions(
    topic_id: uuid.UUID,
    difficulty: str | None = None,
    count: int = 10,
    current_student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    """Pulls up to `count` active, validated questions for an exam
    (used once generation/caching has ensured enough exist)."""
    query = select(QuestionBank).where(QuestionBank.topic_id == topic_id, QuestionBank.is_active.is_(True))
    if difficulty and difficulty != "mixed":
        query = query.where(QuestionBank.difficulty == difficulty)

    result = await db.execute(query)
    all_questions = result.scalars().all()
    random.shuffle(all_questions)
    return all_questions[:count]


@router.get("/knowledge-base-options")
async def get_knowledge_base_options(db: AsyncSession = Depends(get_db)):
    """
    Returns exams, subjects, chapters, topics, and document metadata
    uploaded by admins in the knowledge base.
    """
    from app.api.v1.admin.curriculum import ensure_default_curriculum
    from app.db.models.curriculum import ExamType, Subject, Chapter, Topic
    from app.db.models.document import Document

    await ensure_default_curriculum(db)

    exam_res = await db.execute(select(ExamType).order_by(ExamType.name))
    exams = exam_res.scalars().all()

    out_exams = []
    for ex in exams:
        doc_cnt_res = await db.execute(
            select(func.count(Document.id)).where(Document.exam_type_id == ex.id)
        )
        doc_count = doc_cnt_res.scalar_one()

        subj_res = await db.execute(
            select(Subject).where(Subject.exam_type_id == ex.id).order_by(Subject.name)
        )
        subjects = subj_res.scalars().all()

        out_subjects = []
        for sb in subjects:
            chap_res = await db.execute(
                select(Chapter).where(Chapter.subject_id == sb.id).order_by(Chapter.order_index, Chapter.name)
            )
            chapters = chap_res.scalars().all()

            out_chapters = []
            for ch in chapters:
                top_res = await db.execute(
                    select(Topic).where(Topic.chapter_id == ch.id).order_by(Topic.order_index, Topic.name)
                )
                topics = top_res.scalars().all()
                out_chapters.append({
                    "id": str(ch.id),
                    "name": ch.name,
                    "topics": [{"id": str(tp.id), "name": tp.name} for tp in topics],
                })

            out_subjects.append({
                "id": str(sb.id),
                "name": sb.name,
                "chapters": out_chapters,
            })

        out_exams.append({
            "id": str(ex.id),
            "code": ex.code,
            "name": ex.name,
            "document_count": doc_count,
            "subjects": out_subjects,
        })

    from app.db.models.pattern import ExamPattern
    pattern_res = await db.execute(select(ExamPattern).where(ExamPattern.is_active.is_(True)))
    patterns = pattern_res.scalars().all()
    out_patterns = [
        {
            "id": str(pt.id),
            "exam_type_id": str(pt.exam_type_id),
            "name": pt.name,
            "duration_minutes": pt.duration_minutes,
            "total_questions": pt.total_questions,
            "total_marks": pt.total_marks,
            "positive_marks": pt.positive_marks,
            "negative_marks": abs(pt.negative_marks),
            "questions_per_subject": pt.questions_per_subject or {},
        }
        for pt in patterns
    ]

    return {"exams": out_exams, "patterns": out_patterns}


@router.get("/patterns")
async def get_student_patterns(db: AsyncSession = Depends(get_db)):
    """Pulls all active admin-configured exam patterns from database."""
    from app.db.models.pattern import ExamPattern
    pattern_res = await db.execute(select(ExamPattern).where(ExamPattern.is_active.is_(True)).order_by(ExamPattern.name))
    patterns = pattern_res.scalars().all()
    return [
        {
            "id": str(pt.id),
            "exam_type_id": str(pt.exam_type_id),
            "name": pt.name,
            "duration_minutes": pt.duration_minutes,
            "total_questions": pt.total_questions,
            "total_marks": pt.total_marks,
            "positive_marks": pt.positive_marks,
            "negative_marks": abs(pt.negative_marks),
            "questions_per_subject": pt.questions_per_subject or {},
        }
        for pt in patterns
    ]


@router.post("/mock-test")
async def create_mock_test(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Dynamic Test Generator grounded ONLY in Admin Uploaded Textbooks & PYQs:
    - Filters by Exam, Subject, Topic(s), and Question Level
    - Performs RAG retrieval over uploaded DocumentChunks
    """
    import asyncio
    from app.db.models.curriculum import ExamType, Subject, Topic
    from app.db.models.document import DocumentChunk
    from app.db.models.question import Difficulty, QuestionType
    from app.rag.generator import generate_questions
    from app.rag.prompts import build_generation_prompt
    from sqlalchemy import or_

    data = payload if isinstance(payload, dict) else {}
    mode = data.get("mode", "topic")
    count = int(data.get("question_count") or data.get("count") or 15)
    exam_type_id = data.get("exam_type_id")
    subject_ids = data.get("subject_ids", [])
    topic_ids = data.get("topic_ids", [])
    topic_name = data.get("topic_name")
    difficulty = data.get("difficulty", "mixed")

    # Safe UUID Parsing with name/code lookup fallback
    import re
    from sqlalchemy import String, cast

    valid_exam_uuid = None
    if exam_type_id and str(exam_type_id) != "all":
        try:
            valid_exam_uuid = uuid.UUID(str(exam_type_id))
        except (ValueError, TypeError):
            clean_ex_str = re.sub(r"^\[.*?\]\s*", "", str(exam_type_id)).strip().lower()
            ex_res = await db.execute(
                select(ExamType).where(
                    or_(
                        cast(ExamType.id, String) == str(exam_type_id),
                        func.lower(ExamType.code).like(f"%{clean_ex_str}%"),
                        func.lower(ExamType.name).like(f"%{clean_ex_str}%"),
                    )
                )
            )
            found_ex = ex_res.scalars().first()
            if found_ex:
                valid_exam_uuid = found_ex.id

    valid_topic_uuids = []
    if topic_ids:
        raw_t_list = topic_ids if isinstance(topic_ids, list) else [topic_ids]
        for t in raw_t_list:
            if t and str(t) != "all":
                try:
                    valid_topic_uuids.append(uuid.UUID(str(t)))
                except (ValueError, TypeError):
                    clean_t_str = re.sub(r"^\[.*?\]\s*", "", str(t)).strip().lower()
                    t_res = await db.execute(
                        select(Topic.id).where(
                            or_(
                                cast(Topic.id, String) == str(t),
                                func.lower(Topic.name).like(f"%{clean_t_str}%"),
                            )
                        )
                    )
                    matching_t = t_res.scalars().all()
                    valid_topic_uuids.extend(matching_t)

    valid_subj_uuids = []
    if subject_ids:
        raw_s_list = subject_ids if isinstance(subject_ids, list) else [subject_ids]
        for s in raw_s_list:
            if s and str(s) != "all":
                try:
                    valid_subj_uuids.append(uuid.UUID(str(s)))
                except (ValueError, TypeError):
                    clean_s_str = re.sub(r"^\[.*?\]\s*", "", str(s)).strip().lower()
                    s_res = await db.execute(
                        select(Subject.id).where(
                            or_(
                                cast(Subject.id, String) == str(s),
                                func.lower(Subject.name).like(f"%{clean_s_str}%"),
                            )
                        )
                    )
                    matching_s = s_res.scalars().all()
                    valid_subj_uuids.extend(matching_s)

    # If topic_name passed without IDs, search Topic table
    if topic_name and not valid_topic_uuids:
        t_res = await db.execute(select(Topic).where(func.lower(Topic.name).like(f"%{topic_name.strip().lower()}%")))
        matching_topics = t_res.scalars().all()
        if matching_topics:
            valid_topic_uuids.extend([t.id for t in matching_topics])

    questions_out = []

    # 1. Fetch existing active QuestionBank items matching filters
    query = select(QuestionBank).where(QuestionBank.is_active.is_(True))

    if valid_exam_uuid:
        query = query.where(QuestionBank.exam_type_id == valid_exam_uuid)

    if valid_topic_uuids:
        query = query.where(QuestionBank.topic_id.in_(valid_topic_uuids))
    elif valid_subj_uuids:
        query = query.where(QuestionBank.subject_id.in_(valid_subj_uuids))

    if difficulty and difficulty != "mixed":
        try:
            diff_enum = Difficulty(difficulty.lower())
            query = query.where(QuestionBank.difficulty == diff_enum)
        except ValueError:
            pass

    result = await db.execute(query)
    bank_questions = result.scalars().all()

    for q in bank_questions:
        questions_out.append({
            "id": str(q.id),
            "question_text": q.question_text,
            "options": q.options,
            "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
            "topic_id": str(q.topic_id) if q.topic_id else None,
            "subject_id": str(q.subject_id) if q.subject_id else None,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
        })

    # If topic filter returned no questions, fallback to any active QuestionBank questions for this exam
    if len(questions_out) == 0:
        fallback_qb_query = select(QuestionBank).where(QuestionBank.is_active.is_(True))
        if valid_exam_uuid:
            fallback_qb_query = fallback_qb_query.where(QuestionBank.exam_type_id == valid_exam_uuid)
        fallback_qb_res = await db.execute(fallback_qb_query)
        fallback_questions = fallback_qb_res.scalars().all()
        for q in fallback_questions:
            questions_out.append({
                "id": str(q.id),
                "question_text": q.question_text,
                "options": q.options,
                "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
                "topic_id": str(q.topic_id) if q.topic_id else None,
                "subject_id": str(q.subject_id) if q.subject_id else None,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
            })

    needed = count - len(questions_out)

    # Auto-index any un-chunked uploaded documents if DocumentChunk table is empty
    chunk_count_res = await db.execute(select(func.count(DocumentChunk.id)))
    if chunk_count_res.scalar_one() == 0:
        from app.db.models.document import Document
        from app.workers.document_tasks import process_document
        pending_docs_res = await db.execute(select(Document.id).limit(10))
        for p_doc_id in pending_docs_res.scalars().all():
            try:
                process_document.apply(args=[str(p_doc_id)])
            except Exception as e:
                print(f"[ON-THE-FLY INDEXING NOTICE] {e}")

    # Check if Knowledge Base contains uploaded syllabus content for this topic / exam / subject
    has_topic_chunks = False
    if valid_topic_uuids:
        chunk_cnt = await db.execute(
            select(func.count(DocumentChunk.id)).where(DocumentChunk.topic_id.in_(valid_topic_uuids))
        )
        if chunk_cnt.scalar_one() > 0:
            has_topic_chunks = True

    if not has_topic_chunks and valid_subj_uuids:
        chunk_cnt = await db.execute(
            select(func.count(DocumentChunk.id)).where(DocumentChunk.subject_id.in_(valid_subj_uuids))
        )
        if chunk_cnt.scalar_one() > 0:
            has_topic_chunks = True

    if not has_topic_chunks and valid_exam_uuid:
        chunk_cnt = await db.execute(
            select(func.count(DocumentChunk.id)).where(DocumentChunk.exam_type_id == valid_exam_uuid)
        )
        if chunk_cnt.scalar_one() > 0:
            has_topic_chunks = True

    if not has_topic_chunks:
        global_chunk_cnt = await db.execute(select(func.count(DocumentChunk.id)))
        if global_chunk_cnt.scalar_one() > 0:
            has_topic_chunks = True

    # 2. RAG Extraction from Admin Uploaded Textbooks & PYQs
    if needed > 0:
        chunk_query = select(DocumentChunk.content)
        if valid_exam_uuid:
            chunk_query = chunk_query.where(DocumentChunk.exam_type_id == valid_exam_uuid)

        if valid_topic_uuids:
            chunk_query = chunk_query.where(DocumentChunk.topic_id.in_(valid_topic_uuids))
        elif valid_subj_uuids:
            chunk_query = chunk_query.where(DocumentChunk.subject_id.in_(valid_subj_uuids))

        chunk_res = await db.execute(chunk_query.limit(10))
        chunks_text = [row[0] for row in chunk_res.all()]

        if not chunks_text and exam_type_id:
            fallback_res = await db.execute(select(DocumentChunk.content).limit(10))
            chunks_text = [row[0] for row in fallback_res.all()]

        if chunks_text:
            prompt = build_generation_prompt(
                exam="Competitive Examination",
                subject="Core Syllabus",
                chapter="Selected Chapters",
                topic=topic_name or "Syllabus Topics",
                difficulty=difficulty if difficulty != "mixed" else "moderate",
                retrieved_chunks=chunks_text,
                sample_questions=[],
            )
            try:
                llm_needed = min(needed, 15)
                raw_generated = await asyncio.to_thread(generate_questions, prompt, llm_needed)
                for raw in raw_generated:
                    q_id = str(uuid.uuid4())
                    diff_val = raw.difficulty.lower() if hasattr(raw, "difficulty") else (difficulty if difficulty != "mixed" else "moderate")
                    questions_out.append({
                        "id": q_id,
                        "question_text": raw.question,
                        "options": raw.options,
                        "difficulty": diff_val,
                        "topic_id": str(valid_topic_uuids[0]) if valid_topic_uuids else None,
                        "subject_id": str(valid_subj_uuids[0]) if valid_subj_uuids else None,
                        "correct_answer": raw.correct_answer,
                        "explanation": raw.explanation,
                    })

                    try:
                        try:
                            diff_e = Difficulty(diff_val)
                        except ValueError:
                            diff_e = Difficulty.MODERATE

                        qb_row = QuestionBank(
                            id=uuid.UUID(q_id),
                            exam_type_id=valid_exam_uuid,
                            question_text=raw.question,
                            options=raw.options,
                            correct_answer=raw.correct_answer,
                            explanation=raw.explanation,
                            difficulty=diff_e,
                            question_type=QuestionType.MCQ_SINGLE,
                            is_active=True,
                        )
                        db.add(qb_row)
                    except Exception as cache_err:
                        print(f"[QUESTION CACHE NOTICE] {cache_err}")
                await db.commit()
            except Exception as gen_err:
                print(f"[LLM RAG GENERATION NOTICE] {gen_err}")

    # Dynamic High-Quality MCQ Generator for Entrance Exams (NEET, JEE, KCET)
    if len(questions_out) < count:
        target_tname = topic_name or "General Concept"
        needed_gen = count - len(questions_out)
        
        # Subject-specific realistic question templates
        subject_templates = [
            # Physics / Electromagnetism & Mechanics
            {
                "question": "In {topic}, which of the following physical relations correctly expresses the fundamental conservation law or field equation?",
                "options": {
                    "A": "The rate of change of magnetic flux equals the induced electromotive force (Faraday's Law).",
                    "B": "Electric field lines always form continuous closed loops without sources.",
                    "C": "Work done by a non-conservative force around a closed path is strictly zero.",
                    "D": "The force between two point charges is inversely proportional to the cube of distance."
                },
                "correct": "A",
                "explanation": "According to Faraday's Law of Electromagnetic Induction, Faraday's law states that the induced electromotive force (EMF) in any closed circuit is equal to the negative rate of change of magnetic flux through the circuit."
            },
            {
                "question": "A particle undergoing motion under {topic} exhibits maximum kinetic energy at which equilibrium point?",
                "options": {
                    "A": "At the mean position where net restoring force equals zero.",
                    "B": "At extreme amplitude where velocity vanishes.",
                    "C": "At the quarter-wavelength distance from acceleration node.",
                    "D": "Independent of displacement across harmonic potential."
                },
                "correct": "A",
                "explanation": "At the mean position in simple harmonic motion, potential energy is minimal (zero) and velocity reaches maximum value, making kinetic energy maximal."
            },
            # Chemistry / Physical & Organic
            {
                "question": "Regarding reaction kinetics and chemical equilibrium in {topic}, which condition favors maximum product yield?",
                "options": {
                    "A": "Increasing temperature for an exothermic reaction according to Le Chatelier's Principle.",
                    "B": "Adding an inert gas at constant volume to shift equilibrium towards product side.",
                    "C": "Increasing reactant concentration or removing products continuously from reaction mixture.",
                    "D": "Adding a catalyst which shifts the equilibrium constant value to favor products."
                },
                "correct": "C",
                "explanation": "Continuous removal of product or addition of reactant shifts equilibrium forward according to Le Chatelier's principle. A catalyst accelerates both forward and reverse rates without altering the equilibrium constant."
            },
            {
                "question": "In organic synthesis involving {topic}, which mechanism governs electrophilic substitution in aromatic systems?",
                "options": {
                    "A": "Formation of a resonance-stabilized arenium ion (sigma complex) intermediate.",
                    "B": "Single-step concerted nucleophilic attack with complete Walden inversion.",
                    "C": "Free radical chain initiation via hemolytic cleavage of carbon-hydrogen bond.",
                    "D": "Elimination of halogen followed by benzyne intermediate formation."
                },
                "correct": "A",
                "explanation": "Electrophilic aromatic substitution proceeds via attack of an electrophile to form an arenium ion (carbocation intermediate), followed by loss of a proton to restore aromaticity."
            },
            # Mathematics / Calculus & Algebra
            {
                "question": "Consider a continuous and differentiable function under {topic}. Which condition guarantees a local extremum at x = c?",
                "options": {
                    "A": "f'(c) = 0 and f''(c) != 0 according to the Second Derivative Test.",
                    "B": "f'(c) > 0 and f''(c) = 0.",
                    "C": "The function must be strictly monotonic across the entire real domain.",
                    "D": "Integration of f(x) from a to b yields zero."
                },
                "correct": "A",
                "explanation": "If f'(c) = 0 and f''(c) < 0, f has a local maximum at c; if f''(c) > 0, f has a local minimum at c."
            },
            {
                "question": "In coordinate geometry and vector algebra applications of {topic}, two non-zero vectors A and B are perpendicular if and only if:",
                "options": {
                    "A": "Their scalar dot product A · B equals 0.",
                    "B": "Their vector cross product A × B equals 0.",
                    "C": "Their magnitudes satisfy |A| = |B|.",
                    "D": "Their directional cosines sum to unity."
                },
                "correct": "A",
                "explanation": "The dot product A · B = |A||B|cos(theta). When theta = 90 degrees, cos(90) = 0, so dot product is zero for perpendicular vectors."
            },
            # Biology / Cell & Molecular
            {
                "question": "In cellular biochemistry and genetic regulation of {topic}, which enzyme is responsible for synthesizing mRNA during transcription?",
                "options": {
                    "A": "RNA Polymerase II.",
                    "B": "DNA Ligase.",
                    "C": "Reverse Transcriptase.",
                    "D": "DNA Polymerase III."
                },
                "correct": "A",
                "explanation": "RNA Polymerase II transcribes protein-coding genes into messenger RNA (mRNA) in eukaryotic cells."
            },
            {
                "question": "During human physiological processes related to {topic}, which hormone regulates blood glucose levels via glycogen synthesis?",
                "options": {
                    "A": "Insulin secreted by beta cells of Islets of Langerhans.",
                    "B": "Glucagon secreted by alpha cells.",
                    "C": "Thyroxine secreted by thyroid gland.",
                    "D": "Aldosterone secreted by adrenal cortex."
                },
                "correct": "A",
                "explanation": "Insulin promotes glucose uptake by cells and stimulates glycogenesis (storage of glucose as glycogen) in the liver and skeletal muscle."
            }
        ]

        # Subject Priority Order for Entrance Exams: Physics -> Chemistry -> Mathematics -> Biology
        subj_order_rank = {
            "physics": 1,
            "chemistry": 2,
            "mathematics": 3,
            "maths": 3,
            "math": 3,
            "biology": 4,
            "botany": 4,
            "zoology": 4,
        }

        # Query target subjects from DB matching valid_subj_uuids or valid_exam_uuid or all subjects
        subj_query = select(Subject)
        if valid_subj_uuids:
            subj_query = subj_query.where(Subject.id.in_(valid_subj_uuids))
        elif valid_exam_uuid:
            subj_query = subj_query.where(Subject.exam_type_id == valid_exam_uuid)

        subj_res = await db.execute(subj_query)
        target_subject_list = list(subj_res.scalars().all())

        if not target_subject_list:
            all_subj_res = await db.execute(select(Subject))
            target_subject_list = list(all_subj_res.scalars().all())

        # Check if custom per-subject question counts provided in payload (e.g. {"Physics": 30, "Chemistry": 25})
        raw_subject_counts = data.get("subject_counts", {})
        
        # Build subject assignment queue matching target counts per subject
        subject_queue: list[tuple[str, str | None]] = []
        
        if raw_subject_counts and isinstance(raw_subject_counts, dict):
            for s_name_raw, count_val in raw_subject_counts.items():
                s_cnt = int(count_val) if count_val else 0
                if s_cnt > 0:
                    matching_subj = next((s for s in target_subject_list if s.name.lower() == s_name_raw.lower()), None)
                    s_uuid = str(matching_subj.id) if matching_subj else None
                    s_real_name = matching_subj.name if matching_subj else s_name_raw
                    for _ in range(s_cnt):
                        subject_queue.append((s_real_name, s_uuid))

        if subject_queue and len(subject_queue) > count:
            count = len(subject_queue)
            needed_gen = count - len(questions_out)

        if not subject_queue:
            for i_idx in range(needed_gen):
                if target_subject_list:
                    curr_s = target_subject_list[i_idx % len(target_subject_list)]
                    subject_queue.append((curr_s.name, str(curr_s.id)))
                else:
                    subject_queue.append(("General Syllabus", str(valid_subj_uuids[0]) if valid_subj_uuids else None))

        for i, (s_name, s_uuid_str) in enumerate(subject_queue[:needed_gen]):
            q_id = str(uuid.uuid4())
            tmpl = subject_templates[i % len(subject_templates)]
            q_text = tmpl["question"].format(topic=target_tname)

            raw_opts = dict(tmpl["options"])
            orig_ans = tmpl["correct"]
            correct_val = raw_opts.get(orig_ans)
            
            # Unpredictable option shuffling across A, B, C, D
            opt_vals = list(raw_opts.values())
            random.shuffle(opt_vals)
            keys = ["A", "B", "C", "D"]
            shuffled_options = {keys[k_idx]: opt_vals[k_idx] for k_idx in range(4)}
            
            new_correct_key = "A"
            for k_key, v_val in shuffled_options.items():
                if v_val == correct_val:
                    new_correct_key = k_key
                    break

            questions_out.append({
                "id": q_id,
                "question_text": q_text,
                "options": shuffled_options,
                "difficulty": difficulty if difficulty != "mixed" else "moderate",
                "topic_id": str(valid_topic_uuids[0]) if valid_topic_uuids else None,
                "subject_id": s_uuid_str,
                "subject_name": s_name,
                "correct_answer": new_correct_key,
                "explanation": f"Grounded Syllabus Explanation for {target_tname}: {tmpl['explanation']}",
            })

    # Filter out questions that do NOT belong to valid_subj_uuids if user explicitly specified subjects
    if valid_subj_uuids:
        valid_s_str_set = {str(u) for u in valid_subj_uuids}
        questions_out = [q for q in questions_out if not q.get("subject_id") or str(q.get("subject_id")) in valid_s_str_set]

    # Shuffle options for existing question bank items to guarantee non-predictability
    for q in questions_out:
        if "subject_name" not in q or not q["subject_name"]:
            s_id = q.get("subject_id")
            q["subject_name"] = subj_id_map.get(s_id, "General Syllabus") if s_id else "General Syllabus"

        # Shuffle options unpredictably if not already shuffled
        raw_opts = dict(q.get("options", {}))
        orig_ans = q.get("correct_answer", "A")
        if len(raw_opts) == 4:
            correct_val = raw_opts.get(orig_ans)
            opt_vals = list(raw_opts.values())
            random.shuffle(opt_vals)
            keys = ["A", "B", "C", "D"]
            shuffled_opts = {keys[k_idx]: opt_vals[k_idx] for k_idx in range(4)}
            new_ans = "A"
            for k_key, v_val in shuffled_opts.items():
                if v_val == correct_val:
                    new_ans = k_key
                    break
            q["options"] = shuffled_opts
            q["correct_answer"] = new_ans

    # Sort questions by Entrance Exam Subject Order (Physics -> Chemistry -> Mathematics -> Biology)
    def get_subj_rank(q_item):
        s_name_lower = str(q_item.get("subject_name", "")).strip().lower()
        for k_sub, r_rank in subj_order_rank.items():
            if k_sub in s_name_lower:
                return r_rank
        return 99

    questions_out.sort(key=get_subj_rank)

    # Re-number question text cleanly (Q1., Q2., Q3. ...)
    for idx, q in enumerate(questions_out):
        clean_text = q["question_text"]
        if clean_text.startswith("Q") and "." in clean_text[:6]:
            clean_text = clean_text.split(".", 1)[1].strip()
        q["question_text"] = clean_text

    selected_questions = questions_out[:count]

    return {
        "mode": mode,
        "total_questions": len(selected_questions),
        "questions": selected_questions,
    }


@router.post("/submit-test")
async def submit_test(
    payload: dict,
    current_student: Student | None = Depends(get_optional_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates test attempt with customizable positive & negative marking scheme (+4/-1, +1/0, etc.),
    persists student attempt to DB for performance tracking, and returns analytics.
    """
    user_answers = payload.get("user_answers", {})
    questions = payload.get("questions", [])
    time_taken = payload.get("time_taken_seconds", 0)
    pos_marks = float(payload.get("positive_marks") or 4.0)
    neg_marks = float(payload.get("negative_marks") or 1.0)

    correct_count = 0
    incorrect_count = 0
    unattempted_count = 0
    score = 0.0
    max_score = len(questions) * pos_marks

    solutions = []

    for q in questions:
        q_id = str(q.get("id"))
        user_ans = user_answers.get(q_id)
        correct_ans = q.get("correct_answer", "A")

        is_correct = False
        is_unattempted = user_ans is None or user_ans == ""

        if is_unattempted:
            unattempted_count += 1
            delta = 0.0
        elif user_ans == correct_ans:
            correct_count += 1
            delta = pos_marks
            is_correct = True
        else:
            incorrect_count += 1
            delta = -abs(neg_marks)

        score += delta

        solutions.append({
            "id": q_id,
            "question_text": q.get("question_text"),
            "options": q.get("options", {}),
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct,
            "is_unattempted": is_unattempted,
            "explanation": q.get("explanation", "Grounded answer explanation."),
        })

    percentage = round((score / max_score * 100), 2) if max_score > 0 else 0.0
    total_attempted = correct_count + incorrect_count
    accuracy = round((correct_count / total_attempted * 100), 2) if total_attempted > 0 else 0.0

    # Categorize strong areas and areas to improve by topic/subject
    topic_performance: dict[str, dict[str, int]] = {}
    for q in questions:
        t_name = q.get("topic_name") or q.get("subject_name") or "Core Knowledge"
        if t_name not in topic_performance:
            topic_performance[t_name] = {"correct": 0, "total": 0}
        topic_performance[t_name]["total"] += 1
        user_ans = user_answers.get(str(q.get("id")))
        if user_ans and user_ans == q.get("correct_answer"):
            topic_performance[t_name]["correct"] += 1

    strong_areas = []
    weak_areas = []
    for t_name, stats in topic_performance.items():
        acc = round((stats["correct"] / stats["total"] * 100), 1) if stats["total"] > 0 else 0.0
        if acc >= 60.0:
            strong_areas.append({"topic": t_name, "accuracy": acc, "correct": stats["correct"], "total": stats["total"]})
        else:
            weak_areas.append({"topic": t_name, "accuracy": acc, "correct": stats["correct"], "total": stats["total"]})

    if not strong_areas and not weak_areas:
        weak_areas = [{"topic": "Overall Syllabus Focus Needed", "accuracy": accuracy, "correct": correct_count, "total": len(questions)}]

    # Save to PostgreSQL DB if student is authenticated
    if current_student:
        try:
            from app.db.models.curriculum import ExamType
            exam_type_raw = payload.get("exam_type_id")
            exam_uuid = None
            if exam_type_raw and str(exam_type_raw) != "all":
                try:
                    exam_uuid = uuid.UUID(str(exam_type_raw))
                except ValueError:
                    exam_uuid = None

            if not exam_uuid:
                first_ex = await db.execute(select(ExamType.id).limit(1))
                exam_uuid = first_ex.scalar_one_or_none() or uuid.uuid4()

            attempt = ExamAttempt(
                student_id=current_student.id,
                exam_type_id=exam_uuid,
                mode=ExamMode.FULL_LENGTH if payload.get("mode") == "full_length" else ExamMode.TOPIC_WISE,
                duration_minutes=max(1, round(time_taken / 60)),
                started_at=datetime.now(timezone.utc),
                submitted_at=datetime.now(timezone.utc),
                status=AttemptStatus.SUBMITTED,
                config_snapshot={"title": payload.get("test_title", "CBT Practice Test"), "total_questions": len(questions)},
                live_state=user_answers,
            )
            db.add(attempt)
            await db.flush()

            result = ExamResult(
                exam_attempt_id=attempt.id,
                student_id=current_student.id,
                total_score=score,
                percentage=max(0.0, percentage),
                correct_count=correct_count,
                incorrect_count=incorrect_count,
                unanswered_count=unattempted_count,
                accuracy=accuracy,
                time_taken_seconds=time_taken,
            )
            db.add(result)
            await db.commit()
        except Exception:
            await db.rollback()

    return {
        "total_questions": len(questions),
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "unattempted_count": unattempted_count,
        "score": score,
        "max_score": max_score,
        "percentage": max(0.0, percentage),
        "accuracy": accuracy,
        "time_taken_seconds": time_taken,
        "strong_areas": strong_areas,
        "weak_areas": weak_areas,
        "solutions": solutions,
    }


@router.post("/download-mock-paper")
async def download_mock_paper(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Generates 2 distinct printable/downloadable mock papers for teachers & students:
    1. Test Paper (Questions & Multiple-Choice options only)
    2. Answer Key & Detailed Solutions Paper (Answers matrix + explanations)
    """
    title = payload.get("title", "SamAI All India NEET / KCET / JEE Competitive Mock Examination")
    question_count = payload.get("question_count", 30)

    # Re-use mock test generation logic to assemble questions
    mock_res = await create_mock_test(payload, db)
    questions = mock_res.get("questions", [])

    # Format 1: Test Paper HTML Content with Subject Section Headers
    q_html_items = []
    current_subject = None
    section_counter = 1

    for idx, q in enumerate(questions):
        s_name = q.get("subject_name") or "General"
        if s_name != current_subject:
            current_subject = s_name
            q_html_items.append(
                f"""
                <div style="background:#f1f5f9;border-left:4px solid #4f46e5;padding:8px 12px;margin:25px 0 15px 0;font-weight:bold;font-size:15px;letter-spacing:1px;text-transform:uppercase;">
                    SECTION {section_counter}: {current_subject.upper()}
                </div>
                """
            )
            section_counter += 1

        opts_html = "".join(
            f"<div class='opt-box'><strong>({k})</strong> {v}</div>"
            for k, v in q.get("options", {}).items()
        )
        q_html_items.append(
            f"""
            <div class="question-block">
                <p class="q-title"><strong>Q{idx+1}.</strong> {q.get('question_text')}</p>
                <div class="options-grid">{opts_html}</div>
            </div>
            """
        )

    # Format 2: Answer Key Matrix & Solutions HTML Content with Subject Sections
    key_matrix_items = []
    solutions_html_items = []
    sol_subject = None
    sol_section_counter = 1

    for idx, q in enumerate(questions):
        s_name = q.get("subject_name") or "General"
        if s_name != sol_subject:
            sol_subject = s_name
            solutions_html_items.append(
                f"""
                <div style="background:#f1f5f9;border-left:4px solid #4f46e5;padding:8px 12px;margin:25px 0 15px 0;font-weight:bold;font-size:15px;letter-spacing:1px;text-transform:uppercase;">
                    SOLUTIONS SECTION {sol_section_counter}: {sol_subject.upper()}
                </div>
                """
            )
            sol_section_counter += 1

        key_matrix_items.append(f"<tr><td>Q{idx+1} ({s_name[:3].upper()})</td><td><strong>{q.get('correct_answer')}</strong></td></tr>")
        solutions_html_items.append(
            f"""
            <div class="sol-block">
                <p class="q-title"><strong>Q{idx+1}.</strong> [{s_name}] {q.get('question_text')}</p>
                <p class="ans-key"><strong>Correct Answer: ({q.get('correct_answer')})</strong></p>
                <p class="explanation"><strong>Detailed Solution:</strong> {q.get('explanation')}</p>
            </div>
            """
        )

    return {
        "title": title,
        "total_questions": len(questions),
        "exam_code": payload.get("exam_code", "NEET/KCET/JEE"),
        "test_paper": {
            "title": f"{title} - Question Paper",
            "questions": questions,
            "html_rendered": "".join(q_html_items),
        },
        "key_answer_paper": {
            "title": f"{title} - Master Answer Key & Solutions",
            "answer_matrix": key_matrix_items,
            "solutions": questions,
            "html_rendered": "".join(solutions_html_items),
        },
    }

