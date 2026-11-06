# PlacePro Prototype

PlacePro is a fullstack placement management prototype consisting of:
- **Backend**: Express-based microservices architecture behind an API Gateway (`placepro-backend`).
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, Radix UI (`placepro-frontend`).

---

## Quick Start

### 1. Start Both Services (Root)
From the root directory, simply run:
```bash
npm run dev
```
This concurrently starts:
- PlacePro Backend Gateway & Services on `http://localhost:5000`
- PlacePro Next.js Frontend on `http://localhost:3000`

### 2. Run Independently
To run individual services:
- **Backend only**:
  ```bash
  npm run dev:backend
  # or cd placepro-backend && npm run dev
  ```
- **Frontend only**:
  ```bash
  npm run dev:frontend
  # or cd placepro-frontend && npm run dev
  ```

---

## Service Architecture & Ports

| Component | Port | Description |
|-----------|------|-------------|
| **Frontend** | 3000 | Next.js Web App (`http://localhost:3000`) |
| **API Gateway** | 5000 | Gateway for all `/api/v1/*` routes |
| Auth Service | 4001 | `/api/v1/auth/*` |
| Dashboard Service | 4002 | `/api/v1/dashboard/*` |
| Students Service | 4003 | `/api/v1/students/*`, `/api/v1/me/*` |
| Assessments Service | 4004 | `/api/v1/assessments/*`, `/api/v1/assessment-imports/*` |
| Companies Service | 4005 | `/api/v1/companies/*` |
| Admin Service | 4006 | `/api/v1/users/*`, `/api/v1/batches/*`, `/api/v1/skills/*`, `/api/v1/audit-logs` |

---

## Environment Variables

### Backend (`placepro-backend/.env`)
```env
PORT=5000
GATEWAY_PORT=5000
AUTH_SERVICE_PORT=4001
DASHBOARD_SERVICE_PORT=4002
STUDENTS_SERVICE_PORT=4003
ASSESSMENTS_SERVICE_PORT=4004
COMPANIES_SERVICE_PORT=4005
ADMIN_SERVICE_PORT=4006
DATABASE_URL=postgresql://postgres:rudra%2300@localhost:5432/placepro
JWT_SECRET=placepro-super-secret-key
FRONTEND_URL=http://localhost:3000
```

### Frontend (`placepro-frontend/.env`)
```env
DATABASE_URL=file:/home/z/my-project/db/custom.db
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```
