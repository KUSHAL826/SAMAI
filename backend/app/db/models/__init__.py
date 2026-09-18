"""
Import every model here so that:
  1. Alembic's autogenerate can discover the full schema.
  2. Anywhere in the app can `from app.db import models` and get everything.
"""
from app.db.models.student import Student, StudentSession  # noqa: F401
from app.db.models.curriculum import ExamType, Subject, Chapter, Topic  # noqa: F401
from app.db.models.document import (  # noqa: F401
    Document,
    DocumentVersion,
    DocumentChunk,
    DocumentType,
    DocumentStatus,
)
from app.db.models.pattern import ExamPattern  # noqa: F401
from app.db.models.sample import SampleQuestion, SampleQuestionPaper  # noqa: F401
from app.db.models.question import (  # noqa: F401
    QuestionBank,
    GeneratedQuestion,
    Difficulty,
    QuestionType,
    GenerationStatus,
)
from app.db.models.attempt import ExamAttempt, QuestionAttempt, ExamMode, AttemptStatus  # noqa: F401
from app.db.models.result import ExamResult, SubjectResult, TopicResult  # noqa: F401
from app.db.models.recommendation import StudentRecommendation  # noqa: F401
from app.db.models.job import DocumentProcessingJob, AIGenerationJob, JobStatus  # noqa: F401
from app.db.models.log import SystemLog  # noqa: F401
