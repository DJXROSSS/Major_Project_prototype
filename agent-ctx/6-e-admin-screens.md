# Task 6-e — Admin Portal Screens (PlacePro)

## Scope
Wrote six production-quality admin screens (overwrote placeholder stubs, no other files touched):

1. `src/components/placepro/admin/admin-dashboard.tsx` — AdminDashboard
   - PageHeader + 6 StatCards (grid-cols-2 md:3 xl:6), "Total students" uses variant="hero" (dark green).
   - Charts (recharts, reference chart constants: axisTick, tooltipStyle, #245C45/#D99A36/#E4E9E4):
     - Bar "Users by role" (green bars, allowDecimals=false)
     - Donut "Active vs inactive users" (innerRadius 56/80, center total, legend row)
     - "Batch readiness" horizontal BarChart per batch: `pr` (#245C45) vs `npr` (#D99A36), legend below
   - "Recent system activity" card: first 8 AUDIT_LOGS with UserAvatar, module chip, formatted time, StatusBadge.

2. `user-management-page.tsx` — UserManagementPage
   - Filters: SearchInput (name/email) + FilterSelect role (Administrator/Technical Trainer/Student) + status (Active/Inactive) + Reset.
   - Enterprise table (reference markup): User (UserAvatar sm + name + muted email), Role StatusBadge (admin=info/trainer=success/student=neutral), Batch (students only), Status badge, "14 Feb, 9:12 am" formatted last-active, Edit + Activate/Deactivate (AlertDialog confirm → updateUser + toast).
   - Add/Edit Dialog (simple useState form): name/email/role select/batch select (students only, "Unassigned" sentinel)/status switch. Validation: non-empty name, valid email regex, duplicate email check for new users. addUser/updateUser + toast. crypto.randomUUID() ids, lastActive = now ISO.
   - 10/page pagination, 550ms skeleton, empty state with reset/create actions.

3. `batch-management-page.tsx` — BatchManagementPage
   - "Create batch" Dialog: name, department, academic years, sections (comma-separated → array), trainer multi-select checkboxes (role=trainer users), studentCount 0, status active → addBatch + toast. Validation on name/department.
   - Batch cards grid (md:2 xl:3): name/department, academic-years chip (primary-soft), section chips, assigned trainers (UserAvatar sm), live student count (STUDENTS filtered by batch name, fallback to stored count since it can go stale), "View statistics" + "Edit" (prefilled dialog → updateBatch + toast).
   - Stats Dialog: total/PR/NPR/avg CGPA (InfoRow), 4 MiniBar domain averages (DOMAIN_GROUPS + domainAverage), top-3 performers with PRBadge.

4. `skill-config-page.tsx` — SkillConfigPage (dynamic evaluation parameters)
   - Filters: domain (SKILL_DOMAINS), search (name/description), status; Reset.
   - Table: Parameter (semibold + 12px muted description), Domain chip, Type, Status Switch (→ updateSkill active + toast), Edit Dialog (name/domain/description/type/active → updateSkill + toast), Delete AlertDialog with "Historical assessment records that used this parameter are preserved." → deleteSkill + toast.
   - Add parameter Dialog: all fields, default active → addSkill + toast. Empty state on filtered-empty.

5. `company-requirements-page.tsx` — CompanyRequirementsPage
   - Company cards grid (md:2): name+role, industry chip, bold min CGPA, inner criteria table (Skill | Cutoff | Weightage | Mandatory/Optional badge), Edit + Delete (AlertDialog → deleteCompany + toast).
   - Shared criteria editor (add + edit dialogs): skill Select (active numeric skills), cutoff + weightage (percent) number inputs, mandatory Switch, remove-row, "Add criterion", weightage total indicator (success/warning-soft when ≠ 100%). Weightage converted % ↔ 0–1 fraction on load/save. addCompany/updateCompany + toast.
   - Footer note: "Companies with criteria drive the Company Matching module for trainers."
   - Handles missing/deleted skills ("Unknown skill") and no-numeric-skills edge case.

6. `audit-logs-page.tsx` — AuditLogsPage
   - Static AUDIT_LOGS, sorted timestamp desc; filters: search (user/action/record), module (unique derived), status (Success/Warning/Failed), Reset.
   - Table: two-line date ("14 Feb 2026" + muted 11px time), User (avatar+name), semibold action, neutral module chip, truncated record with title attr, StatusBadge. 10/page, skeleton, empty state.

## Verification
- `bunx tsc --noEmit` scoped to the six files: **0 errors** (pre-existing errors remain in examples/, skills/, and `src/lib/placepro/mock-data.ts` — not touched per rules).
- `bun run lint`: **0 errors** (one pre-existing warning in `src/components/placepro/shell/app-shell.tsx`, not mine).
  - Fixed `react-hooks/set-state-in-effect` by removing page-reset effects; page is clamped via `safePage = Math.min(page, pageCount)` instead.
- dev.log: compiles clean, `GET / 200`. (Module-not-found entries in the log are for OTHER tasks' trainer files: `students-page`, `student-profile-page`.)

## Conventions followed
- `"use client"` first line; only existing shadcn/ui + lucide-react + recharts; no new deps; no `any`; no dead buttons (every action hits a store action + toast via `useToast`).
- Green-only palette (#245C45 / #D99A36 amber), white cards rounded-xl shadow-none, 13–14px body, enterprise table markup matching trainer-dashboard reference, responsive grids, dialogs max-h-[85vh] overflow-y-auto, overflow-x-auto tables.
