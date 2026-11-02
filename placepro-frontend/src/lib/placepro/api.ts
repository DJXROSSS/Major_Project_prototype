import type { AppUser, Assessment, Batch, Company, SessionUser, Skill, Student, TrainerFeedback } from "@/types";
import { logger } from "@/lib/logger";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1").replace(/\/$/, "");

export type ApiErrorDetail = { field?: string; message: string };

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

type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

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
  login: (email: string, password: string) => request<{ user: SessionUser }>("/auth/login", json("POST", { email, password })),
  me: () => request<{ user: SessionUser }>("/auth/me"),
  logout: () => request<void>("/auth/logout", json("POST")),
  dashboard: () => request<unknown>("/dashboard"),
  // Import validation needs the full roster, not just the first page of students.
  students: () => request<{ items: Student[] }>("/students?pageSize=1000"),
  // Paged roster for a single batch (used by the import wizard).
  listStudents: (p: { batchId?: string; page?: number; pageSize?: number; q?: string }) =>
    request<Paginated<Student>>(`/students${qs(p)}`),
  student: (id: string) => request<Student>(`/students/${id}`),
  studentAssessments: (id: string) => request<unknown>(`/students/${id}/assessments`),
  studentFeedback: (id: string) => request<TrainerFeedback[]>(`/students/${id}/feedback`),
  myStudent: () => request<Student>("/me/student"),
  myAssessments: () => request<unknown>("/me/assessments"),
  myFeedback: () => request<TrainerFeedback[]>("/me/feedback"),
  assessments: async () => pageItems(await request<{ items: Assessment[] }>("/assessments?pageSize=100")),
  assessment: (id: string) => request<Assessment>(`/assessments/${id}`),
  reviewAssessment: (id: string) => request<Assessment>(`/assessments/${id}`, json("PATCH", { reviewed: true })),
  previewImport: (form: FormData) => request<ImportPreview>("/assessment-imports/preview", { method: "POST", body: form }),
  confirmImport: (id: string, payload: unknown) => request<Assessment>(`/assessment-imports/${id}/confirm`, json("POST", payload)),
  companies: async () => pageItems(await request<{ items: Company[] }>("/companies?pageSize=100")),
  createCompany: (payload: Omit<Company, "id"> | Company) => request<Company>("/companies", json("POST", payload)),
  updateCompany: (id: string, payload: Partial<Company>) => request<Company>(`/companies/${id}`, json("PATCH", payload)),
  deleteCompany: (id: string) => request<void>(`/companies/${id}`, { method: "DELETE" }),
  companyMatches: (id: string, payload: unknown) => request<unknown>(`/companies/${id}/matches`, json("POST", payload)),
  users: async () => pageItems(await request<{ items: AppUser[] }>("/users?pageSize=100")),
  createUser: (payload: Partial<AppUser>) => request<AppUser>("/users", json("POST", payload)),
  updateUser: (id: string, payload: Partial<AppUser>) => request<AppUser>(`/users/${id}`, json("PATCH", payload)),
  batches: () => request<Batch[]>("/batches"),
  // Filtered batch list (spec allows an array or a paginated body, so normalise to an array).
  listBatches: async (p: { status?: "active" | "archived" } = {}) =>
    pageItems(await request<Batch[] | { items: Batch[] }>(`/batches${qs(p)}`)),
  createBatch: (payload: Omit<Batch, "id" | "studentCount"> | Batch) => request<Batch>("/batches", json("POST", payload)),
  updateBatch: (id: string, payload: Partial<Batch>) => request<Batch>(`/batches/${id}`, json("PATCH", payload)),
  batchStats: (id: string) => request<unknown>(`/batches/${id}/stats`),
  skills: () => request<Skill[]>("/skills"),
  // Filtered skill list (e.g. active only).
  listSkills: async (p: { q?: string; domain?: string; active?: boolean } = {}) =>
    pageItems(await request<Skill[] | { items: Skill[] }>(`/skills${qs(p)}`)),
  createSkill: (payload: Omit<Skill, "id"> | Skill) => request<Skill>("/skills", json("POST", payload)),
  updateSkill: (id: string, payload: Partial<Skill>) => request<Skill>(`/skills/${id}`, json("PATCH", payload)),
  deleteSkill: (id: string) => request<void>(`/skills/${id}`, { method: "DELETE" }),
  auditLogs: () => request<unknown>("/audit-logs?pageSize=100"),
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