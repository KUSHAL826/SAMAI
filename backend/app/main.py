from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.auth import router as auth_router
from app.api.v1.admin.curriculum import router as admin_curriculum_router
from app.api.v1.admin.documents import router as admin_documents_router
from app.api.v1.admin.patterns import router as admin_patterns_router
from app.api.v1.questions import router as questions_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="SamAI API",
    description="AI-Powered NEET, KCET & JEE Examination Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Serves locally-stored documents/PDFs when STORAGE_PROVIDER=local.
# In production (STORAGE_PROVIDER=r2) this is unused -- files are served
# via presigned R2 URLs instead.
if settings.STORAGE_PROVIDER == "local":
    app.mount("/files", StaticFiles(directory=settings.STORAGE_LOCAL_PATH), name="files")

app.include_router(auth_router)
app.include_router(admin_curriculum_router)
app.include_router(admin_documents_router)
app.include_router(admin_patterns_router)
app.include_router(questions_router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
