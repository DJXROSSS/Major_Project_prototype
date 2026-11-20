# PlacePro Data-Limit and Missing-Trainer Investigation

Investigation date: 2026-11-21

## Purpose and handoff instructions

This report records a read-only investigation of missing users and trainer names. Use it to draft a precise implementation prompt for ChatGPT/Codex. The investigation did not modify application code, database records, schemas, or branches. This Markdown file was subsequently created at the user's request.

When drafting the fix prompt:

- Preserve the existing Next.js, React, TypeScript, Zustand, Express gateway/services, and PostgreSQL architecture.
- Require the implementation agent to inspect current code before editing: paths and line numbers below describe the investigated working tree and may shift.
- Preserve unrelated uncommitted changes; the workspace already contains many changes.
- Do not reimport the dataset or merely raise the frontend limit.
- Distinguish code fixes from repairing existing trainer assignments. Do not guess which trainer should replace a dangling ID.
- Require appropriate tests and explicitly distinguish executed verification from proposed tests.
- Follow the repository's AGENTS.md and user-provided Kluster requirements. Kluster review was unavailable in this session due to a connection error; no automated review should be claimed.
- Treat the database results below as a point-in-time snapshot, not permanently fixed counts.

### A. Executive Summary

**Users were not truncated at 1,000 during the confirmed import. The main problem is that User Management fetches only the newest 100 users and searches that incomplete list.**

The code was inspected and PostgreSQL was queried inside read-only transactions.

| Finding | Verified result |
|---|---:|
| Total users | 1,870 |
| Users with STUDENT role | 1,866 |
| Trainers | 3 |
| Administrators | 1 |
| Records in the separate students table | 2,363 |
| Latest confirmed registration import | 1,863 imported, 0 skipped |
| Imported user IDs still present | All 1,863 |

The trainer symptoms have both shared and independent causes:

- Advay Sharma, user ID 24, exists but ranks 1,865th in the API's newest-first ordering. The first 100 users exclude him.
- Rudra Gupta, user ID 3147, ranks first, so the frontend includes him.
- Priya Nair, user ID 14, ranks 1,868th, so the frontend excludes her.
- Four batch assignments reference user ID 2, which does not exist. Pagination fixes cannot repair these assignments.
- Numeric JSON trainer IDs also conflict with the frontend's string-ID comparison.

A separate, real 1,000-student retrieval limit exists in the shared frontend roster loader. It is not the User Management limit.

### B. Confirmed Root Causes

#### 1. User Management searches only the newest 100 users

Locations:

- `placepro-frontend/src/lib/placepro/api.ts`, `api.users`, lines 244–245.
- `placepro-frontend/src/lib/placepro/store.ts`, `refreshData`, lines 155–157.
- `placepro-frontend/src/components/placepro/admin/user-management-page.tsx`, `UserManagementPage`, lines 102–113.

Relevant code, with unrelated fields omitted:

```ts
users: async (params = {}) =>
  pageItems(await request("/users" + qs({ pageSize: 100, ...params })))
```

```ts
const [users, auditResponse] = await Promise.all([
  api.users(),
  api.auditLogs()
]);
set({ users, /* other refreshed state */ });
```

```ts
return users.filter((u) => {
  if (q && !u.name.toLowerCase().includes(q)
        && !u.email.toLowerCase().includes(q)) return false;
  if (roleFilter !== "all" && u.role !== roleFilter) return false;
  return true;
});
```

The store requests one page and replaces its users array. The API wrapper discards `total`, `page`, and `pageSize` through `pageItems`.

The table calculates page count from `filtered.length` and slices ten records per page:

```ts
const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
const safePage = Math.min(page, pageCount);
const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
```

These operations correctly paginate the loaded subset, but that subset is not the complete database. A search cannot find a user who was never loaded.

Affected operations: user search, role filters, displayed totals, pagination, and consumers treating `s.users` as a complete directory.

#### 2. Batch trainer resolution depends on the incomplete users array

Location: `placepro-frontend/src/components/placepro/admin/batch-management-page.tsx`, `BatchManagementPage`, lines 214–221.

```tsx
b.trainerIds.map((id) => {
  const t = users.find((u) => u.id === id);
  // Rendered label:
  // <span>{t?.name ?? "Unknown trainer"}</span>
})
```

The assignment picker has the same dependency at line 50:

```ts
const trainers = useMemo(
  () => users.filter((u) => u.role === "trainer"),
  [users]
);
```

Existing trainers outside the first 100 users are absent from both name resolution and the assignment picker.

#### 3. Inconsistent trainer-ID types and dangling assignments

Locations:

