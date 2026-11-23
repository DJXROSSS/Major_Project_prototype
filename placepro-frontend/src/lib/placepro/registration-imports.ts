"use client";

import { create } from "zustand";
import { api, type RegistrationImportResult } from "./api";
import { useAppStore } from "./store";

type ImportKind = "students" | "trainers";
export type ImportMode = NonNullable<RegistrationImportResult["mode"]>;

type UploadSource = { kind: ImportKind; file: File; batchId: string; chunkSize: number };
type ImportDetails = { id: string; kind: ImportKind; fileName: string; chunkSize: number; mode: ImportMode };
type UploadTask = ImportDetails & {
  status: "uploading" | "validating" | "upload-error";
  source: UploadSource;
  percent?: number;
  error?: string;
};
export type RegistrationReview = ImportDetails & {
  status: "ready" | "importing" | "complete";
  result: RegistrationImportResult;
  error?: string;
};
export type RegistrationTask = UploadTask | RegistrationReview;

interface ImportState {
  tasks: RegistrationTask[];
  revision: number;
  start: (source: UploadSource) => void;
  retryUpload: (id: string) => void;
  confirm: (id: string, mode: ImportMode, chunkSize: number) => void;
  dismiss: (id: string) => void;
}

let nextTask = 0;

function getAdminId() {
  const user = useAppStore.getState().user;
  return user?.role === "admin" && !user.mustChangePassword ? user.id : null;
}

async function refreshCollections(owner: string, revision: number) {
  const [users, students, batches] = await Promise.allSettled([api.users(), api.students(), api.batches()]);
  if (getAdminId() !== owner || useRegistrationImports.getState().revision !== revision) return;
  useAppStore.setState({
    ...(users.status === "fulfilled" && { users: users.value }),
    ...(students.status === "fulfilled" && { students: students.value.items }),
    ...(batches.status === "fulfilled" && { batches: batches.value }),
  });
}

export const useRegistrationImports = create<ImportState>((set, get) => {
  function update(task: RegistrationTask) {
    set((state) => state.tasks.some(({ id }) => id === task.id)
      ? { tasks: state.tasks.map((current) => current.id === task.id ? task : current) }
      : state);
  }

  async function upload(task: UploadTask) {
    const { source, id, kind, fileName, chunkSize, mode } = task;
    try {
      const form = new FormData();
      form.append("file", source.file);
      form.append("chunkSize", String(chunkSize));
      if (kind === "students") form.append("academicBatchId", source.batchId);
      const result = await api.previewRegistrationImport(kind, form, (progress) => {
        if (!get().tasks.some((current) => current.id === id && current.status === "uploading")) return;
        update(progress === "uploaded" ? { ...task, status: "validating", percent: undefined } : { ...task, percent: progress });
      });
      update({ id, kind, fileName, chunkSize, mode, status: "ready", result });
    } catch (error) {
      update({ ...task, status: "upload-error", error: error instanceof Error ? error.message : "Unable to upload file." });
    }
  }

  async function finishImport(task: RegistrationReview, owner: string) {
    try {
      const result = await api.confirmRegistrationImport(task.kind, task.result.importId, task.mode, task.chunkSize);
      if (!get().tasks.some(({ id }) => id === task.id)) return;
      if (!result.confirmed) {
        update({ ...task, status: "ready", result, error: "Some records changed after preview. Review the updated validation results." });
        return;
      }
      update({ ...task, status: "complete", result });
      const revision = get().revision + 1;
      set({ revision });
      void refreshCollections(owner, revision);
    } catch (error) {
      update({ ...task, status: "ready", error: error instanceof Error ? error.message : "Unable to confirm import." });
    }
  }

  return {
    tasks: [],
    revision: 0,
    start(source) {
      if (!getAdminId()) return;
      const task: UploadTask = {
        id: String(++nextTask), kind: source.kind, fileName: source.file.name,
        chunkSize: source.chunkSize, mode: "valid-only", status: "uploading", source,
      };
      set((state) => ({ tasks: [task, ...state.tasks] }));
      void upload(task);
    },
    retryUpload(id) {
      if (!getAdminId()) return;
      const task = get().tasks.find((item) => item.id === id);
      if (task?.status !== "upload-error") return;
      const uploading = { ...task, status: "uploading" as const, error: undefined, percent: undefined };
      update(uploading);
      void upload(uploading);
    },
    confirm(id, mode, chunkSize) {
      const owner = getAdminId();
      const task = get().tasks.find((item) => item.id === id);
      if (!owner || task?.status !== "ready") return;
      const importing = { ...task, status: "importing" as const, mode, chunkSize, error: undefined };
      update(importing);
      void finishImport(importing, owner);
    },
    dismiss(id) {
      set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
    },
  };
});

useAppStore.subscribe(({ user }, previous) => {
  if (user?.id !== previous.user?.id || user?.role !== previous.user?.role ||
    user?.mustChangePassword !== previous.user?.mustChangePassword) {
    useRegistrationImports.setState((state) => ({ tasks: [], revision: state.revision + 1 }));
  }
});
