# Task 6-b — Assessments listing + Import wizard (Trainer portal)

## Files written (only these two, as required)
1. `src/components/placepro/trainer/assessments-page.tsx` — default export `AssessmentsPage`
2. `src/components/placepro/trainer/import-workflow.tsx` — default export `ImportWorkflow`

## What was built

### AssessmentsPage
- PageHeader "Assessments" + primary "Import results" action → `navigate("import")`.
- 4 compact KPI tiles (total / exams / mock interviews / unique students evaluated).
- Filters: SearchInput (name), FilterSelect type, batch, derived month ("Sep 2025" style, sorted desc), Reset button when active. Filter changes reset pagination via setter wrappers (lint-clean, no setState-in-effect).
- Enterprise table: type icon (FileCode2 / MessagesSquare), StatusBadge type/batch/date ("18 Sep 2025")/students/MiniBar avg/uploaded by/review status (warning "Needs review" vs success "Reviewed"), actions "View details" (Dialog) + "Mark reviewed" (store + toast).
- Details Dialog: header meta grid, per-student results sorted by percentage desc (UserAvatar, roll, marks/max, ScorePill), amber-left-border footer note with FileSpreadsheet when `sourceId` exists (shows source file name + row count from `importedSources`).
- 500ms skeleton loading, empty state (filter-aware), TablePagination 10/page.

### ImportWorkflow (6-step wizard)
- xlsx (SheetJS) **installed successfully** (`bun add xlsx`, v0.18.5) — parses .xlsx/.xls/.csv client-side; `sheet_to_json` cast `as unknown as string[][]`.
- Clickable stepper (completed steps clickable back, current filled bg-primary, completed bg-primary-soft + Check).
- Step 1: two selectable type cards + name/batch/date (defaults today), Continue gated.
- Step 2: drag-drop zone (dashed → border-primary bg-primary-soft/30), hidden file input, extension validation, simulated upload progress (setInterval → 100% then parse), file chip with name/size, "Load sample spreadsheet" (24 real students of 2022–2026 CSE + 1 duplicate roll + unknown roll 22CS999 + unmapped "Trainer Remarks" column), danger alert on errors.
- Step 3: summary chips (rows/columns/headers) + first-8-rows preview table, sticky header, max-h-80 pp-scrollbar.
- Step 4: per-column mapping rows (header + sample value → Select with roll/name/active numeric skills/ignore), fuzzy auto-suggest (normalized header + tokens + alias vocabulary: roll/regn/registration, name/student, dsa/dbms/os/cn/oops/java/springboot/comm…), roll-column exclusivity with swap + toast, max-marks inputs (default parsed from "(100)" style headers), roll-mapped summary chip, inline warnings (empty cells per mapped column, duplicate rolls count, unknown rolls up to 5).
- Step 5: Valid/Invalid/Duplicate/Unmapped summary tiles, itemized problem-row list, preservation note.
- Step 6: final summary (InfoRows, mapped-column chips, skill chips), "Confirm import" → builds `Assessment` (id `imp-${Date.now()}`, reviewed false, aggregate marks/max per student from mapped skill columns, percentage 1dp) + full `ImportedSource` (all headers, first 5 verbatim sampleRows) → `importAssessment()` + toast; success screen with green check, "View assessments" and "Import another file" (full reset).

## Verification
- `bunx tsc --noEmit` → **0 errors in both files** (remaining errors are in other agents' files: skills/stock-analysis-skill, mock-data.ts — untouched per rules).
- `bun run lint` → 0 errors; only pre-existing warning in `shell/app-shell.tsx` (not mine).
- `dev.log` → clean compiles, no runtime errors.

## Conventions followed
Design tokens (no blue/purple/indigo, no gradients), 13–14px body text, enterprise table markup, toasts via `useToast`, `use client`, no `any`, responsive grids sm:/lg., tables in overflow-x-auto, wizard state in useState.
