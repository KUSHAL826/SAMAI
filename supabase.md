# Supabase Setup Guide for SamAI

Supabase provides a free, fully managed PostgreSQL database with native `pgvector` support, making it ideal for SamAI vector embeddings and data storage.

---

## Step 1: Create a Free Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and log in or create a free account.
2. Click **New Project**.
3. Fill in the details:
   - **Name**: `SamAI` (or any name)
   - **Database Password**: Set a strong password. **(Save this password!)**
   - **Region**: Select the region closest to your server or users (e.g., *Mumbai / Singapore / US East*).
4. Click **Create new project** and wait 1–2 minutes for your database to provision.

---

## Step 2: Enable the `pgvector` Extension

SamAI uses `pgvector` for similarity searches across textbook embeddings.

1. In your Supabase dashboard, click **SQL Editor** from the left navigation menu.
2. Click **New query**.
3. Paste the following SQL command:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Click **Run** (or press `Ctrl` + `Enter`). You should see `Success. No rows returned`.

---

## Step 3: Get Database Connection Strings

1. In Supabase, go to **Project Settings** (gear icon at the bottom left) -> **Database**.
2. Scroll down to the **Connection string** section.
3. Select the **URI** tab.

### URI Formats:

#### A. Direct Connection (Port 5432 - Recommended for Alembic Migrations)
```text
postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

#### B. Connection Pooling (Port 6543 - Recommended for FastAPI & Serverless)
```text
postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

> ⚠️ **Important Password Note**: If your password contains special characters (like `@`, `#`, `$`, `%`, `:`, `/`, `?`), you must **URL-encode** them (e.g., `@` becomes `%40`, `#` becomes `%23`).

---

## Step 4: Add Credentials to `.env` File

Open `backend/.env` (and your Render / deployment environment variables) and set the database URLs:

```env
# Async driver for FastAPI (add +asyncpg after postgresql)
DATABASE_URL=postgresql+asyncpg://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Sync driver for Alembic migrations (add +psycopg2 after postgresql)
DATABASE_URL_SYNC=postgresql+psycopg2://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

---

## Step 5: Run Database Migrations on Supabase

From your local machine or terminal, run Alembic migrations pointing to Supabase:

```bash
cd backend
alembic upgrade head
```

Once executed, all tables (`users`, `exams`, `subjects`, `chapters`, `topics`, `documents`, `document_chunks`, `questions`) will be created inside your Supabase database!