- `placepro-backend/src/services/admin/controllers/admin.controller.js`, `GET /batches`, line 138.
- Same file, `POST /batches`, lines 148–165, and `PATCH /batches/:batchId`, lines 172–208.
- `placepro-backend/src/utils/registration.js`, `registerAccount`, lines 202–205.
- `placepro-backend/sql/schema.updated.sql`, `academic_batches`, line 35.

Batch responses expose JSON values without normalization:

```js
trainerIds: b.trainer_ids || []
```

User responses normalize IDs to strings:

```js
id: String(u.user_id)
```

Trainer registration appends string IDs:

```sql
trainer_ids = COALESCE(trainer_ids,'[]'::jsonb) || to_jsonb($1::text)
```

Existing seed files write numeric IDs:

```sql
'[2]'::jsonb
```

Strict frontend equality fails for a string ID versus a numeric ID, even if the user exists. The live database also contains genuinely nonexistent IDs:

| Batch ID | Stored trainer IDs | Verified interpretation |
|---|---|---|
| 2 | `2` | User does not exist |
| 3 | `"24"`, `"14"`, `"3147"`, `2` | Three existing trainers and one nonexistent user |
| 4 | `"24"`, `2` | Existing trainer and nonexistent user |
| 5 | `2` | User does not exist |
| 50 | `"14"` | Existing trainer |

The JSONB array has no foreign-key enforcement for its elements. Batch create/update handlers serialize supplied IDs without verifying they identify trainers.

The observed numeric `2` assignments are dangling. Their current failure cannot be attributed solely to number/string mismatch.

Hardcoded `2` occurs in `placepro-backend/sql/seed.sql:14` and `placepro-backend/sql/seed-demo-students.sql:21`. This is a plausible origin, but execution history was not established.

#### 4. Incorrect totals on empty out-of-range user pages

Location: `placepro-backend/src/services/admin/controllers/admin.controller.js`, `GET /users`, lines 30–56.

```sql
SELECT ..., COUNT(*) OVER() AS total_count
FROM users
WHERE ...
ORDER BY created_at DESC
LIMIT ... OFFSET ...
```

```js
total: rows.length ? Number(rows[0].total_count) : 0
```

If matching users exist but OFFSET exceeds the last row, no returned row carries the window count. The API reports zero instead of the true matching total.

Additional confirmed code problems:

- Pagination inputs use `parseInt` and `Math.max` without strict validation or a finite upper bound.
- Ordering has no unique tie-breaker. Imported users can share timestamps, so page boundaries are not deterministic.

These defects are separate from the current local-search failure.

#### 5. Shared student roster fetches only one page of 1,000

Locations:

- `placepro-frontend/src/lib/placepro/api.ts`, `api.students`, line 176.
- `placepro-frontend/src/lib/placepro/store.ts`, `refreshData`, lines 144–159.
- `placepro-backend/src/services/students/controllers/students.controller.js`, student-list handler, line 131.

```ts
students: () =>
  request<{ items: Student[] }>("/students?pageSize=1000")
```

```js
const ps = /^\d+$/.test(pageSize)
  ? Math.min(1000, Math.max(1, Number(pageSize)))
  : 10;
```

The backend supports pagination, but the shared loader does not fetch subsequent pages.

Batch statistics filter this partial students store. `liveStudentCount` also prefers a positive local count to the backend count, which can undercount a batch.

The dedicated trainer Students page already uses server-side pagination and is not inherently limited to 1,000 total records.

### C. Data Flow Analysis

#### Registration import

1. `registration-import.tsx:142` selects an XLSX, XLS, or CSV file.
2. Lines 166–175 check the 5 MB size limit, create FormData, and send the original file.
3. `api.ts:166` calls `/users/imports/:kind/preview`.
4. The gateway streams the request to the admin service.
5. `registration-imports.js:34` uses Multer memory storage, one file, maximum 5 MB.
6. `parseFile`, lines 98–155, uses SheetJS `xlsx`, reads the first worksheet, and sets `sheetRows: MAX_ROWS + 2`, with `MAX_ROWS = 5000`.
7. The parser checks `!fullref` and row count to reject oversized imports, validates required registration headers, skips fully blank rows, retains row numbers, and detects formulas.
8. `validateRows`, lines 168–243, checks required fields, repeated emails/roll numbers, batches, and account identity using `registerAccount(..., validateOnly: true)`.
9. Preview saves a registration session and returns validation rows and counts. Preview writes session metadata, not user accounts.
10. Confirmation locks the session and revalidates all rows.
11. Valid rows are registered sequentially inside one transaction with per-row savepoints.
12. Strict mode rejects/rolls back on failure. Valid-only mode skips rejected rows and records failures.
13. The response includes imported/skipped counts, per-row outcomes, and an error report.
14. The frontend calls `refreshData`.
15. **The displayed users dataset becomes incomplete at retrieval: only the newest 100 are requested.**

