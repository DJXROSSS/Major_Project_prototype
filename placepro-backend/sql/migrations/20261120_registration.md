# Student and trainer registration

Apply from the repository root:

```powershell
node placepro-backend/scripts/migrate-registration.js
```

Restart the backend services after applying the migration. It adds nullable `users.mobile_number`, `must_change_password` (default false), `auth_version` (default zero), and normalized unique indexes for user/student emails and student roll numbers. Existing passwords and password-change statuses are preserved. Existing normalized duplicates cause a safe migration failure; no records are merged or deleted.

Admin registration uses `POST /api/v1/students` and `POST /api/v1/users/trainers`. The existing `POST /users` delegates student/trainer registrations to the same implementation. Student fields: name, email, mobileNumber, rollNumber, academicBatchId, section, and optional cgpa. Trainer fields: name, email, mobileNumber, and assignedBatchIds. Trainers use the existing `academic_batches.trainer_ids` assignment array. Department comes from selected batches; no separate department or faculty-ID model was introduced.

The normalized 10-digit Indian mobile number is the initial password. Only its bcrypt hash is stored as a credential; the mobile number is stored separately as contact information. Creation responses never include the password or hash. Users must change this password via `POST /auth/change-password` with currentPassword and newPassword. New passwords require at least 12 characters, letters and numbers, and at most 72 UTF-8 bytes. Password rotation invalidates earlier JWTs. The shared auth middleware reads the database on every request and blocks all ordinary protected routes until password change completes, including direct API requests.

Existing unlinked students can receive accounts only when normalized name, email, roll number and existing batch agree. Their student ID, CGPA, scores, assessments and projects remain intact. Existing linked students are rejected. Registration, linking, trainer assignments and audit logging commit in one transaction.

Run tests from `placepro-backend`:

```powershell
node --test tests/registration.test.js tests/company-eligible-batches.test.js tests/shortlist-csv.test.js tests/github-statistics.test.js
```

Tests use temporary PostgreSQL schemas and run against the full schema. Run `npm test` from the backend directory for all regression tests.

Login and password-change rate limiting is per auth-service process (15 attempts per IP/account in 15 minutes). Multiple auth replicas need a shared limiter before scaling. Credentials are not automatically sent by email or SMS. The admin should communicate the initial-login instructions through the institution's existing process.

## Excel/CSV registration

Apply the additional import-session migration with `node placepro-backend/scripts/migrate-registration-imports.js` from the repository root. It creates only import metadata; it does not register accounts or change existing credentials.

Admin endpoints use `/api/v1/users/imports/students` or `/api/v1/users/imports/trainers`:

- `GET /template`: downloads an Excel template through the existing base64 JSON download contract.
- `POST /preview`: multipart `file`; student uploads also require `academicBatchId` selected in the dialog. Accepts xlsx, xls and CSV, up to 5 MB and 200 rows.
- `POST /confirm`: `{ importId, mode }`, with `valid-only` or `strict` mode.

Preview creates an owner-scoped metadata session with a 24-hour expiry, but no accounts. Confirmation revalidates current database records, locks the session, and stores the result for safe retries. Valid-only imports use a savepoint for each account; strict imports roll back the whole transaction on failure. Confirmation clears submitted rows from the session. Expired unconfirmed sessions cannot be confirmed; administrators can purge their metadata under their retention policy.

The dialog offers templates, preview statuses, summary counts, error CSV download and confirmation results. Students inherit the selected batch; trainers use existing batch IDs or names separated by semicolons. Identity conflicts are rejected, and linking an existing student preserves scores and project history. Mobile numbers are redacted in downloadable error reports and persisted results because they are temporary credentials.
