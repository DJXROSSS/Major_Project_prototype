/* ------------------------------------------------------------------ */
/* PlacePro — domain types                                             */
/* Everything the UI renders is typed here so the frontend can be      */
/* wired to a real backend later without touching components.          */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "trainer" | "student";

export type PRStatus = "PR" | "NPR";

export type AssessmentType = "exam" | "mock-interview";

export type SkillDomain = string;

export interface EvaluationDomain {
  id: string;
  code: string | null;
  name: string;
  description: string;
  active: boolean;
  parameterCount: number;
}

export type ParameterType = "numeric" | "text";

export interface Skill {
  code?: string;
  numericId?: string;
  defaultVisible?: boolean;
  id: string;
  name: string;
  domain: SkillDomain;
  domainId?: string;
  description: string;
  parameterType: ParameterType;
  active: boolean;
}

export interface Student {
  mobileNumber?: string;
  batchId?: string;
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
  projectScore?: number | null;
  approvedProjectCount?: number;
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
  canRollback?: boolean;
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
  type?: "PROJECT_SCORE";
  minCutoff: number;
  weightage: number; // 0 - 1
  mandatory: boolean;
}

export interface Company {
  eligibleBatchIds?: string[];
  eligibleBatches?: { id: string; name: string }[];
  id: string;
  name: string;
  role: string;
  industry: string;
  minCgpa: number;
  criteria: CompanyCriterion[];
}

export interface AppUser {
  mobileNumber?: string;
  assignedBatches?: { id: string; name: string }[];
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "inactive";
  batch?: string;
}

export interface Batch {
  id: string;
  name: string;
  department: string;
  academicYears: string;
  sections: string[];
  trainerIds: string[];
  trainers: BatchTrainer[];
  studentCount: number;
  status: "active" | "archived";
  archivedAt?: string | null;
  archivedBy?: { id: string; name: string } | null;
}

export interface BatchTrainer {
  id: string;
  name: string;
  status: "active" | "inactive";
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
  | "profile-intelligence"
  | "users"
  | "batches"
  | "skills"
  | "domains"
  | "companies"
  | "audit";

export interface Route {
  page: Page;
  params?: Record<string, string>;
}

export interface SessionUser {
  mustChangePassword?: boolean;
  id: string;
  name: string;
  email: string;
  role: Role;
  /** for students — links to their student record */
  studentId?: string;
  title: string;
}
