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

  /* actions */
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  navigate: (page: Page, params?: Record<string, string>) => void;
  setSidebarPinned: (pinned: boolean) => void;
  openDialog: (dialog: "help" | "settings") => void;
  closeDialog: () => void;

  addSkill: (skill: Skill) => void;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;

  addCompany: (company: Company) => void;
  updateCompany: (id: string, patch: Partial<Company>) => void;
  deleteCompany: (id: string) => void;

  addUser: (user: AppUser) => void;
  updateUser: (id: string, patch: Partial<AppUser>) => void;

  addBatch: (batch: Batch) => void;
  updateBatch: (id: string, patch: Partial<Batch>) => void;

  importAssessment: (assessment: Assessment, source: ImportedSource) => void;
  markAssessmentReviewed: (id: string) => void;
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

  login: (email, password) => {
    const account = DEMO_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!account || account.password !== password) {
      return { ok: false, error: "Invalid email or password. Please try again." };
    }
    const user: SessionUser = {
      id: account.userId,
      name: account.name,
      email: account.email,
      role: account.role,
      studentId: account.studentId,
      title: account.title,
    };
    set({ user, route: { page: HOME_PAGE[account.role] } });
    return { ok: true };
  },

  logout: () => set({ user: null, route: { page: "dashboard" } }),

  navigate: (page, params) => {
    set({ route: { page, params } });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },

  setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),

  openDialog: (dialog) => set({ uiDialog: dialog }),
  closeDialog: () => set({ uiDialog: null }),

  addSkill: (skill) => set((s) => ({ skills: [skill, ...s.skills] })),
  updateSkill: (id, patch) =>
    set((s) => ({ skills: s.skills.map((sk) => (sk.id === id ? { ...sk, ...patch } : sk)) })),
  deleteSkill: (id) => set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) })),

  addCompany: (company) => set((s) => ({ companies: [company, ...s.companies] })),
  updateCompany: (id, patch) =>
    set((s) => ({ companies: s.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  deleteCompany: (id) => set((s) => ({ companies: s.companies.filter((c) => c.id !== id) })),

  addUser: (user) => set((s) => ({ users: [user, ...s.users] })),
  updateUser: (id, patch) =>
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),

  addBatch: (batch) => set((s) => ({ batches: [batch, ...s.batches] })),
  updateBatch: (id, patch) =>
    set((s) => ({ batches: s.batches.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),

  importAssessment: (assessment, source) =>
    set((s) => ({
      assessments: [assessment, ...s.assessments],
      importedSources: [source, ...s.importedSources],
    })),

  markAssessmentReviewed: (id) =>
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === id ? { ...a, reviewed: true } : a)),
    })),
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