No 1,000-row import loop, chunk cap, or silent `slice(0, 1000)` was found in this pipeline.

Registration is not a bulk SQL upsert. It inserts individual accounts and either links existing matching student records or creates students. Existing login accounts are classified and skipped rather than overwritten.

Important validation details in `registration.js`:

- Normalizes email and mobile number; validates name, email, Indian mobile number, IDs, roll number, CGPA, active batches, and section.
- Checks existing users and student identity conflicts.
- Uses advisory locking and database uniqueness constraints.
- Hashes each temporary credential with bcrypt cost 12.
- Uses the caller's transaction when supplied; otherwise opens its own transaction.

The shared Express service JSON limit is 5 MB. Multipart file limits are enforced by Multer. The gateway proxy streams requests; no record-count cap was found there.

#### User retrieval and rendering

```text
PostgreSQL users
  -> GET /users?pageSize=100
  -> newest 100 items plus total
  -> API wrapper discards pagination metadata
  -> Zustand replaces users
  -> local name/email search and role filter
  -> local pages of 10
```

#### Batch trainer names

```text
academic_batches.trainer_ids
  -> GET /batches returns raw JSON IDs
  -> frontend searches limited users array with strict equality
  -> missing match displays Unknown trainer
```

### D. Evidence

#### Database and environment consistency

The read-only connection using backend configuration returned:

```text
Database: placepro
Server address: ::1
Port: 5433
```

Backend `.env` targets `localhost:5433/placepro`. Frontend `NEXT_PUBLIC_API_URL` is `http://localhost:5000/api/v1`.

`placepro-backend/src/config/db.js:5` loads dotenv and initializes a PostgreSQL pool from DATABASE_URL with `max: 20`. This is a connection limit, not a row limit.

`scripts/start-all.js` loads the backend environment and launches services with the backend directory as their working directory. Individual processes may still inherit environment overrides. Gateway defaults route the admin service to port 4006.

The frontend also has an older SQLite/Prisma configuration. The inspected user-management path uses Express, and no frontend source consumers importing `@/lib/db` were found.

Not verified: pgAdmin's actual connection settings, environment overrides in already-running service processes, or authenticated browser API responses. The configured database is confirmed; identity with the pgAdmin session still needs comparison.

#### Scenario classification

| Scenario | Finding |
|---|---|
| A: Import stops at 1,000 | Ruled out for the inspected confirmed import: all 1,863 imported IDs remain present |
| B: Backend cannot return beyond 1,000 users | Ruled out as a fixed `/users` cap; the frontend requests only 100 and the API supports pages |
| C: Store has an incomplete subset | Confirmed: one users page and one 1,000-student roster page |
| D: Frontend hides records | Confirmed: local filtering/page totals operate on incomplete state |
| E: Multiple independent problems | Confirmed: pagination, lookup dependence, dangling IDs, and mixed ID types |

#### Dataset reconciliation

No `users.csv` was available in the workspace for row-by-row comparison. The user's stated 1,870 CSV records match the user-table count, but equal counts do not prove identical records.

The recorded confirmed application import was `StudentData_CSE-2023-27_filled.xlsx`, with 1,863 rows. Its result IDs all resolve to existing users. Its import ID is `ba3afdb2-f72c-42c6-bb0e-a115e30f5c14`.

A raw PostgreSQL users export may not satisfy the application's required registration headers.

#### Other observations and limitations

- The UI and generated template say 200 records; backend enforcement is 5,000.
- The registration frontend's `1000` is a URL-revocation delay, not a row limit.
- Other 500/1000 matches include HTTP statuses, animation/timer values, and unrelated limits.
- Company matching requests 1,000 results separately; it does not populate User Management.
- On refresh failure, the store retains previous data and sets `dataError`; it does not silently substitute demo users.
- User Management uses a 550 ms loading timer rather than actual request completion and does not consume `dataError`.
- Overlapping `refreshData` calls have no stale-response guard. This is a code-level race risk, not a demonstrated cause of these missing trainers.
- The admin dashboard's `FacultyDirectory` already fetches trainer-filtered pages until exhausted (`admin-dashboard.tsx:232–254`). This confirms existing endpoints can support a complete trainer directory.
- The trainer Students page already debounces server-side search and guards superseded responses (`students-page.tsx:80–100`).
- Live schema inspection confirmed user/student uniqueness and student foreign keys, but no foreign keys for individual JSONB trainer IDs.
- The inspected live indexes do not cover the users newest-first ordering.

