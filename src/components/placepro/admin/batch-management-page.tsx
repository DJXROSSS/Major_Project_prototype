"use client";

import { useMemo, useState } from "react";
import { BarChart3, GraduationCap, Layers, Pencil, Plus, Users } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { DOMAIN_GROUPS, STUDENTS, domainAverage } from "@/lib/placepro/mock-data";
import type { Batch } from "@/types";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { PRBadge, MiniBar } from "@/components/placepro/shared/badges";
import { EmptyState } from "@/components/placepro/shared/states";
import { InfoRow, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Batch Management                                                    */
/* ------------------------------------------------------------------ */

interface BatchForm {
  name: string;
  department: string;
  academicYears: string;
  sections: string;
  trainerIds: string[];
}

const EMPTY_FORM: BatchForm = { name: "", department: "", academicYears: "", sections: "", trainerIds: [] };

export default function BatchManagementPage() {
  const batches = useAppStore((s) => s.batches);
  const users = useAppStore((s) => s.users);
  const addBatch = useAppStore((s) => s.addBatch);
  const updateBatch = useAppStore((s) => s.updateBatch);
  const { toast } = useToast();

  const trainers = useMemo(() => users.filter((u) => u.role === "trainer"), [users]);

  /* dialogs */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState<BatchForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ name?: string; department?: string }>({});
  const [statsBatch, setStatsBatch] = useState<Batch | null>(null);

  function liveStudentCount(batch: Batch) {
    const live = STUDENTS.filter((s) => s.batch === batch.name).length;
    return live > 0 ? live : batch.studentCount;
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(b: Batch) {
    setEditing(b);
    setForm({
      name: b.name,
      department: b.department,
      academicYears: b.academicYears,
      sections: b.sections.join(", "),
      trainerIds: [...b.trainerIds],
    });
    setErrors({});
    setDialogOpen(true);
  }

  function toggleTrainer(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      trainerIds: checked ? [...f.trainerIds, id] : f.trainerIds.filter((t) => t !== id),
    }));
  }

  function saveBatch() {
    const next: { name?: string; department?: string } = {};
    if (!form.name.trim()) next.name = "Batch name is required.";
    if (!form.department.trim()) next.department = "Department is required.";
    if (next.name || next.department) {
      setErrors(next);
      return;
    }
    const sections = form.sections.split(",").map((s) => s.trim()).filter(Boolean);
    if (editing) {
      updateBatch(editing.id, {
        name: form.name.trim(),
        department: form.department.trim(),
        academicYears: form.academicYears.trim(),
        sections,
        trainerIds: form.trainerIds,
      });
      toast({ title: "Batch updated", description: `${form.name.trim()} was saved successfully.` });
    } else {
      addBatch({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        department: form.department.trim(),
        academicYears: form.academicYears.trim() || form.name.trim(),
        sections,
        trainerIds: form.trainerIds,
        studentCount: 0,
        status: "active",
      });
      toast({ title: "Batch created", description: `${form.name.trim()} is now available for enrollment.` });
    }
    setDialogOpen(false);
  }

  /* batch statistics computed live from STUDENTS */
  const stats = useMemo(() => {
    if (!statsBatch) return null;
    const students = STUDENTS.filter((s) => s.batch === statsBatch.name);
    const pr = students.filter((s) => s.prStatus === "PR").length;
    const npr = students.filter((s) => s.prStatus === "NPR").length;
    const avgCgpa = students.length
      ? Number((students.reduce((a, s) => a + s.cgpa, 0) / students.length).toFixed(2))
      : 0;
    const domains = DOMAIN_GROUPS.map((g) => ({ label: g.label, value: domainAverage(students, g.label) }));
    const top = [...students].sort((a, b) => b.average - a.average).slice(0, 3);
    return { students, pr, npr, avgCgpa, domains, top };
  }, [statsBatch]);

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

      {batches.length === 0 ? (
        <Card className="border-border bg-card p-0 shadow-none">
          <EmptyState
            icon={Layers}
            title="No batches yet"
            description="Create a batch to start grouping students and assigning trainers."
            action={
              <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={openCreate}>
                <Plus className="size-3.5" /> Create batch
              </Button>
            }
          />
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => (
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
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {b.sections.length ? (
                    b.sections.map((sec) => (
                      <span key={sec} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Section {sec}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No sections</span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Users className="size-4" />
                    <span>
                      <span className="tabular font-semibold text-foreground">{liveStudentCount(b)}</span> students
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {b.status === "active" ? "Active cohort" : "Archived"}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned trainers</p>
                  {b.trainerIds.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {b.trainerIds.map((id) => {
                        const t = users.find((u) => u.id === id);
                        return (
                          <li key={id} className="flex items-center gap-2 text-[13px] text-foreground">
                            <UserAvatar name={t?.name ?? "?"} size="sm" />
                            <span className="truncate">{t?.name ?? "Unknown trainer"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">No trainers assigned yet.</p>
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
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[13px] text-primary" onClick={() => openEdit(b)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              </div>
            </Card>
          ))}
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
              <div className="grid gap-1.5">
                <Label htmlFor="batch-sections">Sections (comma-separated)</Label>
                <Input
                  id="batch-sections"
                  value={form.sections}
                  onChange={(e) => setForm((f) => ({ ...f, sections: e.target.value }))}
                  placeholder="e.g. A, B, C"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Assigned trainers</Label>
              {trainers.length ? (
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

      {/* batch statistics dialog */}
      <Dialog open={statsBatch !== null} onOpenChange={(o) => !o && setStatsBatch(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{statsBatch ? `${statsBatch.name} — statistics` : "Batch statistics"}</DialogTitle>
            <DialogDescription>Live performance snapshot computed from current student records.</DialogDescription>
          </DialogHeader>
          {statsBatch && stats ? (
            <>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total students</p>
                    <p className="tabular mt-1 flex items-center gap-1.5 text-xl font-semibold text-foreground">
                      <GraduationCap className="size-4 text-primary" /> {stats.students.length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Average CGPA</p>
                    <p className="tabular mt-1 text-xl font-semibold text-foreground">{stats.avgCgpa.toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-1 rounded-lg border border-border px-4 py-2">
                  <InfoRow label="Placement ready">
                    <span className="tabular">{stats.pr}</span>
                  </InfoRow>
                  <InfoRow label="Not placement ready">
                    <span className="tabular">{stats.npr}</span>
                  </InfoRow>
                  <InfoRow label="PR ratio">
                    {stats.students.length ? `${Math.round((stats.pr / stats.students.length) * 100)}%` : "—"}
                  </InfoRow>
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
