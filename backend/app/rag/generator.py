from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from app.core.config import get_settings
from app.rag.schema import GeneratedQuestionSchema

settings = get_settings()

_chat_client: ChatGoogleGenerativeAI | None = None


class QuestionBatch(BaseModel):
    questions: list[GeneratedQuestionSchema]


def get_chat_client() -> ChatGoogleGenerativeAI:
    global _chat_client
    if _chat_client is None:
        _chat_client = ChatGoogleGenerativeAI(
            model=settings.GEMINI_GENERATION_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0.7,
        )
    return _chat_client


def _call_llm(prompt: str, count: int) -> QuestionBatch:
    """The one function that actually talks to Gemini. Kept isolated so
    the rest of the generation pipeline can be tested by substituting this
    function, without needing live network access."""
    client = get_chat_client()
    structured_client = client.with_structured_output(QuestionBatch)
    user_instruction = f"Generate exactly {count} distinct questions following the rules above."
    return structured_client.invoke(prompt + "\n\n" + user_instruction)


def generate_questions(prompt: str, count: int) -> list[GeneratedQuestionSchema]:
    """Requests `count` questions from Gemini in a single structured call
    (cheaper and faster than one call per question -- spec section 47)."""
    if count <= 0:
        return []
    batch = _call_llm(prompt, count)
    return batch.questions