### E. Recommended Fixes

#### 1. Use server-side user filtering and pagination

Add a metadata-preserving method while retaining `api.users` compatibility for other callers:

```ts
listUsers(params): Promise<Paginated<AppUser>>
```

User Management should request:

```ts
api.listUsers({
  q: search.trim(),
  role: roleFilter === "all" ? undefined : roleFilter,
  page,
  pageSize: 10,
});
```

Render response.items directly and calculate page count from response.total. Reset page on filter changes, debounce search, discard stale responses, and refetch after imports/additions/edits. Use actual request loading/errors, not a timer.

Compatibility: no database migration. Keeping the old helper avoids breaking FacultyDirectory and other callers.

#### 2. Resolve batch trainers independently of the user table page

Extend GET /batches with additive trainer summaries, retaining trainerIds:

```ts
{
  trainerIds: ["24", "14"],
  trainers: [
    { id: "24", name: "Advay Sharma" },
    { id: "14", name: "Priya Nair" }
  ]
}
```

Resolve JSON elements as text and join against users.user_id::text. Preserve unresolved IDs explicitly instead of silently dropping them.

The assignment picker should load trainer-filtered data independently. For larger trainer populations, use server-side search.

Compatibility: additive response fields; no schema migration needed. Existing clients can continue using trainerIds.

#### 3. Normalize and validate trainer assignments

At batch API boundaries:

- Accept valid numeric/string IDs for backward compatibility.
- Normalize to deduplicated strings.
- Verify every supplied ID exists and belongs to a trainer.
- Define how inactive trainers are handled.
- Return canonical string IDs.

Review assignments to nonexistent ID 2 with the administrator. Do not infer a replacement person. Correct seed scripts to resolve intended trainers through stable identity instead of a hardcoded numeric ID.

Migration concerns: runtime normalization handles mixed storage without migration. Fixing existing dangling assignments is a separate approved data operation.

#### 4. Correct user totals, validation, and stable ordering

Within GET /users:

```text
Validate page and pageSize strictly; bound pageSize
Build shared filters
Count matching users independently of returned page rows
Fetch requested page
ORDER BY created_at DESC, user_id DESC
Return items and the real total
```

Use a consistent database snapshot if count/page consistency during concurrent writes is required. Preserve the existing response shape.

#### 5. Stop treating a 1,000-student page as a complete roster

Use backend studentCount for batch counts. Compute batch statistics over the full matching database population. Keep student tables server-paginated.

If an operation truly needs every student, explicitly iterate pages and retain total/completeness metadata. Do not solve this by fetching 50,000 users into Zustand.

#### 6. Align import messaging and improve scalability incrementally

Change UI and generated template instructions to the enforced limit: 5,000 records, 5 MB.

| Scale | Current assessment |
|---|---|
| 1,000 users | User Management is already incomplete above 100 |
| 5,000 users | API pagination exists; shared local lists remain incomplete |
| 10,000 users | Must use pagination; a single registration upload exceeds the 5,000-row contract |
| 50,000 users | Avoid full-directory state; measure query and deep-page latency |
| 5,000-row import | Permitted subject to 5 MB; duration was not benchmarked |
| 10,000/50,000-row import | Requires multiple imports under the current contract |

Current import costs: sequential validation queries, repeated account checks, per-account bcrypt cost 12, long transactions, batch-row locks, large result payloads, and rendering every preview row.

Start with bulk prevalidation lookups and paginated preview rendering. Preserve per-user hashing and transaction semantics. Introduce resumable/background processing only if measured durations require it, without a new microservice.

For retrieval, examine query plans before adding indexes. Newest-first ordering, deep OFFSET pages, substring ILIKE searches, and per-user batch relationship lookups deserve measurement at 50,000 users. Consider keyset pagination only when required by measured performance.

### F. Priority Ranking

| Priority | Change |
|---|---|
| P0: Integrity | Review dangling assignments and prevent nonexistent/non-trainer IDs |
| P1: Missing users | Server-side search/pagination with retained totals |
| P1: Missing trainer names | Resolve independently of the users page; normalize ID types |
| P1: Incorrect results | Correct empty-page totals and stable ordering |
| P1: Incomplete roster | Remove dependence on the first 1,000 students for complete statistics |
| P2: Reliability/performance | Request-bound loading/errors, stale-response guards, bounded pagination, profiling |
| P3: Clarity | Correct 200-versus-5,000 messaging |

No confirmed loss of imported user accounts was found.

### G. Verification Plan

#### Read-only SQL diagnostics

Run against the backend-configured database and separately in pgAdmin:

