import uuid

from sqlalchemy.orm import Session

from app.db.models.document import DocumentChunk


def retrieve_relevant_chunks(
    db: Session,
    query_embedding: list[float],
    exam_type_id: uuid.UUID,
    subject_id: uuid.UUID | None = None,
    topic_id: uuid.UUID | None = None,
    k: int = 6,
) -> list[DocumentChunk]:
    """
    Retrieves the k most relevant approved-content chunks for a question
    generation request, using pgvector cosine distance for similarity and
    hard metadata filters so nothing outside the requested scope can ever
    be retrieved (spec section 55 -- this is what keeps generation
    syllabus-bound rather than pulling in outside knowledge).
    """
    query = db.query(DocumentChunk).filter(DocumentChunk.exam_type_id == exam_type_id)

    if topic_id is not None:
        query = query.filter(DocumentChunk.topic_id == topic_id)
    elif subject_id is not None:
        query = query.filter(DocumentChunk.subject_id == subject_id)

    query = query.order_by(DocumentChunk.embedding.cosine_distance(query_embedding)).limit(k)
    return query.all()


def has_approved_content(
    db: Session,
    exam_type_id: uuid.UUID,
    subject_id: uuid.UUID | None = None,
    topic_id: uuid.UUID | None = None,
) -> bool:
    """Cheap existence check used before even attempting generation
    (spec section 13: 'syllabus not configured' / 'insufficient content')."""
    query = db.query(DocumentChunk.id).filter(DocumentChunk.exam_type_id == exam_type_id)
    if topic_id is not None:
        query = query.filter(DocumentChunk.topic_id == topic_id)
    elif subject_id is not None:
        query = query.filter(DocumentChunk.subject_id == subject_id)
    return db.query(query.exists()).scalar()
