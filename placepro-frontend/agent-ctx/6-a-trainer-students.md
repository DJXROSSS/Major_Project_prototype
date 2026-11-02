# Task 6-a — Trainer: Students Listing + Student 360° Profile

## Files written (only these two, no other file touched)
- `src/components/placepro/trainer/students-page.tsx` — default export `StudentsPage`
- `src/components/placepro/trainer/student-profile-page.tsx` — default export `StudentProfilePage`

## StudentsPage (Trainer → Students)
- `PageHeader` "Students" with live total count + "Import results" button → `navigate("import")`.
- Filter toolbar in a bordered Card above the table: `SearchInput` (name/roll), `FilterSelect`s for
  Batch (BATCHES), Section (A/B), Placement status (PR/NPR), Domain (DOMAIN_GROUPS labels — keeps
  students whose `studentDomainScore < 60` in that domain), Sort (avg desc/asc, CGPA desc, Name A→Z),
  plus a "Reset filters" ghost button rendered only while any filter is active.
- Table (enterprise markup per design system): Student (avatar + name + 12px muted email), Roll,
  Batch·Section, CGPA, DSA / Core CS (dbms+os+cn+oops avg) / Development (java+springboot avg) /
  Communication as `MiniBar width={36}`, Average `MiniBar`, `PRBadge`, View outline button.
- Rows clickable → `navigate("student-profile", { studentId })`; View button stops propagation and
  navigates too. 10 rows/page with `TablePagination`; filter changes reset page via handler wrappers
  (no setState-in-effect — lint clean).
- Simulated 500ms first-mount loading with `TableSkeleton`; `EmptyState` (UsersRound) with reset
  action when filters match nothing.

## StudentProfilePage (Student 360°)
- Reads `route.params.studentId`, `STUDENT_BY_ID` lookup, `getAssessmentHistory`. Unknown id →
  ghost "← Students" back button + `EmptyState`.
- Identity card: `UserAvatar lg`, name 20px semibold, roll + email, batch · section, CGPA chip
  (primary-soft), `PRBadge`; right side "View all students" ghost + **working "Download report"**
  button — builds a plain-text report (info, domain averages, skill scores, full assessment
  history, latest trainer feedback) and downloads via `Blob` + `URL.createObjectURL` + anchor click.
- Summary tile strip inside the identity card (gap-px dividers, 2 cols → 4 on lg): Overall %,
  Total assessments, Technical score (7-skill avg), Communication score. 24px semibold values,
  12px muted labels, small primary-soft icon squares.
- Tabs (shadcn):
  - **Overview**: Radar chart of 4 domains (#245C45, fillOpacity 0.15) + Line chart of
    `student.trend` (X = assessment 1..n), both in `ChartCard`, h-[260px] ResponsiveContainer;
    domain breakdown rows with per-skill MiniBars; "Strong Areas" (≥75, success accents,
    "Averaged X% across N assessments") vs "Areas to Target" (<60, warning/danger accents +
    per-domain guidance text); latest approved `TrainerFeedback` card (technical/communication/
    behavior + strengths ✓ / weaknesses ✗ / improvements → lists).
  - **Assessments**: history sorted date desc — name, StatusBadge type (Exam=info /
    Mock Interview=warning), "12 Jan 2026" formatted date, marks/max, `ScorePill` percentage,
    header summary "N assessments · average X%", empty state if none.
  - **Skill Analysis**: vertical BarChart of every skill in `student.scores` with `ReferenceLine`
    y=60 (#D99A36 dashed) and tone-coloured bars (green/amber/red); per-skill table with domain,
    MiniBar, StatusBadge Strong/Developing/Needs attention via `scoreTone`.
  - **Interview Feedback**: approved mock-interview feedback cards (matched through assessment
    type in history) with Technical/Communication/Behavior + strengths/weaknesses/improvements;
    EmptyState "No interview feedback yet" when none.
- Responsive: `grid-cols-2 → lg:grid-cols-4` tiles, `lg:grid-cols-2` chart/section grids,
  `overflow-x-auto` + min-w on tables, fixed chart heights, `sm:` stacked card headers.

## Verification
- `bunx tsc --noEmit` → **zero errors** in both files (remaining project errors are pre-existing
  in `src/lib/placepro/mock-data.ts:231`, `examples/`, `skills/` — not touched per task rules).
- `bun run lint` → **no findings** in either file (remaining 2 errors are in other agents'
  admin pages / app-shell).
- Dev server compiles clean (`GET / 200`), per `/home/z/my-project/dev.log`.

## Notes for other agents
- `student-profile` route is fully functional; navigate with
  `navigate("student-profile", { studentId })` (e.g. from company-matching or student portal).
- Domain "weak" filter semantics: `studentDomainScore(student, domain) < 60`.
- Feedback type split: overview card shows the latest approved feedback of any kind; the
  "Interview Feedback" tab only shows records whose linked assessment is a `mock-interview`
  (s13/s16/s20 feedback is exam-linked so it appears in Overview only, s21 is unapproved).
