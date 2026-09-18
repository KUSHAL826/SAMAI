import difflib

from app.rag.schema import GeneratedQuestionSchema

DUPLICATE_SIMILARITY_THRESHOLD = 0.88


def validate_question(
    question: GeneratedQuestionSchema,
    expected_topic_name: str,
    expected_difficulty: str,
    existing_question_texts: list[str],
) -> tuple[bool, str | None]:
    """
    Runs every AI-generated question through the checks from spec section 29
    before it can be promoted into question_bank. Returns (is_valid, reason)
    -- reason is None when valid, otherwise a human-readable rejection cause
    that gets stored on the GeneratedQuestion audit row.
    """

    # --- Answer: exactly one correct answer, and it must reference a real option ---
    if question.correct_answer not in question.options:
        return False, f"correct_answer '{question.correct_answer}' is not one of the provided options."

    if len(question.options) < 2:
        return False, "Fewer than 2 options were provided."

    # --- Explanation must exist and not just restate the question ---
    if question.explanation.strip().lower() == question.question.strip().lower():
        return False, "Explanation is identical to the question text."

    # --- Difficulty must match what was requested ---
    if expected_difficulty.lower() != "mixed" and question.difficulty.lower() != expected_difficulty.lower():
        return False, f"Requested difficulty '{expected_difficulty}' but got '{question.difficulty}'."

    # --- Topic / syllabus: the model must not have drifted onto another topic ---
    if expected_topic_name.lower() not in question.topic.lower() and question.topic.lower() not in expected_topic_name.lower():
        return False, f"Question topic '{question.topic}' does not match requested topic '{expected_topic_name}'."

    # --- Duplicate detection against already-banked questions for this topic ---
    normalized = question.question.strip().lower()
    for existing_text in existing_question_texts:
        similarity = difflib.SequenceMatcher(None, normalized, existing_text.strip().lower()).ratio()
        if similarity >= DUPLICATE_SIMILARITY_THRESHOLD:
            return False, f"Too similar to an existing question (similarity={similarity:.2f})."

    return True, None
