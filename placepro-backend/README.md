# PlacePro backend

PlacePro is an Express and PostgreSQL API composed of independent Node.js services behind an API gateway. The services retain the shared database schema and existing controller logic, so the public API contract and transaction behaviour are preserved.

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

Build with `npm run build`, then start the gateway and every service with `npm start`.

## Service layout

```
src/
  gateway/                 # public API gateway on port 4000
  services/
    auth/
      controllers/         # authentication HTTP handlers
      routes/              # authentication endpoints
      app.js               # service-specific Express application
      server.js            # Auth server on port 4001
    dashboard/
    students/
    assessments/
    companies/
    admin/
    shared/                # reusable Express application setup
  config/                  # shared PostgreSQL connection and transaction helpers
  middleware/              # shared authentication, authorization and errors
  utils/                   # shared student-readiness domain calculations
```

Controllers are the API's presentation layer: they translate HTTP requests and PostgreSQL model results to the existing JSON contract. `config/db.js` is the shared persistence model gateway, and `utils/student-metrics.js` holds the student readiness domain model. Views are intentionally not included because this is a JSON API; the frontend is the view layer.

## Public API compatibility

All existing routes remain under `/api/v1`, including `/auth`, `/dashboard`, `/students`, `/me`, `/assessments`, `/assessment-imports`, `/companies`, `/users`, `/batches`, `/skills`, and `/audit-logs`. Authentication continues to use the `placepro_session` HTTP-only cookie and the same JWT and role rules.

## Services and gateway routes

| Service | Port | Gateway routes |
| --- | ---: | --- |
| Auth | 4001 | `/api/v1/auth/*` |
| Dashboard | 4002 | `/api/v1/dashboard` |
| Students | 4003 | `/api/v1/students/*`, `/api/v1/me/*` |
| Assessments | 4004 | `/api/v1/assessments/*`, `/api/v1/assessment-imports/*` |
| Companies | 4005 | `/api/v1/companies/*` |
| Admin | 4006 | `/api/v1/users/*`, `/api/v1/batches/*`, `/api/v1/skills/*`, `/api/v1/audit-logs` |

The gateway listens on port 4000 and keeps the original public URLs unchanged. Service URLs may be overridden with variables such as `AUTH_SERVICE_URL=http://auth:4001`, which makes the setup deployable in containers.