```sql
BEGIN READ ONLY;

SELECT current_database(), inet_server_addr(), inet_server_port();

SELECT role, count(*) FROM users GROUP BY role;

SELECT user_id, full_name, email, role, status
FROM users
WHERE user_id IN (24, 3147)
   OR lower(email) = '7017advay248@gmail.com';

WITH ranked AS (
  SELECT user_id,
         row_number() OVER (
           ORDER BY created_at DESC, user_id DESC
         ) AS position
  FROM users
)
SELECT * FROM ranked WHERE user_id IN (24, 3147);

SELECT b.academic_batch_id,
       b.name,
       e.value AS stored_id,
       jsonb_typeof(e.value) AS stored_type,
       u.user_id,
       u.full_name,
       u.role
FROM academic_batches b
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(b.trainer_ids) = 'array'
       THEN b.trainer_ids ELSE '[]'::jsonb END
) e(value)
LEFT JOIN users u ON u.user_id::text = (e.value #>> '{}')
ORDER BY b.academic_batch_id;

SELECT import_id, source_filename, status,
       result->>'imported' AS imported,
       result->>'skipped' AS skipped
FROM registration_imports
ORDER BY created_at DESC;

ROLLBACK;
```

The investigation executed read-only queries for connection identity, counts, target users, ranking, trainer links, import summaries, import-ID reconciliation, indexes, and constraints. The query examples above are reproducible diagnostics; the proposed stable ranking adds user_id as a tie-breaker, whereas the observed ranks were obtained using the current created_at-only ordering.

#### Safe API requests

Using an existing authenticated admin session and the configured API URL:

```text
GET /api/v1/users?page=1&pageSize=100
GET /api/v1/users?q=7017advay248%40gmail.com&page=1&pageSize=10
GET /api/v1/users?role=trainer&page=1&pageSize=100
GET /api/v1/users?page=99999&pageSize=10
GET /api/v1/batches
GET /api/v1/students?page=1&pageSize=1000
GET /api/v1/students?page=2&pageSize=1000
```

Authenticated API tests were not executed during this investigation.

Expected checks after fixes:

1. Email search returns trainer 24 outside the first page.
2. Trainer filtering returns all three current trainers.
3. A stable total of 1,870 yields 187 ten-row pages.
4. Out-of-range pages retain the true total.
5. Equal timestamps do not cause pagination duplicates/omissions.
6. Batch trainer names resolve independently of the viewed users page.
7. ID 2 remains explicitly unresolved until corrected by an administrator.
8. Student page 2 proves retrieval continues beyond 1,000.

#### Proposed tests in an isolated test database

- Import 1,870 valid unique rows and reconcile each successful result ID.
- Test 5,000 rows, 5,001 rows, and files over 5 MB.
- Test duplicates, blank rows, invalid headers, invalid batches, formulas, and existing accounts.
- Verify strict rollback, valid-only outcomes, and repeated-confirmation idempotency.
- Test string/numeric trainer IDs, nonexistent IDs, and wrong-role IDs.
- Test rapid search changes, slow responses, failed refreshes, and post-import refresh.
- Benchmark listing at 1,000, 5,000, 10,000, and 50,000 users.

No imports, migrations, write-based tests, or scale benchmarks were run during this investigation.

### H. Files That Would Need Modification

Existing files relevant to the complete correction:

- `placepro-frontend/src/lib/placepro/api.ts`
- `placepro-frontend/src/lib/placepro/store.ts`
- `placepro-frontend/src/components/placepro/admin/user-management-page.tsx`
- `placepro-frontend/src/components/placepro/admin/batch-management-page.tsx`
- `placepro-frontend/src/types/index.ts` — verify the Batch declaration and extend its response typing
- `placepro-backend/src/services/admin/controllers/admin.controller.js`
- `placepro-frontend/src/components/placepro/admin/registration-import.tsx`
- `placepro-backend/src/services/admin/registration-imports.js`
- `placepro-backend/sql/seed.sql`
- `placepro-backend/sql/seed-demo-students.sql`

Existing registration tests can be extended in `placepro-backend/tests/registration-imports.test.js`.

No new application files or schema migration are required for the core retrieval/name-resolution fixes. The exact scope of optional statistics/performance work should be confirmed against current consumers before implementation.

### I. Final Recommendation

Make User Management use the existing paginated users API, preserve totals, and resolve batch trainers independently of that page. Normalize and validate trainer IDs, then separately review the four references to nonexistent user ID 2.

**Do not reimport the dataset to solve this display problem.** All 1,863 accounts from the inspected confirmed import are present. Increasing the frontend limit would merely postpone the same failure.
