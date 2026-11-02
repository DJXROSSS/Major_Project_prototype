"use client";

/* ------------------------------------------------------------------ */
/* PlacePro — application store                                        */
/* Session, routing, sidebar state and all mutable domain collections  */
/* (skills, companies, users, batches, imported assessments) live      */
/* here so every portal shares one source of truth.                    */
/* ------------------------------------------------------------------ */

import { create } from "zustand";
import type {
  AppUser,
  Assessment,
  Batch,
  Company,
  ImportedSource,
  Page,
  Route,
  SessionUser,
  Skill,
  TrainerFeedback,
} from "@/types";
import {
  ASSESSMENTS,
  BATCHES,
  COMPANIES,
  DEMO_ACCOUNTS,
  FEEDBACK,
  SKILLS,
  STUDENT_BY_ID,
  USERS,
} from "./mock-data";
import { api, ApiError } from "./api";
import { logger } from "@/lib/logger";

export interface MatchableAssessment {
  assessment: Assessment;
  source: ImportedSource;
}

interface AppState {
  /* session */
  user: SessionUser | null;

  /* navigation */
  route: Route;
  sidebarPinned: boolean;
  uiDialog: "help" | "settings" | null;

  /* domain data */
  skills: Skill[];
  companies: Company[];
  users: AppUser[];
  batches: Batch[];
  assessments: Assessment[];
  importedSources: ImportedSource[];
  feedback: TrainerFeedback[];
  students: import("@/types").Student[];

  /* actions */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshData: () => Promise<void>;
  navigate: (page: Page, params?: Record<string, string>) => void;
  setSidebarPinned: (pinned: boolean) => void;
  openDialog: (dialog: "help" | "settings") => void;
  closeDialog: () => void;

  addSkill: (skill: Omit<Skill, "id"> | Skill) => Promise<void>;
  updateSkill: (id: string, patch: Partial<Skill>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;

  addCompany: (company: Omit<Company, "id"> | Company) => Promise<void>;
  updateCompany: (id: string, patch: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;

  addUser: (user: Omit<AppUser, "id"> | AppUser) => Promise<void>;
  updateUser: (id: string, patch: Partial<AppUser>) => Promise<void>;

  addBatch: (batch: Omit<Batch, "id" | "studentCount"> | Batch) => Promise<void>;
  updateBatch: (id: string, patch: Partial<Batch>) => Promise<void>;

  importAssessment: (assessment: Assessment, source: ImportedSource) => void;
  markAssessmentReviewed: (id: string) => Promise<void>;
}

const HOME_PAGE: Record<SessionUser["role"], Page> = {
  trainer: "dashboard",
  admin: "dashboard",
  student: "dashboard",
};

export const useAppStore = create<AppState>((set) => ({
  user: null,
  route: { page: "dashboard" },
  sidebarPinned: true,
  uiDialog: null,

  skills: SKILLS,
  companies: COMPANIES,
  users: USERS,
  batches: BATCHES,
  assessments: ASSESSMENTS,
  importedSources: [],
  feedback: FEEDBACK,
  students: Object.values(STUDENT_BY_ID),

  login: async (email, password) => {
    try {
      const { user } = await api.login(email, password);
      set({ user, route: { page: HOME_PAGE[user.role] } });
      await useAppStore.getState().refreshData();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed. Please try again." };
    }
  },

  logout: async () => {
    try { await api.logout(); } catch { /* Clear the local session even when the gateway is unavailable. */ }
    set({ user: null, route: { page: "dashboard" } });
  },

  restoreSession: async () => {
    try {
      const { user } = await api.me();
      set({ user, route: { page: HOME_PAGE[user.role] } });
      await useAppStore.getState().refreshData();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) logger.warn("session.restore_failed", { error: error instanceof Error ? error.message : String(error) });
      set({ user: null });
    }
  },

  refreshData: async () => {
    const user = useAppStore.getState().user;
    if (!user) return;
    try {
      if (user.role === "student") {
        const [student, assessmentResponse, feedback] = await Promise.all([api.myStudent(), api.myAssessments(), api.myFeedback()]);
        const assessmentItems = Array.isArray(assessmentResponse) ? assessmentResponse : (assessmentResponse as { items?: Assessment[] }).items ?? [];
        set({ assessments: assessmentItems as Assessment[], feedback, students: [student] });
        return;
      }
      const [studentsResponse, assessments, companies, batches, skills] = await Promise.all([
        api.students(), api.assessments(), api.companies(), api.batches(), api.skills(),
      ]);
      const normalizedAssessments = assessments.map((item) => ({
        ...item,
        batch: (item as Assessment & { batchId?: string }).batch ?? (item as Assessment & { batchId?: string }).batchId ?? "Unassigned",
        uploadedBy: typeof item.uploadedBy === "object" ? (item.uploadedBy as unknown as { name: string }).name : item.uploadedBy,
        results: item.results ?? [],
      }));
      if (user.role === "admin") {
        const [users, auditResponse] = await Promise.all([api.users(), api.auditLogs()]);
        set({ users, feedback: [], importedSources: [], assessments: normalizedAssessments, companies, batches, skills, students: studentsResponse.items });
      } else {
        set({ feedback: [], importedSources: [], assessments: normalizedAssessments, companies, batches, skills, students: studentsResponse.items });
      }
      // Keep the call here so all authorised data sources are exercised; student-dependent views fetch details by id.
      void studentsResponse;
    } catch (error) { logger.error("data.refresh_failed", error, { role: user.role }); }
  },

  navigate: (page, params) => {
    set({ route: { page, params } });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },

  setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),

  openDialog: (dialog) => set({ uiDialog: dialog }),
  closeDialog: () => set({ uiDialog: null }),

  addSkill: async (skill) => { const created = await api.createSkill(skill); set((s) => ({ skills: [created, ...s.skills] })); },
  updateSkill: async (id, patch) => { const updated = await api.updateSkill(id, patch); set((s) => ({ skills: s.skills.map((sk) => sk.id === id ? updated : sk) })); },
  deleteSkill: async (id) => { await api.deleteSkill(id); set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) })); },

  addCompany: async (company) => { const created = await api.createCompany(company); set((s) => ({ companies: [created, ...s.companies] })); },
  updateCompany: async (id, patch) => { const updated = await api.updateCompany(id, patch); set((s) => ({ companies: s.companies.map((c) => c.id === id ? updated : c) })); },
  deleteCompany: async (id) => { await api.deleteCompany(id); set((s) => ({ companies: s.companies.filter((c) => c.id !== id) })); },

  addUser: async (user) => { const created = await api.createUser(user); set((s) => ({ users: [created, ...s.users] })); },
  updateUser: async (id, patch) => { const updated = await api.updateUser(id, patch); set((s) => ({ users: s.users.map((u) => u.id === id ? updated : u) })); },

  addBatch: async (batch) => { const created = await api.createBatch(batch); set((s) => ({ batches: [created, ...s.batches] })); },
  updateBatch: async (id, patch) => { const updated = await api.updateBatch(id, patch); set((s) => ({ batches: s.batches.map((b) => b.id === id ? { ...b, ...patch } : b) })); },

  importAssessment: (assessment, source) =>
    set((s) => ({
      assessments: [assessment, ...s.assessments],
      importedSources: [source, ...s.importedSources],
    })),

  markAssessmentReviewed: async (id) => {
    await api.reviewAssessment(id);
    set((s) => ({ assessments: s.assessments.map((a) => a.id === id ? { ...a, reviewed: true } : a) }));
  },
}));

