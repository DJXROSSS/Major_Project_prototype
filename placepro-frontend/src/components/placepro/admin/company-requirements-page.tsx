"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { api } from "@/lib/placepro/api";
import { Checkbox } from "@/components/ui/checkbox";
import type { Batch, Company, CompanyCriterion } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { EmptyState } from "@/components/placepro/shared/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Company Requirements                                                */
/* ------------------------------------------------------------------ */

/** editor row — weightage held as a percentage, converted to 0–1 on save */
interface CriterionRow {
  skillId: string;
  minCutoff: number;
  weightage: number;
  mandatory: boolean;
}

interface CompanyForm {
  eligibleBatchIds: string[];
  name: string;
  role: string;
  industry: string;
  minCgpa: number;
  criteria: CriterionRow[];
}

const EMPTY_FORM: CompanyForm = { eligibleBatchIds: [], name: "", role: "", industry: "", minCgpa: 6, criteria: [] };

export default function CompanyRequirementsPage() {
  const companies = useAppStore((s) => s.companies);
  const skills = useAppStore((s) => s.skills);
  const addCompany = useAppStore((s) => s.addCompany);
  const updateCompany = useAppStore((s) => s.updateCompany);
  const deleteCompany = useAppStore((s) => s.deleteCompany);
  const { toast } = useToast();

  const numericSkills = useMemo(() => skills.filter((s) => s.active && s.parameterType === "numeric"), [skills]);

  /* dialogs */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Company | null>(null);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!dialogOpen) return;
    let active = true;
    setBatchSearch("");
    setBatchesLoading(true);
    setBatchError(null);
    api.batches().then(items => { if (active) setBatches(items); })
      .catch(error => { if (active) setBatchError(error instanceof Error ? error.message : "Unable to load batches"); })
      .finally(() => { if (active) setBatchesLoading(false); });
    return () => { active = false; };
  }, [dialogOpen]);

  const totalWeight = form.criteria.reduce((a, c) => a + (Number.isFinite(c.weightage) ? c.weightage : 0), 0);

  function skillName(skillId: string) {
    if (skillId === "PROJECT_SCORE") return "Verified project score";
    return skills.find((s) => s.id === skillId)?.name ?? "Unknown skill";
  }

  function toForm(c: Company): CompanyForm {
    return {
      eligibleBatchIds: [...(c.eligibleBatchIds ?? [])],
      name: c.name,
      role: c.role,
      industry: c.industry,
      minCgpa: c.minCgpa,
      criteria: c.criteria.map((cr) => ({
        skillId: cr.type === "PROJECT_SCORE" ? "PROJECT_SCORE" : cr.skillId,
        minCutoff: cr.minCutoff,
        weightage: Math.round(cr.weightage * 100),
        mandatory: cr.mandatory,
      })),
    };
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm(toForm(c));
    setErrors({});
    setDialogOpen(true);
  }

  function updateRow(i: number, patch: Partial<CriterionRow>) {
    setForm((f) => ({
      ...f,
      criteria: f.criteria.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    }));
  }

  function removeRow(i: number) {
    setForm((f) => ({ ...f, criteria: f.criteria.filter((_, idx) => idx !== i) }));
  }

  function addRow() {
    if (!numericSkills.length) return;
    setForm((f) => ({
      ...f,
      criteria: [
        ...f.criteria,
        { skillId: numericSkills[0].id, minCutoff: 60, weightage: 0, mandatory: false },
      ],
    }));
  }

  function addProjectScoreRow() {
    setForm((f) => ({
      ...f,
      criteria: f.criteria.some((row) => row.skillId === "PROJECT_SCORE")
        ? f.criteria
        : [...f.criteria, { skillId: "PROJECT_SCORE", minCutoff: 60, weightage: 0, mandatory: false }],
    }));
  }

  async function saveCompany() {
    if (saving) return;
    const next: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length > 100) next.name = "Company name is required (maximum 100 characters).";
    if (!form.role.trim() || form.role.trim().length > 100) next.role = "Role is required (maximum 100 characters).";
    if (!form.eligibleBatchIds.length) next.batches = "Select at least one eligible batch.";
    if (form.eligibleBatchIds.some(id => !batches.some(b => b.id === id))) next.batches = "Remove unavailable batches and select an existing batch.";
    // if (!Number.isFinite(form.minCgpa) || form.minCgpa < 0 || form.minCgpa > 10) next.criteria = "CGPA must be between 0 and 10.";
    if (form.criteria.some(c => !c.skillId || !Number.isFinite(c.minCutoff) || c.minCutoff < 0 || c.minCutoff > 100 || !Number.isFinite(c.weightage) || c.weightage < 0 || c.weightage > 100)) next.criteria = "Each cutoff and weight must be between 0 and 100.";
    if (new Set(form.criteria.map(c => c.skillId)).size !== form.criteria.length) next.criteria = "Select each skill or project-score criterion only once.";
    setErrors(next);
    if (Object.keys(next).length || batchesLoading || batchError) return;
    const criteria: CompanyCriterion[] = form.criteria.map(r => ({
      skillId: r.skillId, ...(r.skillId === "PROJECT_SCORE" ? { type: "PROJECT_SCORE" as const } : {}),
      minCutoff: r.minCutoff, weightage: r.weightage / 100, mandatory: r.mandatory,
    }));
    const payload = { name: form.name.trim(), role: form.role.trim(), industry: form.industry.trim(),
      minCgpa: form.minCgpa, criteria, eligibleBatchIds: form.eligibleBatchIds };
    setSaving(true);
    try {
      if (editing) await updateCompany(editing.id, payload);
      else await addCompany(payload);
      toast({ title: editing ? "Company updated" : "Company added", description: "Requirements and eligible batches saved." });
      setDialogOpen(false);
    } catch (error) {
      setErrors({ save: error instanceof Error ? error.message : "Unable to save company. Please try again." });
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting || saving) return;
    setSaving(true);
    try {
      await deleteCompany(deleting.id);
      toast({ title: "Company deleted", description: `${deleting.name} was removed.` });
      setDeleting(null);
    } catch (error) {
      toast({ title: "Unable to delete company", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  }

  /* criteria editor — shared by add & edit dialogs */
  const criteriaEditor = (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Eligibility criteria</Label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px]"
            onClick={addProjectScoreRow}
            disabled={form.criteria.some((row) => row.skillId === "PROJECT_SCORE")}
          >
            <Plus className="size-3.5" /> Add project score
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px]"
            onClick={addRow}
            disabled={!numericSkills.length}
          >
            <Plus className="size-3.5" /> Add skill
          </Button>
        </div>
      </div>
      {form.criteria.length ? (
          <>
            <div className="hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_5.5rem_4.5rem_2rem] sm:gap-2 sm:px-1">
              <span>Skill / criterion</span>
              <span>Cutoff</span>
              <span>Weight %</span>
              <span className="text-center">Mandatory</span>
              <span />
            </div>
            <div className="space-y-2">
              {form.criteria.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 sm:grid sm:grid-cols-[1fr_5rem_5.5rem_4.5rem_2rem] sm:items-center sm:gap-2"
                >
                  {row.skillId === "PROJECT_SCORE" ? (
                    <span className="min-w-0 flex-1 px-2 text-[13px] font-medium text-foreground">
                      Verified project score
                    </span>
                  ) : numericSkills.length ? (
                    <Select value={row.skillId} onValueChange={(v) => updateRow(i, { skillId: v })}>
                      <SelectTrigger className="h-8 w-full flex-1 text-[13px]">
                        <SelectValue placeholder="Select skill" />
                      </SelectTrigger>
                      <SelectContent>
                        {numericSkills.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="min-w-0 flex-1 px-2 text-[13px] text-muted-foreground">No active numeric skills</span>
                  )}
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={row.minCutoff}
                    onChange={(e) => updateRow(i, { minCutoff: Number(e.target.value) })}
                    className="h-8 w-20 text-[13px]"
                    aria-label="Minimum cutoff"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={row.weightage}
                    onChange={(e) => updateRow(i, { weightage: Number(e.target.value) })}
                    className="h-8 w-[5.5rem] text-[13px]"
                    aria-label="Weightage percentage"
                  />
                  <div className="flex justify-center">
                    <Switch
                      checked={row.mandatory}
                      onCheckedChange={(c) => updateRow(i, { mandatory: c })}
                      aria-label="Mandatory criterion"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-danger"
                    onClick={() => removeRow(i)}
                    aria-label="Remove criterion"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium ${
                totalWeight === 100 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
              }`}
            >
              {totalWeight === 100 ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              Total weightage: {totalWeight}%{totalWeight !== 100 ? " — should add up to 100% for accurate matching." : " — balanced."}
            </div>
          </>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
          No criteria yet — add a skill or project-score requirement to drive eligibility matching.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Requirements"
        subtitle="Configure the eligibility profiles used by trainers for matching and shortlisting."
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={openAdd}>
            <Plus className="size-4" /> Add company
          </Button>
        }
      />

      {companies.length === 0 ? (
        <Card className="border-border bg-card p-0 shadow-none">
          <EmptyState
            icon={Building2}
            title="No companies registered"
            description="Add a company with its eligibility criteria to power the Company Matching module."
            action={
              <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={openAdd}>
                <Plus className="size-3.5" /> Add company
              </Button>
            }
          />
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {companies.map((c) => (
            <Card key={c.id} className="flex flex-col gap-0 border-border bg-card p-0 shadow-none pp-rise">
              <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-foreground">{c.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{c.role}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {c.industry || "—"}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    Min CGPA <span className="tabular font-bold text-foreground">{c.minCgpa.toFixed(1)}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3 text-xs">
                <span className="text-muted-foreground">Eligible batches:</span>
                {c.eligibleBatches?.length ? c.eligibleBatches.map(batch => (
                  <span key={batch.id} className="max-w-full break-words rounded-full bg-primary-soft px-2 py-0.5 text-primary">{batch.name}</span>
                )) : <span className="text-warning">Configuration required - edit to select batches</span>}
              </div>
              <div className="flex-1 overflow-x-auto px-5 py-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Skill</th>
                      <th className="px-2 py-2 font-medium">Cutoff</th>
                      <th className="px-2 py-2 font-medium">Weightage</th>
                      <th className="py-2 pl-2 text-right font-medium">Mandatory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.criteria.length ? (
                      c.criteria.map((cr, i) => (
                        <tr key={`${cr.skillId}-${i}`} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-2 text-[13px] font-medium text-foreground">{skillName(cr.skillId)}</td>
                          <td className="tabular px-2 py-2 text-[13px] text-muted-foreground">{cr.minCutoff}%</td>
                          <td className="tabular px-2 py-2 text-[13px] text-muted-foreground">
                            {Math.round(cr.weightage * 100)}%
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {cr.mandatory ? (
                              <span className="inline-flex rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                                Mandatory
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Optional
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-[13px] text-muted-foreground">
                          No criteria configured.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-3">
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[13px] text-primary" onClick={() => openEdit(c)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-[13px] text-danger hover:text-danger"
                  onClick={() => setDeleting(c)}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <p className="text-[13px] text-muted-foreground">
        Companies with criteria drive the Company Matching module for trainers.
      </p>

      {/* add / edit company dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit company" : "Add company"}</DialogTitle>
            <DialogDescription>
              Define the eligibility profile trainers use for matching and shortlisting students.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Zeta Systems"
                />
                {errors.name ? <p className="text-xs text-danger">{errors.name}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-role">Role</Label>
                <Input
                  id="company-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="e.g. Software Engineer"
                />
                {errors.role ? <p className="text-xs text-danger">{errors.role}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-industry">Industry</Label>
                <Input
                  id="company-industry"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. IT Services"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-cgpa">Minimum CGPA</Label>
                <Input
                  id="company-cgpa"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={form.minCgpa}
                  onChange={(e) => setForm((f) => ({ ...f, minCgpa: Number(e.target.value) }))}
                />
              </div>
            </div>
            <fieldset className="grid gap-2" disabled={saving || batchesLoading}>
              <legend className="mb-2 text-sm font-medium">Eligible batches <span className="text-danger">*</span></legend>
              <Input aria-label="Search eligible batches" placeholder="Search batches..." value={batchSearch} onChange={e => setBatchSearch(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {form.eligibleBatchIds.map(id => (
                  <Button key={id} variant="outline" size="sm" className="h-auto max-w-full whitespace-normal text-left text-xs" aria-label={`Remove ${batches.find(b => b.id === id)?.name ?? 'unavailable batch'}`} onClick={() => setForm(f => ({ ...f, eligibleBatchIds: f.eligibleBatchIds.filter(value => value !== id) }))}>
                    {batches.find(b => b.id === id)?.name ?? "Unavailable batch"} <X className="size-3 shrink-0" aria-hidden />
                  </Button>
                ))}
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                {batchesLoading ? <p className="text-sm text-muted-foreground">Loading batches...</p> : batchError ? <p role="alert" className="text-sm text-danger">{batchError} Close and reopen this form to retry.</p> : !batches.length ? <p className="text-sm text-muted-foreground">No batches yet. Create an academic batch in Batch Management first.</p> : !batches.some(b => b.name.toLowerCase().includes(batchSearch.toLowerCase())) ? <p className="text-sm text-muted-foreground">No batches match your search.</p> : batches.filter(b => b.name.toLowerCase().includes(batchSearch.toLowerCase())).map(batch => (
                  <label key={batch.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.eligibleBatchIds.includes(batch.id)} onCheckedChange={checked => setForm(f => ({ ...f, eligibleBatchIds: checked === true ? [...new Set([...f.eligibleBatchIds, batch.id])] : f.eligibleBatchIds.filter(id => id !== batch.id) }))} />
                    <span className="break-words">{batch.name}{batch.status === "archived" ? " (archived)" : ""}</span>
                  </label>
                ))}
              </div>
              {errors.batches && <p role="alert" className="text-xs text-danger">{errors.batches}</p>}
            </fieldset>
            {criteriaEditor}
            {errors.criteria && <p role="alert" className="text-xs text-danger">{errors.criteria}</p>}
            {errors.save && <p role="alert" className="text-sm text-danger">{errors.save}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9" disabled={saving} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" disabled={saving || batchesLoading || !!batchError} onClick={() => void saveCompany()}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && !saving && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this company?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.name} — ${deleting.role} and its eligibility criteria will be removed. ` : ""}
              Trainers will no longer be able to match students against this profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger" disabled={saving} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>
              Delete company
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
