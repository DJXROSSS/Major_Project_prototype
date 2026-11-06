/* ------------------------------------------------------------------ */
/* PlacePro — domain types                                             */
/* Everything the UI renders is typed here so the frontend can be      */
/* wired to a real backend later without touching components.          */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "trainer" | "student";

export type PRStatus = "PR" | "NPR";

export type AssessmentType = "exam" | "mock-interview";

export const SKILL_DOMAINS = [
  "Programming / DSA",
  "Core Computer Science",
  "Software Development",
  "Communication / Soft Skills",
] as const;

export type SkillDomain = (typeof SKILL_DOMAINS)[number] | string;

export type ParameterType = "numeric" | "text";

export interface Skill {
  id: string;
  name: string;
  domain: SkillDomain;
  description: string;
  parameterType: ParameterType;
  active: boolean;
}

export interface Student {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  batch: string;
  section: string;
  cgpa: number;
  /** skillId -> average score (0-100) */
  scores: Record<string, number>;
  /** Backend-computed mean score for each skill domain. */
  domainAverages?: Record<string, number>;
  average: number;
  prStatus: PRStatus;
  /** chronological average % across recent assessments */
  trend: number[];
}

export interface AssessmentResult {
  studentId: string;
  /** Resolved by the assessment-details API using students.student_id. */
  studentName?: string;
  rollNumber?: string;
  marks: number;
  maxMarks: number;
  percentage: number;
}

export interface Assessment {
  id: string;
  name: string;
  type: AssessmentType;
  batch: string;
  date: string; // ISO
  uploadedBy: string;
  results: AssessmentResult[];
  /** true once a trainer has reviewed / approved the imported record */
  reviewed: boolean;
  sourceId?: string;
  /** Summary fields included by the assessment listing endpoint. */
  evaluatedCount?: number;
  averageScore?: number;
}

/** Preserved original spreadsheet — the raw source of an import */
export interface ImportedSource {
  id: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  /** first rows of the original file, kept verbatim */
  sampleRows: string[][];
  assessmentName: string;
}

export interface TrainerFeedback {
  id: string;
  studentId: string;
  date: string;
  trainer: string;
  assessmentName: string;
  technical: string;
  communication: string;
  behavior: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  approved: boolean;
}

export interface CompanyCriterion {
  skillId: string;
  minCutoff: number;
  weightage: number; // 0 - 1
  mandatory: boolean;
}

export interface Company {
  id: string;
  name: string;
  role: string;
  industry: string;
  minCgpa: number;
  criteria: CompanyCriterion[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "inactive";
  lastActive: string;
  batch?: string;
}

export interface Batch {
  id: string;
  name: string;
  department: string;
  academicYears: string;
  sections: string[];
  trainerIds: string[];
  studentCount: number;
  status: "active" | "archived";
}

export interface AuditLog {
  id: string;
  /** Actor name returned by the audit API (legacy mock data calls this `user`). */
  user: string;
  actor?: string;
  action: string;
  module: string;
  timestamp: string;
  status: "success" | "warning" | "failed";
  record?: string;
}

export interface ActivityItem {
  id: string;
  kind: "import" | "assessment" | "feedback" | "system" | "company";
  title: string;
  detail: string;
  time: string;
}

export interface Notification {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
}

/** Eligibility result computed for a student against a company profile */
export interface MatchResult {
  student: Student;
  eligible: boolean;
  compatibility: number; // 0 - 100 weighted score
  failedRequirements: string[];
}

export type Page =
  | "dashboard"
  | "students"
  | "student-profile"
  | "assessments"
  | "import"
  | "matching"
  | "my-performance"
  | "my-feedback"
  | "my-profile"
  | "users"
  | "batches"
  | "skills"
  | "companies"
  | "audit";

export interface Route {
  page: Page;
  params?: Record<string, string>;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** for students — links to their student record */
  studentId?: string;
  title: string;
}
