"use client";

/* PlacePro — application store                                        */
/* Session, routing, sidebar state and all mutable domain collections  */
/* (skills, companies, users, batches, imported assessments) live      */
/* here so every portal shares one source of truth.                    */

import { create } from "zustand";
import type {
  AppUser,
  Assessment,
  Batch,
  Company,
  EvaluationDomain,
  ImportedSource,
  Page,
  Route,
  SessionUser,
  Skill,
  TrainerFeedback,
} from "@/types";
import { api, ApiError } from "./api";
import { canVisit, routeHref, pushNavigation } from "./routing";
import { logger } from "@/lib/logger";

interface AppState {
  /* session */
  user: SessionUser | null;

  /* navigation */
  route: Route;
  sidebarPinned: boolean;
  uiDialog: "help" | "settings" | null;

  /* domain data */
  skills: Skill[];
  domains: EvaluationDomain[];
  companies: Company[];
  users: AppUser[];
  batches: Batch[];
  assessments: Assessment[];
  importedSources: ImportedSource[];
  feedback: TrainerFeedback[];
  students: import("@/types").Student[];
  auditLogs: import("@/types").AuditLog[];
  dashboard: import("./api").DashboardData | null;
  isRefreshing: boolean;
  rosterLoaded: boolean;
  dataError: string | null;

  /* actions */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshData: () => Promise<void>;
  setDomains: (domains: EvaluationDomain[]) => void;
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

  addBatch: (batch: Omit<Batch, "id" | "studentCount" | "trainers"> | Batch) => Promise<void>;
  updateBatch: (id: string, patch: Partial<Batch>) => Promise<void>;

  importAssessment: (assessment: Assessment, source: ImportedSource) => void;
  markAssessmentReviewed: (id: string) => Promise<void>;
  rollbackAssessment: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  route: { page: "dashboard" },
  sidebarPinned: true,
  uiDialog: null,

  skills: [],
  domains: [],
  companies: [],
  users: [],
  batches: [],
  assessments: [],
  importedSources: [],
  feedback: [],
  students: [],
  auditLogs: [],
  dashboard: null,
  isRefreshing: false,
  rosterLoaded: false,
  dataError: null,

  login: async (email, password) => {
    try {
      const { user } = await api.login(email, password);
      set({ user });
      await useAppStore.getState().refreshData();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed. Please try again." };
    }
  },

  logout: async () => {
    try { await api.logout(); } catch { /* Clear the local session even when the gateway is unavailable. */ }
    set({ user: null, rosterLoaded: false, route: { page: "dashboard" }, students: [], assessments: [], feedback: [], skills: [], domains: [], batches: [], companies: [], users: [], auditLogs: [], dashboard: null });
  },

  restoreSession: async () => {
    try {
      const { user } = await api.me();
      set({ user });
      await useAppStore.getState().refreshData();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) logger.warn("session.restore_failed", { error: error instanceof Error ? error.message : String(error) });
      set({ user: null });
    }
  },

  refreshData: async () => {
    const user = useAppStore.getState().user;
    if (!user || user.mustChangePassword) return;
    set({ isRefreshing: true, dataError: null });
    try {
      if (user.role === "student") {
        const [student, assessmentResponse, feedback, skills, domains] = await Promise.all([api.myStudent(), api.myAssessments(), api.myFeedback(), api.skills(), api.domains()]);
        const assessments = assessmentResponse.items.map((item) => ({
          id: item.assessmentId, name: item.name, type: item.type, batch: student.batch, date: item.date,
          uploadedBy: "", reviewed: true,
          results: [{ studentId: student.id, marks: item.marks, maxMarks: item.maxMarks, percentage: item.percentage }],
        }));
        set({ assessments, feedback, students: [student], skills, domains, auditLogs: [], dashboard: { role: "student" }, isRefreshing: false });
        return;
      }
      // This is a bounded convenience snapshot. Listings and aggregate counts use
      // their dedicated paginated/aggregate endpoints instead of treating it as complete.
      const needsRoster = typeof window === "undefined" || window.location.pathname !== "/trainer/students";
      const [studentsResponse, assessments, companies, batches, skills, dashboard, domains] = await Promise.all([
        needsRoster ? api.students() : Promise.resolve({ items: useAppStore.getState().students }), api.assessments(), api.companies(), api.batches(), api.skills(), api.dashboard(), api.domains(),
      ]);
      if (needsRoster) set({ rosterLoaded: true });
      const normalizedAssessments = assessments.map((item) => ({
        ...item,
        batch: (item as Assessment & { batchId?: string }).batch ?? (item as Assessment & { batchId?: string }).batchId ?? "Unassigned",
        uploadedBy: typeof item.uploadedBy === "object" ? (item.uploadedBy as unknown as { name: string }).name : item.uploadedBy,
        results: item.results ?? [],
      }));
      if (user.role === "admin") {
        const [users, auditResponse] = await Promise.all([api.users(), api.auditLogs()]);
        set({ users, feedback: [], importedSources: [], assessments: normalizedAssessments, companies, batches, skills, domains, students: studentsResponse.items, auditLogs: auditResponse.items, dashboard, isRefreshing: false });
      } else {
        set({ feedback: [], importedSources: [], assessments: normalizedAssessments, companies, batches, skills, domains, students: studentsResponse.items, auditLogs: [], dashboard, isRefreshing: false });
      }


    } catch (error) {
      logger.error("data.refresh_failed", error, { role: user.role });
      set({ isRefreshing: false, dataError: error instanceof Error ? error.message : "Unable to load current data." });
    }
  },

  navigate: (page, params) => {
    const user = useAppStore.getState().user;
    if (user && canVisit(user.role, page)) pushNavigation(routeHref(user.role, page, params));
  },

  setDomains: (domains) => set({ domains }),

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
  updateUser: async (id, patch) => { const updated = await api.updateUser(id, patch); set((s) => ({ users: s.users.map((u) => u.id === id ? { ...u, ...updated } : u) })); },

  addBatch: async (batch) => { await api.createBatch(batch); const batches = await api.batches(); set({ batches }); },
  updateBatch: async (id, patch) => { const updated = await api.updateBatch(id, patch); set((s) => ({ batches: s.batches.map((b) => b.id === id ? updated : b) })); },

  importAssessment: (assessment, source) =>
    set((s) => ({
      assessments: [assessment, ...s.assessments],
      importedSources: [source, ...s.importedSources],
    })),

  markAssessmentReviewed: async (id) => {
    await api.reviewAssessment(id);
    set((s) => ({ assessments: s.assessments.map((a) => a.id === id ? { ...a, reviewed: true } : a) }));
  },
  rollbackAssessment: async (id) => {
    await api.rollbackAssessment(id);
    set((s) => ({ assessments: s.assessments.filter((a) => a.id !== id) }));
    await useAppStore.getState().refreshData();
  },
}));

/* ------------------------- selectors / helpers ------------------------- */

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
    "profile-intelligence": ["Student Portal", "Profile Intelligence"],
    users: ["Administration", "User Management"],
    batches: ["Administration", "Batch Management"],
    skills: ["Administration", "Skills & Parameters"],
    domains: ["Administration", "Manage Domains"],
    companies: ["Administration", "Company Requirements"],
    audit: ["Administration", "Audit Logs"],
  };
  return map[page] ?? ["PlacePro"];
}
