"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, AlertTriangle, BarChart3, ChevronDown, GraduationCap, Grid2X2, Layers, Pencil, Plus, RotateCcw, UserRoundX, Users } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import type { AppUser, Batch } from "@/types";
import { api, ApiError, type ApiErrorDetail, type BatchStats } from "@/lib/placepro/api";
import { generateSectionNames, parseManualSectionNames, uniqueSectionNames } from "@/lib/placepro/batch-sections";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { PRBadge, MiniBar } from "@/components/placepro/shared/badges";
import { EmptyState } from "@/components/placepro/shared/states";
import { InfoRow, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Batch Management                                                    */
/* ------------------------------------------------------------------ */

type SectionMode = "auto" | "manual";

interface BatchForm {
  name: string;
  department: string;
  academicYears: string;
  sectionMode: SectionMode;
  sectionCount: string;
  manualSections: string;
  trainerIds: string[];
}

const EMPTY_FORM: BatchForm = {
  name: "", department: "", academicYears: "", sectionMode: "auto", sectionCount: "", manualSections: "", trainerIds: [],
};

export default function BatchManagementPage() {
  const batches = useAppStore((s) => s.batches);
  const addBatch = useAppStore((s) => s.addBatch);
  const updateBatch = useAppStore((s) => s.updateBatch);
  const navigate = useAppStore((s) => s.navigate);
  const { toast } = useToast();

  const [trainers, setTrainers] = useState<AppUser[]>([]);
  const [trainersLoading, setTrainersLoading] = useState(true);
  const [trainersError, setTrainersError] = useState("");

  /* dialogs */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState<BatchForm>(EMPTY_FORM);
  const [sectionsEdited, setSectionsEdited] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; department?: string; sections?: string }>({});
  const [sectionConflict, setSectionConflict] = useState<ApiErrorDetail | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [batchView, setBatchView] = useState<"active" | "archived">("active");
  const [archivedBatches, setArchivedBatches] = useState<Batch[]>([]);
  const [archiveListLoading, setArchiveListLoading] = useState(false);
  const [archiveListError, setArchiveListError] = useState("");
  const [lifecycleTarget, setLifecycleTarget] = useState<Batch | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore">("archive");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [resolutionTarget, setResolutionTarget] = useState<{ batch: Batch; missingId: string } | null>(null);
  const [resolutionAction, setResolutionAction] = useState<"remove" | "replace">("remove");
  const [replacementTrainerId, setReplacementTrainerId] = useState("");
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [resolutionError, setResolutionError] = useState("");
  const [statsBatch, setStatsBatch] = useState<Batch | null>(null);
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const statsRequestId = useRef(0);
  const visibleBatches = batchView === "active" ? batches : archivedBatches;

  useEffect(() => {
    let active = true;
    async function loadTrainers() {
      setTrainersLoading(true);
      setTrainersError("");
      try {
        const all: AppUser[] = [];
        for (let page = 1; ; page += 1) {
          const response = await api.listUsers({ role: "trainer", page, pageSize: 100 });
          all.push(...response.items);
          if (all.length >= response.total) break;
        }
        if (active) setTrainers(all);
      } catch (error) {
        if (active) setTrainersError(error instanceof Error ? error.message : "Unable to load trainer accounts.");
      } finally {
        if (active) setTrainersLoading(false);
      }
    }
    void loadTrainers();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!statsBatch) {
      statsRequestId.current += 1;
      setStats(null);
      setStatsError("");
      return;
    }
    const currentRequest = ++statsRequestId.current;
    setStatsLoading(true);
    setStatsError("");
    void api.batchStats(statsBatch.id)
      .then((value) => { if (statsRequestId.current === currentRequest) setStats(value); })
      .catch((error) => { if (statsRequestId.current === currentRequest) setStatsError(error instanceof Error ? error.message : "Unable to load batch statistics."); })
      .finally(() => { if (statsRequestId.current === currentRequest) setStatsLoading(false); });
  }, [statsBatch]);

  useEffect(() => {
    if (batchView !== "archived") return;
    let active = true;
    setArchiveListLoading(true);
    setArchiveListError("");
    void api.listBatches({ status: "archived" })
      .then((items) => { if (active) setArchivedBatches(items); })
      .catch((error) => { if (active) setArchiveListError(error instanceof Error ? error.message : "Unable to load archived batches."); })
      .finally(() => { if (active) setArchiveListLoading(false); });
    return () => { active = false; };
  }, [batchView]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSectionsEdited(false);
    setErrors({});
    setSectionConflict(null);
    setDialogOpen(true);
  }

  function openEdit(b: Batch) {
    setEditing(b);
    setForm({
      name: b.name,
      department: b.department,
      academicYears: b.academicYears,
      sectionMode: "manual",
      sectionCount: String(b.sections.length || ""),
      manualSections: b.sections.join(", "),
      trainerIds: [...b.trainerIds],
    });
    setSectionsEdited(false);
    setErrors({});
    setSectionConflict(null);
    setDialogOpen(true);
  }

  function changeSectionMode(mode: SectionMode) {
    setForm((current) => ({ ...current, sectionMode: mode }));
    setSectionsEdited(true);
    setErrors((current) => ({ ...current, sections: undefined }));
  }

  function toggleSections(batchId: string) {
    setExpandedSections((current) => current.includes(batchId)
      ? current.filter((id) => id !== batchId)
      : [...current, batchId]);
  }

  async function confirmLifecycle(event: React.MouseEvent) {
    event.preventDefault();
    if (!lifecycleTarget || lifecycleBusy) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      if (lifecycleAction === "archive") await api.archiveBatch(lifecycleTarget.id);
      else await api.restoreBatch(lifecycleTarget.id);
      await useAppStore.getState().refreshData();
      if (batchView === "archived") setArchivedBatches(await api.listBatches({ status: "archived" }));
      toast({
        title: lifecycleAction === "archive" ? "Batch archived" : "Batch restored",
        description: `${lifecycleTarget.name} was ${lifecycleAction === "archive" ? "moved to Archived Batches" : "restored to Active Batches"}.`,
      });
      setLifecycleTarget(null);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : `Unable to ${lifecycleAction} this batch.`);
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function confirmResolution() {
    if (!resolutionTarget || resolutionBusy) return;
    setResolutionBusy(true);
    setResolutionError("");
    try {
      const updated = await api.resolveTrainerAssignment(resolutionTarget.batch.id, {
        missingTrainerId: resolutionTarget.missingId,
        action: resolutionAction,
        ...(resolutionAction === "replace" ? { replacementTrainerId } : {}),
      });
      useAppStore.setState((state) => ({ batches: state.batches.map((batch) => batch.id === updated.id ? updated : batch) }));
      setArchivedBatches((items) => items.map((batch) => batch.id === updated.id ? updated : batch));
      if (editing?.id === updated.id) {
        setEditing(updated);
        setForm((current) => ({ ...current, trainerIds: [...updated.trainerIds] }));
      }
      toast({ title: "Trainer assignment corrected", description: `User ID ${resolutionTarget.missingId} was ${resolutionAction === "remove" ? "removed" : "replaced"}.` });
      setResolutionTarget(null);
    } catch (error) {
      setResolutionError(error instanceof Error ? error.message : "Unable to correct this trainer assignment.");
    } finally {
      setResolutionBusy(false);
    }
  }

  function toggleTrainer(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      trainerIds: checked ? [...f.trainerIds, id] : f.trainerIds.filter((t) => t !== id),
    }));
  }

  async function saveBatch() {
    const next: { name?: string; department?: string; sections?: string } = {};
    if (!form.name.trim()) next.name = "Batch name is required.";
    if (!form.department.trim()) next.department = "Department is required.";
    const sectionResult = editing && !sectionsEdited
      ? { sections: [...editing.sections], error: "" }
      : form.sectionMode === "auto"
        ? generateSectionNames(form.sectionCount)
        : parseManualSectionNames(form.manualSections);
    if (sectionResult.error) next.sections = sectionResult.error;
    if (next.name || next.department || next.sections) {
      setErrors(next);
      return;
    }
    const sections = sectionResult.sections;
    const removedSections = editing
      ? editing.sections.filter((oldSection) => !sections.some((nextSection) => nextSection.toLocaleLowerCase() === oldSection.toLocaleLowerCase()))
      : [];
    if (removedSections.length && !window.confirm(`Remove ${removedSections.map((value) => `Section ${value}`).join(", ")}? Empty sections will be deleted from this batch.`)) return;
    setSectionConflict(null);
    try {
      if (editing) {
        await updateBatch(editing.id, {
          name: form.name.trim(),
          department: form.department.trim(),
          academicYears: form.academicYears.trim(),
          sections,
          trainerIds: form.trainerIds,
        });
        toast({ title: "Batch updated", description: `${form.name.trim()} was saved successfully.` });
      } else {
        await addBatch({
          name: form.name.trim(),
          department: form.department.trim(),
          academicYears: form.academicYears.trim() || form.name.trim(),
          sections,
          trainerIds: form.trainerIds,
          status: "active",
        });
        toast({ title: "Batch created", description: `${form.name.trim()} is now available for enrollment.` });
      }
      setDialogOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.details[0]?.section) {
        setSectionConflict(error.details[0]);
        setErrors((current) => ({ ...current, sections: error.details.map((detail) => detail.message).join(" ") }));
      }
      toast({ title: "Batch could not be saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  const sectionPreview = editing && !sectionsEdited
    ? { sections: [...editing.sections], error: "" }
    : form.sectionMode === "auto"
      ? generateSectionNames(form.sectionCount)
      : parseManualSectionNames(form.manualSections);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch Management"
        subtitle="Create cohorts, assign trainers and review batch-level performance."
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={openCreate}>
            <Plus className="size-4" /> Create batch
          </Button>
        }
      />

      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Batch status">
        <button type="button" role="tab" aria-selected={batchView === "active"} className={`rounded-md px-3 py-1.5 text-sm font-medium ${batchView === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setBatchView("active")}>Active Batches</button>
        <button type="button" role="tab" aria-selected={batchView === "archived"} className={`rounded-md px-3 py-1.5 text-sm font-medium ${batchView === "archived" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setBatchView("archived")}>Archived Batches</button>
      </div>

      {batchView === "archived" && archiveListLoading ? (
        <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-none">Loading archived batches…</Card>
      ) : batchView === "archived" && archiveListError ? (
        <Card className="space-y-3 border-border bg-card p-6 text-center shadow-none"><p role="alert" className="text-sm text-danger">{archiveListError}</p><Button variant="outline" size="sm" onClick={() => { setBatchView("active"); queueMicrotask(() => setBatchView("archived")); }}>Retry</Button></Card>
      ) : visibleBatches.length === 0 ? (
        <Card className="border-border bg-card p-0 shadow-none">
          <EmptyState
            icon={Layers}
            title={batchView === "active" ? "No active batches" : "No archived batches"}
            description={batchView === "active" ? "Create a batch to start grouping students and assigning trainers." : "Archived batches will appear here and can be restored later."}
            action={
              batchView === "active" ? <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={openCreate}>
                <Plus className="size-3.5" /> Create batch
              </Button> : undefined
            }
          />
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleBatches.map((b) => {
            const cardSections = uniqueSectionNames(b.sections);
            const sectionsExpanded = expandedSections.includes(b.id);
            return (
            <Card key={b.id} className="flex flex-col gap-0 border-border bg-card p-0 shadow-none pp-rise">
              <div className="border-b border-border/70 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-foreground">{b.name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{b.department}</p>
                  </div>
                  <span className="inline-flex shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                    {b.academicYears}
                  </span>
                </div>
                <div className="mt-3">
                  {cardSections.length ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary"
                        aria-expanded={sectionsExpanded}
                        aria-controls={`batch-sections-${b.id}`}
                        onClick={() => toggleSections(b.id)}
                      >
                        <ChevronDown className={`size-3.5 transition-transform duration-200 ${sectionsExpanded ? "rotate-180" : ""}`} />
                        {sectionsExpanded ? "Hide sections" : `View all sections (${cardSections.length})`}
                      </Button>
                      <div
                        id={`batch-sections-${b.id}`}
                        className={`grid transition-[grid-template-rows,opacity] duration-200 ${sectionsExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                      >
                        <div className="overflow-hidden">
                          <div className="flex flex-wrap gap-1.5">
                            {cardSections.map((section) => (
                              <span key={section} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Section {section}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No sections configured</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Grid2X2 className="size-4" />
                  <span><span className="tabular font-semibold text-foreground">{cardSections.length}</span> sections</span>
                </div>
              </div>

              <div className="flex-1 space-y-4 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Users className="size-4" />
                    <span>
                      <span className="tabular font-semibold text-foreground">{b.studentCount ?? 0}</span> students
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {b.status === "active" ? "Active cohort" : "Archived"}
                  </span>
                </div>
                {b.status === "archived" ? <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Archived {b.archivedAt ? new Date(b.archivedAt).toLocaleString() : "before archive tracking was enabled"}</p>
                  {b.archivedBy ? <p>By {b.archivedBy.name}</p> : null}
                </div> : null}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned trainers</p>
                  {b.trainerIds.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {b.trainerIds.map((id) => {
                        const t = (b.trainers ?? []).find((trainer) => trainer.id === String(id));
                        return (
                          <li key={id} className="flex items-center gap-2 text-[13px] text-foreground">
                            <UserAvatar name={t?.name ?? "?"} size="sm" />
                            <span className={t ? "truncate" : "truncate text-warning"}>
                              {t?.name ?? `Unresolved trainer (user ID: ${id})`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <UserRoundX className="size-4" /> No trainer assigned
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-border/70 px-5 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[13px]"
                  onClick={() => setStatsBatch(b)}
                >
                  <BarChart3 className="size-3.5" /> View statistics
                </Button>
                {b.status === "active" ? <>
                  <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[13px] text-primary" onClick={() => openEdit(b)}><Pencil className="size-3.5" /> Edit</Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[13px]" onClick={() => { setLifecycleAction("archive"); setLifecycleError(""); setLifecycleTarget(b); }}><Archive className="size-3.5" /> Archive</Button>
                </> : <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[13px] text-primary" onClick={() => { setLifecycleAction("restore"); setLifecycleError(""); setLifecycleTarget(b); }}><RotateCcw className="size-3.5" /> Restore</Button>}
              </div>
            </Card>
            );
          })}
        </section>
      )}

      {/* create / edit batch dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit batch" : "Create batch"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the cohort details, sections and assigned trainers." : "Define a new cohort and assign trainers to it."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="batch-name">Batch name</Label>
              <Input
                id="batch-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 2024–2028 CSE"
              />
              {errors.name ? <p className="text-xs text-danger">{errors.name}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="batch-dept">Department</Label>
              <Input
                id="batch-dept"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Computer Science & Engineering"
              />
              {errors.department ? <p className="text-xs text-danger">{errors.department}</p> : null}
            </div>
            <div>
              <Label>Section entry</Label>
              <div className="mt-1.5 grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Section entry mode">
                <button
                  type="button"
                  aria-pressed={form.sectionMode === "auto"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${form.sectionMode === "auto" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => changeSectionMode("auto")}
                >
                  Auto-generate
                </button>
                <button
                  type="button"
                  aria-pressed={form.sectionMode === "manual"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${form.sectionMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => changeSectionMode("manual")}
                >
                  Enter manually
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="batch-years">Academic years</Label>
                <Input
                  id="batch-years"
                  value={form.academicYears}
                  onChange={(e) => setForm((f) => ({ ...f, academicYears: e.target.value }))}
                  placeholder="e.g. 2024 – 2028"
                />
              </div>
              {form.sectionMode === "manual" ? <div className="grid gap-1.5">
                <Label htmlFor="batch-sections">Section names (comma-separated)</Label>
                <Input
                  id="batch-sections"
                  value={form.manualSections}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, manualSections: event.target.value }));
                    setSectionsEdited(true);
                    setErrors((current) => ({ ...current, sections: undefined }));
                  }}
                  placeholder="e.g. A, B, CH, Evening"
                />
              </div> : <div className="grid gap-1.5">
                <Label htmlFor="batch-section-count">Number of sections</Label>
                <Input
                  id="batch-section-count"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  inputMode="numeric"
                  value={form.sectionCount}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, sectionCount: event.target.value }));
                    setSectionsEdited(true);
                    setErrors((current) => ({ ...current, sections: undefined }));
                  }}
                  placeholder="e.g. 5"
                />
              </div>}
            </div>
            {errors.sections || (sectionsEdited && sectionPreview.error) ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-xs text-danger">{errors.sections || sectionPreview.error}</p>
                {sectionConflict ? <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setDialogOpen(false);
                    navigate("students", { batch: sectionConflict.batchId || editing?.id || "", section: sectionConflict.section || "" });
                  }}
                >View affected students</Button> : null}
              </div>
            ) : null}
            {sectionPreview.sections.length ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">Section preview</p>
                  <p className="text-xs text-muted-foreground">{sectionPreview.sections.length} total</p>
                </div>
                <div className="max-h-28 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {sectionPreview.sections.map((section) => (
                      <span key={section} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                        {section}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Assigned trainers</Label>
              {trainersLoading ? (
                <p className="text-xs text-muted-foreground">Loading trainer accounts…</p>
              ) : trainersError ? (
                <p role="alert" className="text-xs text-danger">{trainersError}</p>
              ) : trainers.length ? (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {trainers.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={form.trainerIds.includes(t.id)}
                        onCheckedChange={(c) => toggleTrainer(t.id, c === true)}
                        aria-label={`Assign ${t.name}`}
                      />
                      <UserAvatar name={t.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No trainer accounts exist yet.</p>
              )}
              {editing ? editing.trainerIds.filter((id) => !(editing.trainers ?? []).some((trainer) => trainer.id === id)).map((id) => (
                <div key={id} className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-warning"><AlertTriangle className="size-3.5" /> Unresolved assignment: User ID {id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">This user no longer exists as a trainer. No replacement will be chosen automatically.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setResolutionTarget({ batch: editing, missingId: id }); setResolutionAction("remove"); setReplacementTrainerId(""); setResolutionError(""); }}>Remove invalid assignment</Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setResolutionTarget({ batch: editing, missingId: id }); setResolutionAction("replace"); setReplacementTrainerId(""); setResolutionError(""); }}>Replace with existing trainer</Button>
                  </div>
                </div>
              )) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={saveBatch}>
              {editing ? "Save changes" : "Create batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={lifecycleTarget !== null} onOpenChange={(open) => { if (!open && !lifecycleBusy) { setLifecycleTarget(null); setLifecycleError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{lifecycleAction === "archive" ? "Archive" : "Restore"} {lifecycleTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>{lifecycleAction === "archive"
              ? "This batch will be removed from active Batch Management and moved to Archived Batches. All student records, trainer assignments, assessments, placement results, and historical information will be preserved. You can restore this batch later."
              : "This batch will return to Active Batches and become available for new registrations, transfers, assessments, and assignments."}</AlertDialogDescription>
          </AlertDialogHeader>
          {lifecycleTarget ? <div className="space-y-3"><div className="rounded-lg border border-border px-3 py-2 text-sm">
            <InfoRow label="Batch">{lifecycleTarget.name}</InfoRow><InfoRow label="Academic years">{lifecycleTarget.academicYears}</InfoRow>
            <InfoRow label="Department">{lifecycleTarget.department}</InfoRow><InfoRow label="Students">{lifecycleTarget.studentCount}</InfoRow>
            <InfoRow label="Sections">{lifecycleTarget.sections.length}</InfoRow><InfoRow label="Trainers">{lifecycleTarget.trainerIds.length}</InfoRow>
          </div>{lifecycleError ? <p role="alert" className="text-sm text-danger">{lifecycleError}</p> : null}</div> : null}
          <AlertDialogFooter><AlertDialogCancel disabled={lifecycleBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={lifecycleBusy} onClick={confirmLifecycle}>{lifecycleBusy ? "Saving…" : lifecycleAction === "archive" ? "Archive batch" : "Restore batch"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resolutionTarget !== null} onOpenChange={(open) => { if (!open && !resolutionBusy) setResolutionTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{resolutionAction === "remove" ? "Remove invalid trainer assignment?" : "Replace invalid trainer assignment?"}</DialogTitle>
            <DialogDescription>Batch: {resolutionTarget?.batch.name}. Missing user ID: {resolutionTarget?.missingId}. This correction affects only this assignment.</DialogDescription></DialogHeader>
          {resolutionAction === "replace" ? <div className="space-y-1.5"><Label htmlFor="replacement-trainer">Replacement trainer</Label><Select value={replacementTrainerId} onValueChange={setReplacementTrainerId}>
            <SelectTrigger id="replacement-trainer"><SelectValue placeholder="Select an active trainer" /></SelectTrigger>
            <SelectContent>{trainers.filter((trainer) => trainer.status === "active" && !resolutionTarget?.batch.trainerIds.includes(trainer.id)).map((trainer) => <SelectItem key={trainer.id} value={trainer.id}>{trainer.name} ({trainer.email})</SelectItem>)}</SelectContent>
          </Select></div> : <p className="text-sm text-muted-foreground">User ID {resolutionTarget?.missingId} will be removed. All other trainer assignments will remain unchanged.</p>}
          {resolutionError ? <p role="alert" className="text-sm text-danger">{resolutionError}</p> : null}
          <DialogFooter><Button variant="outline" disabled={resolutionBusy} onClick={() => setResolutionTarget(null)}>Cancel</Button><Button disabled={resolutionBusy || (resolutionAction === "replace" && !replacementTrainerId)} onClick={() => void confirmResolution()}>{resolutionBusy ? "Saving…" : resolutionAction === "remove" ? "Confirm removal" : "Confirm replacement"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* batch statistics dialog */}
      <Dialog open={statsBatch !== null} onOpenChange={(o) => !o && setStatsBatch(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{statsBatch ? `${statsBatch.name} — statistics` : "Batch statistics"}</DialogTitle>
            <DialogDescription>Live performance snapshot computed from current student records.</DialogDescription>
          </DialogHeader>
          {statsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading complete batch statistics…</div>
          ) : statsError ? (
            <div className="space-y-3 py-6 text-center">
              <p role="alert" className="text-sm text-danger">{statsError}</p>
              <Button variant="outline" size="sm" onClick={() => setStatsBatch({ ...statsBatch! })}>Retry</Button>
            </div>
          ) : statsBatch && stats ? (
            <>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total students</p>
                    <p className="tabular mt-1 flex items-center gap-1.5 text-xl font-semibold text-foreground">
                      <GraduationCap className="size-4 text-primary" /> {stats.studentCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Average CGPA</p>
                    <p className="tabular mt-1 text-xl font-semibold text-foreground">{stats.averageCgpa.toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-1 rounded-lg border border-border px-4 py-2">
                  <InfoRow label="Placement ready">
                    <span className="tabular">{stats.prCount}</span>
                  </InfoRow>
                  <InfoRow label="Not placement ready">
                    <span className="tabular">{stats.nprCount}</span>
                  </InfoRow>
                  <InfoRow label="PR ratio">
                    {stats.studentCount ? `${Math.round((stats.prCount / stats.studentCount) * 100)}%` : "—"}
                  </InfoRow>
                </div>

                <div>
                  <SectionHeading title="Students by section" description="Current database count for every configured section" />
                  <div className="mt-3 divide-y rounded-lg border border-border">
                    {stats.sectionCounts.map((item) => (
                      <div key={item.section} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm">Section {item.section}</span>
                        <span className="ml-auto tabular text-sm text-muted-foreground">{item.count}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setStatsBatch(null);
                            navigate("students", { batch: statsBatch.id, section: item.section });
                          }}
                        >View students</Button>
                      </div>
                    ))}
                    {!stats.sectionCounts.length ? <p className="p-3 text-sm text-muted-foreground">No sections are configured.</p> : null}
                  </div>
                </div>

                <div>
                  <SectionHeading title="Domain averages" description="Batch mean across evaluation domains" />
                  <div className="mt-3 space-y-2.5">
                    {stats.domains.map((d) => (
                      <div key={d.label} className="flex items-center justify-between gap-4">
                        <span className="w-40 shrink-0 text-[13px] text-muted-foreground">{d.label}</span>
                        <MiniBar value={d.value} width={120} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeading title="Top performers" description="Highest average score in this batch" />
                  {stats.top.length ? (
                    <ul className="mt-3 space-y-2">
                      {stats.top.map((s, i) => (
                        <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                          <span className="tabular w-4 text-[13px] font-medium text-muted-foreground">{i + 1}</span>
                          <UserAvatar name={s.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">{s.rollNumber}</span>
                          </span>
                          <span className="tabular text-[13px] font-semibold text-foreground">{s.average}%</span>
                          <PRBadge status={s.prStatus} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">No students enrolled in this batch yet.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="h-9" onClick={() => setStatsBatch(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
