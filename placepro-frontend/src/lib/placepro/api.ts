import type { AppUser, Assessment, AuditLog, Batch, Company, EvaluationDomain, MatchResult, Role, SessionUser, Skill, Student, TrainerFeedback } from "@/types";
import { logger } from "@/lib/logger";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1").replace(/\/$/, "");

export type ApiErrorDetail = { field?: string; message: string; section?: string; count?: number; batchId?: string };

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: ApiErrorDetail[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(body?.error?.details) ? (body.error.details as ApiErrorDetail[]) : [];
      throw new ApiError(body?.error?.message ?? "Request failed", response.status, details);
    }
    return body as T;
  } catch (error) {
    logger.error("api.request_failed", error, { method, path, status: error instanceof ApiError ? error.status : undefined });
    throw error;
  }
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const pageItems = <T>(value: { items: T[] } | T[]) => Array.isArray(value) ? value : value.items;

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

export type BatchStats = {
  batchId: string;
  studentCount: number;
  prCount: number;
  nprCount: number;
  averageCgpa: number;
  domains: { label: string; value: number }[];
  top: Student[];
  sectionCounts: { section: string; count: number }[];
};

export type DashboardData = {
  role: "admin" | "trainer" | "student";
  totalStudents?: number;
  prCount?: number;
  nprCount?: number;
  averageScore?: number;
  domainAverages?: Record<string, number>;
  topPerformers?: Student[];
  attentionList?: Student[];
  userCounts?: { role: string; status: string; count: number }[];
  batchReadiness?: { batch: string; total: number; pr_count: number; npr_count: number }[];
  recentAuditLogs?: AuditLog[];
};

export type StudentAssessment = {
  assessmentId: string;
  name: string;
  type: Assessment["type"];
  date: string;
  marks: number;
  maxMarks: number;
  percentage: number;
};

export type ProfilePlatform = "GITHUB";

export type GithubCalendar = {
  from: string; to: string; totalContributions: number; includesSharedPrivateCounts: boolean;
  currentStreak: number; currentStreakAtLeast: boolean; longestStreak: number;
  days: { date: string; count: number; level: number }[];
};
export type GithubStatisticsResponse = {
  profile: {
    username: string; profileUrl: string; avatarUrl: string;
    publicRepositories: number; followers: number;
    languages: { name: string; repositories: number }[];
    sampledRepositoryCount: number; repositorySampleLimit: number;
    calendar: GithubCalendar | null; calendarUnavailable: string | null; calendarErrorCode?: string | null;
  } | null;
  fetchedAt?: string; stale?: boolean; verificationStatus?: string;
};

export type ProfileChallenge = {
  token: string;
  instructions: string;
  expiresInMinutes: number;
};

export type StudentCodingProfile = {
  id: string;
  platform: ProfilePlatform;
  username: string;
  profileUrl: string;
  verificationMethod: string;
  verificationStatus: "PENDING" | "VERIFIED" | "EXPIRED" | "REJECTED";
  verifiedAt: string | null;
  lastFetchedAt: string | null;
  latestSnapshot: {
    id: string;
    status: "SUCCESS" | "PARTIAL" | "FAILED";
    metrics: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
    fetchedAt: string;
  } | null;
};

export type ProfileSyncResult = {
  snapshotId: string;
  fetchedAt: string;
  status: "SUCCESS";
  metrics: Record<string, unknown>;
};

export type StudentProject = {
  id: string;
  name: string;
  description: string | null;
  repositoryUrl: string;
  liveDemoUrl: string | null;
  isFork: boolean | null;
  readmePresent: boolean | null;
  hasTests: boolean | null;
  hasDocker: boolean | null;
  hasCi: boolean | null;
  originalRepoOwner: string | null;
  ownershipStatus: "PENDING" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
  lastSyncedAt: string | null;
  reviewStatus: "DRAFT" | "SUBMITTED" | "APPROVED";
  vivaCompleted: boolean;
  ownershipConfirmed: boolean;
  score: {
    automatic: number | null;
    trainer: number | null;
    final: number | null;
    formulaVersion: string;
    breakdown: Record<string, unknown>;
    computedAt: string;
  } | null;
  scoreHistory: {
    automatic: number | null;
    trainer: number | null;
    final: number | null;
    formulaVersion: string;
    computedAt: string;
  }[];
};

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") sp.set(key, String(value));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export type ImportPreview = {
  importId: string;
  fileName?: string;
  rowCount?: number;
  columnCount?: number;
  headers?: string[];
  sampleRows?: string[][];
  issues?: unknown[];
};

