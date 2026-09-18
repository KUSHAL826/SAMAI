# Render Deployment Guide for SamAI

This guide provides simple, step-by-step instructions for deploying SamAI on **Render** using **Supabase** for PostgreSQL.

---

## Architecture on Render

```
  ┌─────────────────────────┐               ┌─────────────────────────┐
  │   Frontend (Next.js)    │  ──────────>  │   Backend (FastAPI)     │
  │   Render Web Service    │               │   Render Web Service    │
  └─────────────────────────┘               └────────────┬────────────┘
                                                         │
                                  ┌──────────────────────┼──────────────────────┐
                                  ▼                      ▼                      ▼
                    ┌──────────────────────────┐   ┌─────────────┐   ┌──────────────────────────┐
                    │ Supabase Postgres        │   │ Render Redis│   │ Celery Background Worker │
                    │ (Hosted Database)        │   │ (Queue)     │   │ Render Worker Service    │
                    └──────────────────────────┘   └─────────────┘   └──────────────────────────┘
```

---

## Step 1: Create Render Redis Instance

1. Go to [https://dashboard.render.com](https://dashboard.render.com) and click **New +** -> **Redis**.
2. **Name**: `samai-redis`
3. Select the **Free** plan.
4. Click **Create Redis**.
5. Once created, copy the **Internal Redis URL** (e.g., `redis://red-xxxxxxxx:6379`).

---

## Step 2: Deploy Backend API (Render Web Service)

1. On Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name**: `samai-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Click **Advanced** -> **Add Environment Variable** and add the following:

| Key | Value / Example |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres.[REF]:[PASS]@db.[REF].supabase.co:5432/postgres` |
| `DATABASE_URL_SYNC` | `postgresql+psycopg2://postgres.[REF]:[PASS]@db.[REF].supabase.co:5432/postgres` |
| `REDIS_URL` | `redis://red-xxxxxxxx:6379` *(from Step 1)* |
| `GEMINI_API_KEY` | `AIzaSy...` |
| `GEMINI_GENERATION_MODEL` | `gemini-2.0-flash` |
| `GEMINI_EMBEDDING_MODEL` | `models/text-embedding-004` |
| `GEMINI_EMBEDDING_DIM` | `768` |
| `JWT_SECRET_KEY` | *(Generate a long random string)* |
| `JWT_ALGORITHM` | `HS256` |
| `MAIL_USERNAME` | `your_email@gmail.com` |
| `MAIL_PASSWORD` | `your_gmail_app_password` |
| `MAIL_FROM` | `your_email@gmail.com` |
| `MAIL_SERVER` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `CORS_ORIGINS` | `*` *(or your frontend URL)* |
| `ENVIRONMENT` | `production` |

5. Click **Create Web Service**. Copy the API URL (e.g., `https://samai-api.onrender.com`).

---

## Step 3: Deploy Celery Worker (Render Background Worker)

1. On Render Dashboard, click **New +** -> **Background Worker**.
2. Connect the same repository.
3. Configure settings:
   - **Name**: `samai-worker`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `celery -A app.workers.celery_app worker --loglevel=info`
4. Copy the environment variables from your `samai-api` Web Service (you can use Render's **Environment Group** feature to share them automatically).
5. Click **Create Background Worker**.

---

## Step 4: Deploy Frontend (Render Web Service)

1. On Render Dashboard, click **New +** -> **Web Service**.
2. Connect your repository.
3. Configure settings:
   - **Name**: `samai-frontend`
   - **Root Directory**: `frontend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add Environment Variable:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://samai-api.onrender.com` *(from Step 2)* |

5. Click **Create Web Service**.

---

## Step 5: Initialize Database Migrations

Once your backend API is deployed on Render, open your local terminal and run migrations against Supabase:

```bash
cd backend
# Make sure DATABASE_URL_SYNC in backend/.env points to your Supabase URL
alembic upgrade head
```

Your SamAI application is now fully deployed and live on Render + Supabase!
