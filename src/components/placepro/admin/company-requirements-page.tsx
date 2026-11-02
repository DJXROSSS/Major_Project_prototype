"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import type { Company, CompanyCriterion } from "@/types";
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
  name: string;
  role: string;
  industry: string;
  minCgpa: number;
  criteria: CriterionRow[];
}

const EMPTY_FORM: CompanyForm = { name: "", role: "", industry: "", minCgpa: 6, criteria: [] };

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
  const [errors, setErrors] = useState<{ name?: string; role?: string }>({});
  const [deleting, setDeleting] = useState<Company | null>(null);

  const totalWeight = form.criteria.reduce((a, c) => a + (Number.isFinite(c.weightage) ? c.weightage : 0), 0);

  function skillName(skillId: string) {
    return skills.find((s) => s.id === skillId)?.name ?? "Unknown skill";
  }

  function toForm(c: Company): CompanyForm {
    return {
      name: c.name,
      role: c.role,
      industry: c.industry,
      minCgpa: c.minCgpa,
      criteria: c.criteria.map((cr) => ({
        skillId: cr.skillId,
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

  function saveCompany() {
    const next: { name?: string; role?: string } = {};
    if (!form.name.trim()) next.name = "Company name is required.";
    if (!form.role.trim()) next.role = "Role is required.";
    if (next.name || next.role) {
      setErrors(next);
      return;
    }
    const criteria: CompanyCriterion[] = form.criteria
      .filter((r) => r.skillId)
      .map((r) => ({
        skillId: r.skillId,
        minCutoff: Number.isFinite(r.minCutoff) ? r.minCutoff : 60,
        weightage: (Number.isFinite(r.weightage) ? r.weightage : 0) / 100,
        mandatory: r.mandatory,
      }));
    if (editing) {
      updateCompany(editing.id, {
        name: form.name.trim(),
        role: form.role.trim(),
        industry: form.industry.trim(),
        minCgpa: form.minCgpa,
        criteria,
      });
      toast({ title: "Company updated", description: `${form.name.trim()} — ${form.role.trim()} was saved.` });
    } else {
      addCompany({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        role: form.role.trim(),
        industry: form.industry.trim(),
        minCgpa: form.minCgpa,
        criteria,
      });
      toast({ title: "Company added", description: `${form.name.trim()} is now available in Company Matching.` });
    }
    setDialogOpen(false);
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteCompany(deleting.id);
    toast({ title: "Company deleted", description: `${deleting.name} was removed along with its eligibility profile.` });
    setDeleting(null);
  }

  /* criteria editor — shared by add & edit dialogs */
  const criteriaEditor = (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Eligibility criteria</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-[13px]"
          onClick={addRow}
          disabled={!numericSkills.length}
        >
          <Plus className="size-3.5" /> Add criterion
        </Button>
      </div>
      {numericSkills.length ? (
        form.criteria.length ? (
          <>
            <div className="hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_5.5rem_4.5rem_2rem] sm:gap-2 sm:px-1">
              <span>Skill</span>
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
            No criteria yet — add at least one criterion to drive eligibility matching.
          </p>
        )
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
          No active numeric parameters available. Create parameters first in Skills &amp; Parameters.
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            {criteriaEditor}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={saveCompany}>
              {editing ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
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
            <AlertDialogAction className="bg-danger hover:bg-danger" onClick={confirmDelete}>
              Delete company
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