export const api = {
  registrationTemplate: (kind: "students" | "trainers") => request<{ fileName: string; contentBase64: string }>(`/users/imports/${kind}/template`),
  previewRegistrationImport: (kind: "students" | "trainers", form: FormData) => request<RegistrationImportResult>(`/users/imports/${kind}/preview`, { method: "POST", body: form }),
  confirmRegistrationImport: (kind: "students" | "trainers", importId: string, mode: "valid-only" | "strict") => request<RegistrationImportResult>(`/users/imports/${kind}/confirm`, json("POST", { importId, mode })),
  registerStudent: (payload: { name: string; email: string; mobileNumber: string; rollNumber: string; academicBatchId: string; section: string; cgpa?: number }) => request<{ studentId: string; userId: string }>("/students", json("POST", payload)),
  registerTrainer: (payload: { name: string; email: string; mobileNumber: string; assignedBatchIds: string[] }) => request<{ userId: string }>("/users/trainers", json("POST", payload)),
  changePassword: (currentPassword: string, newPassword: string) => request<{ user: SessionUser }>("/auth/change-password", json("POST", { currentPassword, newPassword })),
  login: (email: string, password: string) => request<{ user: SessionUser }>("/auth/login", json("POST", { email, password })),
  me: () => request<{ user: SessionUser }>("/auth/me"),
  logout: () => request<void>("/auth/logout", json("POST")),
  dashboard: () => request<DashboardData>("/dashboard"),
  // Compatibility snapshot only. Complete rosters must use listStudents page-by-page.
  students: () => request<Paginated<Student>>("/students?page=1&pageSize=100"),
  // Paged roster for a single batch (used by the import wizard).
  listStudents: (p: { batchId?: string; page?: number; pageSize?: number; q?: string; section?: string; prStatus?: string; domainId?: string; projectFilter?: string; sort?: string }) =>
    request<Paginated<Student>>(`/students${qs(p)}`),
  student: (id: string) => request<Student>(`/students/${id}`),
  updateStudent: (id: string, payload: { name?: string; email?: string; mobileNumber?: string; section?: string; cgpa?: number }) =>
    request<Student>(`/students/${encodeURIComponent(id)}`, json("PATCH", payload)),
  unassignStudentSection: (id: string) => request<Student>(`/students/${encodeURIComponent(id)}/section`, { method: "DELETE" }),
  studentGithubStatistics: (id: string) => request<GithubStatisticsResponse>(`/students/${encodeURIComponent(id)}/github-statistics`),
  studentAssessments: (id: string) => request<Paginated<StudentAssessment>>(`/students/${id}/assessments`),
  studentFeedback: (id: string) => request<TrainerFeedback[]>(`/students/${id}/feedback`),
  myStudent: () => request<Student>("/me/student"),
  myCodingProfiles: async () => (await request<{ items: StudentCodingProfile[] }>("/me/profiles")).items,
  addMyCodingProfile: (payload: { platform: ProfilePlatform; username: string }) =>
    request<{ id: string; challenge: ProfileChallenge }>("/me/profiles", json("POST", payload)),
  updateMyCodingProfile: (id: string, username: string) =>
    request<{ id: string; username: string; challenge: ProfileChallenge }>(
      `/me/profiles/${encodeURIComponent(id)}`,
      json("PATCH", { username }),
    ),
  deleteMyCodingProfile: (id: string) =>
    request<void>(`/me/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  verifyMyCodingProfile: (id: string) =>
    request<{ id: string; verificationStatus: "VERIFIED" }>(
      `/me/profiles/${encodeURIComponent(id)}/verify`,
      json("POST"),
    ),
  syncMyCodingProfile: (id: string) =>
    request<ProfileSyncResult>(`/me/profiles/${encodeURIComponent(id)}/sync`, json("POST")),
  myProjects: async () => (await request<{ items: StudentProject[] }>("/me/projects")).items,
  addMyProject: (payload: { repositoryUrl: string; name?: string; description?: string; liveDemoUrl?: string }) =>
    request<{ id: string; ownershipStatus: StudentProject["ownershipStatus"]; automaticScore: number }>(
      "/me/projects",
      json("POST", payload),
    ),
  studentProjects: async (studentId: string) =>
    (await request<{ items: StudentProject[] }>(`/students/${encodeURIComponent(studentId)}/projects`)).items,
  reviewStudentProject: (
    studentId: string,
    projectId: string,
    payload: { trainerScore: number; ownershipConfirmed: boolean; vivaCompleted: boolean; rubricScores?: Record<string, unknown> },
  ) =>
    request<{
      projectId: string;
      reviewId: string;
      automaticScore: number;
      trainerScore: number;
      finalScore: number;
      formulaVersion: string;
      reviewedAt: string;
    }>(
      `/students/${encodeURIComponent(studentId)}/projects/${encodeURIComponent(projectId)}/reviews`,
      json("POST", payload),
    ),
  myAssessments: () => request<Paginated<StudentAssessment>>("/me/assessments"),
  myFeedback: () => request<TrainerFeedback[]>("/me/feedback"),
  assessments: async () => pageItems(await request<{ items: Assessment[] }>("/assessments?pageSize=100")),
  assessment: (id: string) => request<Assessment>(`/assessments/${id}`),
  reviewAssessment: (id: string) => request<Assessment>(`/assessments/${id}`, json("PATCH", { reviewed: true })),
  rollbackAssessment: (id: string) => request<{ id: string; rolledBack: boolean }>(`/assessments/${id}/rollback`, json("POST", {})),
  previewImport: (form: FormData) => request<ImportPreview>("/assessment-imports/preview", { method: "POST", body: form }),
  confirmImport: (id: string, payload: unknown) => request<Assessment>(`/assessment-imports/${id}/confirm`, json("POST", payload)),
  companies: async () => pageItems(await request<{ items: Company[] }>("/companies?pageSize=100")),
  company: (id: string) => request<Company>(`/companies/${id}`),
  createCompany: (payload: Omit<Company, "id"> | Company) => request<Company>("/companies", json("POST", payload)),
  updateCompany: (id: string, payload: Partial<Company>) => request<Company>(`/companies/${id}`, json("PATCH", payload)),
  deleteCompany: (id: string) => request<void>(`/companies/${id}`, { method: "DELETE" }),
  exportCompanyShortlist: (id: string, payload: unknown) =>
    request<{ csv: string; fileName: string; rowCount: number }>(`/companies/${id}/shortlist-export`, json("POST", payload)),
  companyMatches: (id: string, payload: unknown) =>
    request<{ items: MatchResult[]; page: number; pageSize: number; total: number; company: Company; requiresBatchConfiguration: boolean; matchingVersion: string }>(`/companies/${id}/matches`, json("POST", payload)),
  listUsers: (params: { q?: string; role?: Role; status?: "active" | "inactive"; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AppUser>>("/users" + qs(params)),
  users: async (params: { q?: string; role?: Role; status?: "active" | "inactive"; page?: number; pageSize?: number } = {}) =>
    pageItems(await request<Paginated<AppUser>>("/users" + qs({ pageSize: 100, ...params }))),
  createUser: (payload: Partial<AppUser>) => request<AppUser>("/users", json("POST", payload)),
  updateUser: (id: string, payload: Partial<AppUser>) => request<AppUser>(`/users/${id}`, json("PATCH", payload)),
  batches: () => request<Batch[]>("/batches"),
  // Filtered batch list (spec allows an array or a paginated body, so normalise to an array).
  listBatches: async (p: { status?: "active" | "archived" } = {}) =>
    pageItems(await request<Batch[] | { items: Batch[] }>(`/batches${qs(p)}`)),
  createBatch: (payload: Omit<Batch, "id" | "studentCount" | "trainers"> | Batch) => request<Batch>("/batches", json("POST", payload)),
  updateBatch: (id: string, payload: Partial<Batch>) => request<Batch>(`/batches/${id}`, json("PATCH", payload)),
  batchStats: (id: string) => request<BatchStats>(`/batches/${id}/stats`),
  archiveBatch: (id: string) => request<Batch>(`/batches/${id}/archive`, json("POST")),
  restoreBatch: (id: string) => request<Batch>(`/batches/${id}/restore`, json("POST")),
  resolveTrainerAssignment: (id: string, payload: { missingTrainerId: string; action: "remove" | "replace"; replacementTrainerId?: string }) =>
    request<Batch>(`/batches/${id}/trainer-assignments/resolve`, json("POST", payload)),
  subjectColumns: () => request<{ columns: Record<string, boolean> | null }>("/me/subject-columns"),
  saveSubjectColumns: (payload: { columns?: Record<string, boolean>; reset?: boolean }) => request<{ columns: Record<string, boolean> | null }>("/me/subject-columns", json("PATCH", payload)),
  domains: () => request<EvaluationDomain[]>("/domains"),
  createDomain: (payload: Omit<EvaluationDomain, "id" | "parameterCount">) => request<EvaluationDomain>("/domains", json("POST", payload)),
  updateDomain: (id: string, payload: Partial<Omit<EvaluationDomain, "id" | "parameterCount">>) => request<EvaluationDomain>(`/domains/${encodeURIComponent(id)}`, json("PATCH", payload)),
  deleteDomain: (id: string) => request<void>(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" }),
  skills: () => request<Skill[]>("/skills"),
  // Filtered skill list (e.g. active only).
  listSkills: async (p: { q?: string; domain?: string; active?: boolean } = {}) =>
    pageItems(await request<Skill[] | { items: Skill[] }>(`/skills${qs(p)}`)),
  createSkill: (payload: Omit<Skill, "id"> | Skill) => request<Skill>("/skills", json("POST", payload)),
  updateSkill: (id: string, payload: Partial<Skill>) => request<Skill>(`/skills/${id}`, json("PATCH", payload)),
  deleteSkill: (id: string) => request<void>(`/skills/${id}`, { method: "DELETE" }),
  auditLogs: async (p: { q?: string; module?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const response = await request<Paginated<Omit<AuditLog, "user"> & { actor: string; metadata?: Record<string, unknown> }>>(
      `/audit-logs${qs({ pageSize: 100, ...p })}`
    );
    return {
      ...response,
      items: response.items.map((log) => ({
        ...log,
        user: log.actor || (log as { user?: string }).user || "System",
        record: log.record ?? (log.metadata ? JSON.stringify(log.metadata) : ""),
      })),
    };
  },
  studentVerificationRequests: () => request<StudentVerificationRequest[]>("/import-student-reviews"),
  approveStudentVerification: (id: string, payload: { name: string; email: string; branch?: string; section?: string }) =>
    request<unknown>(`/import-student-reviews/${id}/approve`, json("POST", payload)),
  rejectStudentVerification: (id: string, reason: string) =>
    request<void>(`/import-student-reviews/${id}`, json("DELETE", { reason })),
};

export type StudentVerificationRequest = {
  id: string;
  rollNumber: string;
  rowNumber: number;
  batchName: string;
  assessmentName: string;
  fileName: string;
  rawRow: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export type RegistrationImportResult = {
  importId: string;
  confirmed?: boolean;
  rows: { rowNumber: number; submitted: Record<string,string>; status: string; message: string; linksExistingStudent?: boolean }[];
  summary?: { total: number; valid: number; invalid: number; alreadyExists: number };
  imported?: number;
  skipped?: number;
  errorReport: string;
};
