# SamAI

SamAI generates NEET, KCET and JEE practice questions strictly from the
textbooks, exam patterns and sample papers an institution uploads — never
from the open internet. Every generated question traces back to a real,
approved source.

## Structure

```
SamAI/
├── backend/      FastAPI + Celery backend (auth, RAG generation, admin APIs)
├── frontend/     Next.js frontend (student + admin portals)
├── PROCEDURE.md  Document upload order & RAG question generation procedure
├── supabase.md   Supabase (PostgreSQL + pgvector) setup guide
├── render.md     Render cloud deployment guide
└── SETUP.md      Full setup guide (Render + Supabase & local)
```

## Quick Start

See [SETUP.md](./SETUP.md), [PROCEDURE.md](./PROCEDURE.md), [supabase.md](./supabase.md), and [render.md](./render.md) for full deployment and operational details.

- **Database**: Hosted PostgreSQL with `pgvector` on [Supabase](./supabase.md).
- **Deployment**: Zero-Docker cloud deployment on [Render](./render.md).
- **Local Dev**: Run FastAPI backend, Celery worker, and Next.js frontend directly with Python & Node.js.


## Tech stack

- **Backend**: FastAPI, PostgreSQL, Redis, Celery, Gemini API
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS

## Notes

- `backend/.env` and `frontend/.env.local` are git-ignored — never commit
  real secrets. Use the `.env.example` / `.env.local.example` files as
  templates.
- `backend/uploads/` is kept in the repo (via `.gitkeep`) but its contents
  are git-ignored.
