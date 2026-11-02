# Task 6-c — Company Matching & Shortlisting (Trainer)

## File delivered
`src/components/placepro/trainer/company-matching-page.tsx` — default export `CompanyMatchingPage`.
No other files were modified.

## What was built
Trainer portal → Company Matching page, client-side SPA section rendered by the existing route shell.

### Domain logic (the critical rule)
- **Eligibility** (binary, mandatory): `cgpa >= minCgpa` AND every `mandatory` criterion score `>= minCutoff`. Non-mandatory cutoffs never affect eligibility.
- **Compatibility** (0–100, ranking only): `Σ(score × weightage) / Σ(weightage)` over ALL criteria skills, normalised so weightage totals ≠ 100% still work (a warning is shown in the UI).
- A high compatibility never implies eligibility — ineligible rows still show their compatibility and a "Missing requirements" column with danger chips like `CGPA 6.8 < 7.0` / `DSA 52 < 60 (mandatory)`.

### Screen structure
1. **PageHeader** — "Company Matching" + required subtitle.
2. **Company selector** — responsive card row from `useAppStore().companies` (name, role, industry chip, Check badge + `border-primary bg-primary-soft/40` when selected) + "Demonstration profiles" note.
3. **Criteria panel** (`ChartCard`) — editable min CGPA (step 0.1, 5–10), criteria table (skill name via `SKILL_BY_ID`, cutoff 0–100, weightage shown as % with step 5 / 0–95 underlying fraction, mandatory `Switch`), warning left-accent + "Mandatory" StatusBadge on mandatory rows, weightage-total normalisation warning, "Apply criteria" (recomputes, toast) / "Reset to saved" (restores from store, toast). Local `draft` vs `applied` state with dirty indicator; nothing written back to the store.
4. **Results** — summary strip (Eligible success / Ineligible danger / Total), Tabs (Eligible / Ineligible / All with counts), SearchInput + PR/NPR FilterSelect + sort Select (compatibility, average, CGPA, name), ranked table (rank from compatibility order, UserAvatar candidate cell, CGPA highlighted danger when below cutoff, ScorePill per criterion with below-cutoff dot, mandatory dot in headers, MiniBar width 60 + % compatibility, PRBadge + Eligible/Ineligible status), checkbox selection (ineligible rows disabled, page-level select-all with indeterminate), selection bar with **working CSV export** (Blob + `URL.createObjectURL` + anchor download, filename `slug(company)-slug(role)-shortlist.csv`, "Shortlist exported" toast), pagination 10/page, EmptyState with "Clear filters" action.
5. **Footer note** — required explanatory line about score ≠ eligibility.

## Verification
- `bunx tsc --noEmit` → **0 errors** in `company-matching-page.tsx`.
- `bun run lint` → **0 errors/warnings** in this file (an initial `set-state-in-effect` flag was refactored into event-handler page resets).
- Dev server log: page compiles and serves `GET / 200`. (Unrelated `Module not found` entries for `students-page` / `student-profile-page` belong to other agents' pending files.)
