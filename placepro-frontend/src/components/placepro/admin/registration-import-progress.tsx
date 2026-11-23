"use client";

import { useId, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, FileSpreadsheet, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/placepro/store";
import { useRegistrationImports, type RegistrationTask } from "@/lib/placepro/registration-imports";
import { RegistrationImportReview } from "./registration-import";

function isActive({ status }: RegistrationTask) {
  return status === "uploading" || status === "validating" || status === "importing";
}

const statusLabels = {
  uploading: "Uploading file…",
  validating: "Validating records…",
  "upload-error": "Upload failed",
  ready: "Ready to review",
  importing: "Importing records…",
  complete: "Import complete",
};

function statusLabel(task: RegistrationTask) {
  return task.status === "ready" && task.error ? "Review required" : statusLabels[task.status];
}

export default function RegistrationImportProgress() {
  const isAdmin = useAppStore((state) => state.user?.role === "admin" && !state.user.mustChangePassword);
  const tasks = useRegistrationImports((state) => state.tasks);
  const retryUpload = useRegistrationImports((state) => state.retryUpload);
  const dismiss = useRegistrationImports((state) => state.dismiss);
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const listId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  if (!isAdmin || !tasks.length) return null;

  const expanded = collapsedFor !== tasks[0].id;
  const activeCount = tasks.filter(isActive).length;
  const panelStatus = activeCount ? `${activeCount} in progress`
    : !expanded && tasks.length === 1 ? statusLabel(tasks[0])
    : `${tasks.length} ${tasks.length === 1 ? "file" : "files"}`;
  const review = tasks.find((task) => task.id === reviewId);
  const reviewTask = review?.status === "ready" || review?.status === "complete" ? review : null;

  return (
    <>
      <section aria-label="Registration uploads" className="fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl sm:right-5 sm:bottom-5 sm:left-auto sm:w-96">
        <header className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-2">
          <h2 className="text-sm font-semibold">Registration imports</h2>
          <div className="flex items-center gap-2">
            <span aria-live={expanded ? "off" : "polite"} className="text-xs text-muted-foreground">{panelStatus}</span>
            <Button ref={toggle} variant="ghost" size="icon" className="size-7" aria-expanded={expanded} aria-controls={listId}
              aria-label={expanded ? "Minimize registration imports" : "Expand registration imports"}
              onClick={() => setCollapsedFor(expanded ? tasks[0].id : null)}>
              {expanded ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </div>
        </header>
        <ul id={listId} className="max-h-[min(45dvh,24rem)] divide-y overflow-y-auto" hidden={!expanded}>
          {tasks.map((task) => {
            const pending = isActive(task);
            const Icon = pending ? LoaderCircle : task.error ? CircleAlert : task.status === "complete" ? CheckCircle2 : FileSpreadsheet;
            const progress = task.status === "uploading" ? task.percent : undefined;
            return (
              <li key={task.id} className="flex gap-3 px-4 py-3">
                <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${pending ? "text-primary motion-safe:animate-spin" : task.error ? "text-destructive" : "text-primary"}`} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium" title={task.fileName}>{task.fileName}</p>
                  <p role="status" className="text-xs text-muted-foreground">
                    <span className="sr-only">{task.fileName} </span>
                    {statusLabel(task)}
                  </p>
                  {progress !== undefined && (
                    <div className="flex items-center gap-2">
                      <progress aria-label={`Uploading ${task.fileName}`} value={progress} max={100} className="h-1.5 w-full accent-primary" />
                      <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
                    </div>
                  )}
                  {task.status === "importing" && <p className="text-xs text-muted-foreground">Large files can take longer while login credentials are secured.</p>}
                  {task.error && <p className="break-words text-xs text-destructive">{task.error}</p>}
                  {task.status === "ready" && task.result.summary && (
                    <p className="text-xs text-muted-foreground">{task.result.summary.valid.toLocaleString()} of {task.result.summary.total.toLocaleString()} records ready</p>
                  )}
                  {task.status === "complete" && (
                    <p className="text-xs text-muted-foreground">
                      {task.result.imported?.toLocaleString()} imported
                      {task.result.failed === undefined
                        ? ` · ${task.result.skipped?.toLocaleString() ?? "0"} skipped or failed`
                        : ` · ${((task.result.skipped ?? 0) - task.result.failed).toLocaleString()} skipped · ${task.result.failed.toLocaleString()} failed`}
                    </p>
                  )}
                  {task.status === "upload-error" && <Button variant="outline" size="sm" className="mt-1 h-7" onClick={() => retryUpload(task.id)}>Retry upload</Button>}
                  {(task.status === "ready" || task.status === "complete") && (
                    <Button variant="outline" size="sm" className="mt-1 h-7" onClick={(event) => {
                      reviewTrigger.current = event.currentTarget;
                      setReviewId(task.id);
                    }}>
                      {task.status === "complete" ? "View results" : "Review import"}
                    </Button>
                  )}
                </div>
                {!pending && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Dismiss ${task.fileName}`} onClick={() => dismiss(task.id)}><X /></Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <Dialog open={reviewTask !== null} onOpenChange={(open) => { if (!open) setReviewId(null); }}>
        {reviewTask && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl" onCloseAutoFocus={(event) => {
            event.preventDefault();
            (reviewTrigger.current?.isConnected ? reviewTrigger.current : toggle.current)?.focus();
          }}>
            <DialogHeader>
              <DialogTitle>{reviewTask.status === "complete" ? "Import results" : "Review registration import"}</DialogTitle>
              <DialogDescription className="break-all">{reviewTask.result.fileName ?? reviewTask.fileName}</DialogDescription>
            </DialogHeader>
            <RegistrationImportReview key={reviewTask.id} task={reviewTask} onConfirm={() => setReviewId(null)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
