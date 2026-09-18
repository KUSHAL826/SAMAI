# SamAI — Setup & Deployment Instructions

Deployment Guides:
- **Cloud Deployment (Supabase + Render)**: See [supabase.md](./supabase.md) for database setup and [render.md](./render.md) for web/worker service deployment.
- **Local Development**: Follow instructions below for running directly with Python, Node, PostgreSQL & Redis.

---

## 0. Before you start: get your API keys

### Gemini API key (required)
1. Go to https://aistudio.google.com/apikey
2. Create a key (free tier is enough to start)
3. You'll paste this into `backend/.env` as `GEMINI_API_KEY`

### Email/SMTP credentials (required, for OTP emails)
Any SMTP provider works. Easiest for testing:
- **Gmail**: enable 2FA on your Google account, then create an
  [App Password](https://myaccount.google.com/apppasswords). Use your Gmail
  address as `MAIL_USERNAME`/`MAIL_FROM` and the 16-character app password
  as `MAIL_PASSWORD`.
- **Free alternatives with generous limits**: Brevo, Zoho Mail, Mailjet.

---

## 1. Cloud Deployment Setup (Render + Supabase)

### Step 1: Database Setup (Supabase)
Follow **[supabase.md](./supabase.md)** to:
1. Create a free Supabase project.
2. Run `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL Editor.
3. Obtain your `DATABASE_URL` and `DATABASE_URL_SYNC` connection strings.

### Step 2: Render Hosting Deployment
Follow **[render.md](./render.md)** to:
1. Create a free Redis instance on Render (`samai-redis`).
2. Deploy FastAPI backend (`samai-api`) as a Web Service.
3. Deploy Celery Worker (`samai-worker`) as a Background Worker.
4. Deploy Next.js frontend (`samai-frontend`) as a Web Service.

---


## 2. Manual setup (no Docker)

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16 with the `pgvector` extension
- Redis

### Install PostgreSQL + pgvector

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib postgresql-16-pgvector
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER samai WITH PASSWORD 'samai' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE samai OWNER samai;"
sudo -u postgres psql -d samai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**macOS (Homebrew):**
```bash
brew install postgresql@16 pgvector
brew services start postgresql@16
createuser samai --superuser
createdb samai -O samai
psql -d samai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Install Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo service redis-server start

# macOS
brew install redis
brew services start redis
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env:
#   - GEMINI_API_KEY, MAIL_* as described in step 0 above
#   - DATABASE_URL=postgresql+asyncpg://samai:samai@localhost:5432/samai
#   - DATABASE_URL_SYNC=postgresql+psycopg2://samai:samai@localhost:5432/samai
#   - REDIS_URL=redis://localhost:6379/0
#   - JWT_SECRET_KEY=<generate with: openssl rand -hex 32>

# Run migrations
alembic upgrade head

# Terminal 1: API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Celery worker (handles document processing + question generation)
celery -A app.workers.celery_app worker --loglevel=info
```

Verify: http://localhost:8000/health and http://localhost:8000/docs

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000  (already the default)

npm install
npm run dev
```
Open http://localhost:3000

---

## 3. First-time walkthrough

Once both servers are running:

1. **As admin** — go to http://localhost:3000/admin/upload
   - Type an exam code (e.g. `NEET`) and click **+ Add exam**
   - Type a subject (e.g. `Physics`) and click **+ Add subject**
   - Add a chapter (e.g. `Kinematics`) and a topic (e.g. `Motion in a Straight Line`)
   - Choose document type **Textbook / Study Material**, attach a `.txt`/`.pdf`/`.docx` file covering that topic, and upload
   - Watch the status panel — it will move through `uploaded → processing → ready` (takes longer for big PDFs; the Celery worker log shows progress)

2. **As a student** — go to http://localhost:3000/register
   - Register, check your email for the OTP, verify
   - You'll land on the dashboard authenticated with a real JWT

3. **Generate questions** (via API docs at `/docs` for now — the exam-taking UI isn't built yet):
   - `POST /api/v1/questions/generate` with the exam/subject/chapter/topic IDs, a difficulty, and a count
   - Poll `GET /api/v1/questions/generation-jobs/{job_id}` until `status: succeeded`
   - `GET /api/v1/questions?topic_id=...` to retrieve them

---

## 4. Common issues

| Symptom | Fix |
|---|---|
| `passlib`/`bcrypt` error on startup | Make sure `bcrypt==4.0.1` is installed (already pinned in requirements.txt) — newer bcrypt breaks passlib's version check. |
| `relation "vector" does not exist` or similar on migration | The `pgvector` extension wasn't created in the database — run the `CREATE EXTENSION IF NOT EXISTS vector;` command from step 1/2. |
| Alembic migration file errors on `Vector` type | Make sure `import pgvector.sqlalchemy` is present at the top of the generated migration file — the project's `script.py.mako` template already adds this automatically for new migrations. |
| OTP email never arrives | Check `MAIL_USERNAME`/`MAIL_PASSWORD` are correct; for Gmail you must use an App Password, not your normal password. Check spam folder. |
| Document stuck in `processing` / job `failed` with an embedding error | Usually means `GEMINI_API_KEY` is missing/invalid, or your server can't reach `generativelanguage.googleapis.com` (check firewall/network egress rules). |
| `npm run build` fails on `useSearchParams` | Already fixed in this codebase (both OTP pages are wrapped in `<Suspense>`) — if you see this again, it means a new page uses `useSearchParams` without a Suspense boundary. |
| Frontend can't reach the API (CORS or network error) | Confirm `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` matches where the API is actually running, and that `CORS_ORIGINS` in `backend/.env` includes your frontend's origin (default `http://localhost:3000`). |

---

## 5. What's implemented vs. still to build

See the project status summary from earlier in this conversation — in short: auth, document ingestion, and the AI question-generation engine are built and tested; the exam-taking interface, results/analysis, PDF export, and full-length mock assembly are not yet built.
