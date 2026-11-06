# Task 6-d — Student Portal Screens

## Scope
Built the four student-portal screens in `/home/z/my-project/src/components/placepro/student/` (overwrote stubs, no other files touched):

1. **student-dashboard.tsx** (`StudentDashboard`)
   - PageHeader "Welcome back, {first name}" + en-IN long date + encouraging line.
   - Readiness highlight wide card: big PRBadge + PR/NPR explanation + mini stats (overall %, CGPA, assessments taken, most recent score with assessment name).
   - Charts row: line chart of `student.trend` (green #245C45, dashed amber ReferenceLine y=60 "Target"), horizontal domain bar chart (weakest domain bar in amber #D99A36), "Technical vs Communication" big-numbers card with MiniBars + comparing sentence.
   - Two-column Strong Areas (≥75, MiniBar + "Averaged X% across N assessments") / Areas to Target (<60, warning icon, ScorePill + per-skill actionable guidance map).
   - Recent trainer feedback card (latest approved, quoted technical + first strength chip → "View all feedback" navigates `my-feedback`) + Recent assessments card (last 5 with ScorePill → "Full history" navigates `my-performance`).
   - EmptyState fallbacks for missing student record, no feedback, no assessments, no strong/target areas.

2. **my-performance-page.tsx** (`MyPerformancePage`)
   - 4 StatCards: overall %, best assessment % (with assessment name hint), average score, total assessments.
   - Subject-wise table (every skill in `student.scores`): Skill, Domain (SKILL_BY_ID), Latest score (ScorePill), Overall average (MiniBar), Status (Strong/Developing/Needs attention StatusBadge).
   - Historical progress line chart h-[280px] + domain-wise averages MiniBar rows + strongest/weakest sentence.
   - Full assessment history table (date desc): Name, Type (Exam info / Mock Interview warning), Date, marks/max, Percentage. EmptyState fallback.

3. **interview-feedback-page.tsx** (`InterviewFeedbackPage`)
   - SECURITY: filters `feedback` by `studentId === student.id && approved === true` only.
   - EmptyState (MessagesSquare) when none: "No feedback approved yet — your trainer's review will appear here after it is approved."
   - Summary strip (record count + latest date), then per-record cards: header (assessment, date, trainer, "Approved" badge), 2-col responsive sections (Technical/FileCode2, Communication/MessagesSquare, Behavior/UserRound), chip lists for Strengths (success), Weaknesses (warning), Improvement Guidance (primary).

4. **my-profile-page.tsx** (`MyProfilePage`)
   - Left card: UserAvatar lg, name, PRBadge, roll number; InfoRows for Name, Roll, Email, Batch, Section, CGPA, Readiness classification (PRBadge) + criteria note ("Average ≥ 68% across skills, CGPA ≥ 6.6 and Communication ≥ 58").
   - Right column: "At a glance" snapshot card + Lock-icon privacy note card (12px muted). No edit buttons.

## Conventions followed
- `"use client"` first line; default exports preserved; only existing shadcn/ui + lucide-react + recharts.
- Design tokens: white cards border-border shadow-none rounded-xl, green #245C45 primary, amber #D99A36 accents, no blue/purple/indigo/gradients.
- Chart constants copied from trainer-dashboard (axisTick 12px #727C74, tooltip style object, CartesianGrid #E4E9E4).
- Store access via `useAppStore` selectors; student resolved via `STUDENT_BY_ID[user.studentId]`.
- Responsive: single column mobile → sm:/lg: grids; tables wrapped in `overflow-x-auto` with min-widths.

## Verification
- `bunx tsc --noEmit` → **0 errors in all four files** (remaining errors are pre-existing in examples/, skills/, mock-data.ts, trainer files — out of scope).
- `bun run lint` → **0 issues in all four files** (remaining lint errors pre-existing in trainer/students-page.tsx etc.).
- Dev server compiles clean (`GET / 200`), route-view.tsx already imports these default exports.