/* ------------------------- selectors / helpers ------------------------- */

export function getStudentSafely(studentId?: string) {
  if (!studentId) return undefined;
  return STUDENT_BY_ID[studentId];
}

/** Breadcrumb labels for the current route, per role */
export function routeLabels(route: Route, role: SessionUser["role"]): string[] {
  const { page } = route;
  const map: Record<Page, string[]> = {
    dashboard: role === "trainer" ? ["Trainer Portal", "Dashboard"] : role === "admin" ? ["Administration", "Dashboard"] : ["Student Portal", "Dashboard"],
    students: ["Trainer Portal", "Students"],
    "student-profile": ["Trainer Portal", "Students", "Profile"],
    assessments: ["Trainer Portal", "Assessments"],
    import: ["Trainer Portal", "Import Results"],
    matching: ["Trainer Portal", "Company Matching"],
    "my-performance": ["Student Portal", "My Performance"],
    "my-feedback": ["Student Portal", "Interview Feedback"],
    "my-profile": ["Student Portal", "My Profile"],
    users: ["Administration", "User Management"],
    batches: ["Administration", "Batch Management"],
    skills: ["Administration", "Skills & Parameters"],
    companies: ["Administration", "Company Requirements"],
    audit: ["Administration", "Audit Logs"],
  };
  return map[page] ?? ["PlacePro"];
}

export function pageTitle(route: Route): string {
  const { page } = route;
  const map: Record<Page, string> = {
    dashboard: "Dashboard",
    students: "Students",
    "student-profile": "Student Profile",
    assessments: "Assessments",
    import: "Import Results",
    matching: "Company Matching",
    "my-performance": "My Performance",
    "my-feedback": "Interview Feedback",
    "my-profile": "My Profile",
    users: "User Management",
    batches: "Batch Management",
    skills: "Skills & Parameters",
    companies: "Company Requirements",
    audit: "Audit Logs",
  };
  return map[page] ?? "PlacePro";
}
