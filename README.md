# CSE Student Placement Intelligence System (Node.js + Express + PostgreSQL Prototype)

This package contains the complete working prototype powered by **Node.js + Express** on the backend and **PostgreSQL relational tables + JSONB** on the database:

1. **`db/`**: PostgreSQL schema migration and repeatable demo data seed, using `JSONB`.
2. **`backend/`**: Node.js + Express REST API (`server.js`) using `pg`, `multer`, and `xlsx` (SheetJS) for unstructured Excel parsing, Dynamic Column Mapping, Student 360° aggregation, and Company Matching.
3. **`frontend/index.html`**: Zero-build React 18 + Tailwind CSS frontend with all 3 portals (Trainer Portal, Student 360° Portal, Admin Portal).
4. **`sample_excel_sheets/`**: Two unstructured Excel files (`sample_weekly_exam_messy.xlsx` and `sample_mock_interview_messy.xlsx`) with arbitrary extra columns to test your upload pipeline immediately.

## How to Run on Your PC in 3 Steps

### Step 1: Create and Set Up the PostgreSQL Database
Create an empty database:
```bash
createdb placement_intelligence
```
Set `DB_HOST`, `DB_PORT` (default `5432`), `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `backend/.env`, or provide a `DATABASE_URL` connection string. The PostgreSQL user must have access to the database.

### Step 2: Start the Node.js Backend
Inside the `backend/` folder, install dependencies, apply the schema migration and sample data, then start the server:
```bash
cd backend
npm install
npm run db:setup
npm start
```
Run `npm run db:migrate` to apply pending schema changes, or `npm run db:seed` to reapply the idempotent demo data seed.
The migration runner records applied SQL and checksums; keep `db/schema.sql` immutable after it has been applied and add later changes as numbered `db/migrations/002_description.sql` files.
The Node.js API will start at `http://localhost:8080`.

### Step 3: Open the Frontend
Simply double-click `frontend/index.html` in any browser (or serve it via VS Code Live Server / `python -m http.server 3000`).
- Even before starting the backend, `frontend/index.html` loads in **Demo Mode** so you can click through the dashboards immediately. Once the Node.js server is running on `:8080`, the top status indicator turns **Green (Connected to Node.js + Express + PostgreSQL)**.
