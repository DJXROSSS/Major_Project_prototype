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
  gateway/                 # public API gateway on port 5000
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

The gateway listens on port 5000 and keeps the original public URLs unchanged. Service URLs may be overridden with variables such as `AUTH_SERVICE_URL=http://auth:4001`, which makes the setup deployable in containers.

## GitHub coding profiles

Apply the profile-intelligence tables in `sql/schema.updated.sql` before using these endpoints. Student routes require the existing student session:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/me/profiles` | List linked GitHub accounts and latest snapshots |
| POST | `/api/v1/me/profiles` | Connect a GitHub username and create a verification challenge |
| PATCH | `/api/v1/me/profiles/:profileId` | Change a username and issue a new ownership challenge |
| DELETE | `/api/v1/me/profiles/:profileId` | Disconnect the account and cascade its credentials and snapshots |
| POST | `/api/v1/me/profiles/:profileId/verify` | Verify the challenge against the public provider profile |
| POST | `/api/v1/me/profiles/:profileId/sync` | Fetch provider metrics and save raw and normalized snapshots |
| GET | `/api/v1/me/projects` | List a student's submitted repositories and score history summary |
| POST | `/api/v1/me/projects` | Submit a public GitHub repository for automated scoring |
| GET | `/api/v1/students/:studentId/projects` | List projects for trainer/admin review |
| POST | `/api/v1/students/:studentId/projects/:projectId/reviews` | Confirm ownership/viva, approve a trainer score, and save a score snapshot |
| POST | `/api/v1/me/profiles/github/oauth/start` | Start optional GitHub OAuth |
| GET | `/api/v1/me/profiles/github/oauth/callback` | Complete GitHub OAuth using its signed, short-lived state |

For manual verification, the response from `POST /me/profiles` contains a one-time token. Set the GitHub bio to exactly that token and call the verify endpoint. Only its SHA-256 hash is stored; challenges expire after 30 minutes and allow at most five attempts. A successful verification is required before synchronization.

GitHub OAuth is optional. Configure a GitHub OAuth app callback URL matching `GITHUB_OAUTH_REDIRECT_URI`, plus `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `PROFILE_OAUTH_STATE_SECRET` (at least 32 characters), and `PROFILE_OAUTH_ENCRYPTION_KEY` (base64-encoded 32-byte key). The state secret signs OAuth state; access and refresh tokens are encrypted with AES-256-GCM before being stored. Keep the encryption key in a secret manager, retain its key version for rotation, and never commit real values to `.env.example`.

Project scoring uses `project-v1`. The automated repository score checks README (20 points), tests (25), Docker (10), CI (20), live demo (10), and original-repository status (15). A trainer must confirm ownership and approve a 0–100 trainer score; viva completion is recorded but is not required for approval. The final project score is 40% automated + 60% trainer score. Each review/recalculation inserts a new `project_score_snapshots` row; previous score values and formula versions are retained. The student's project score is the average of the latest approved scores for verified projects. PR readiness requires a project score of at least 60 in addition to the existing skill-average, CGPA, and communication requirements. A missing approved project score leaves the student NPR. Existing company matching is unchanged unless a company adds the optional `PROJECT_SCORE` criterion.
