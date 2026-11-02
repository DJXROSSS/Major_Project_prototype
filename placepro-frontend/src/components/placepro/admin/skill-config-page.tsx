"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { SKILL_DOMAINS } from "@/types";
import type { ParameterType, Skill } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { SearchInput, FilterSelect } from "@/components/placepro/shared/controls";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
/* Skills & Parameters configuration                                   */
/* ------------------------------------------------------------------ */

interface SkillForm {
  name: string;
  domain: string;
  description: string;
  parameterType: ParameterType;
  active: boolean;
}

const EMPTY_FORM: SkillForm = {
  name: "",
  domain: SKILL_DOMAINS[0],
  description: "",
  parameterType: "numeric",
  active: true,
};

export default function SkillConfigPage() {
  const skills = useAppStore((s) => s.skills);
  const addSkill = useAppStore((s) => s.addSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);
  const deleteSkill = useAppStore((s) => s.deleteSkill);
  const { toast } = useToast();

  /* filters */
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  /* dialogs */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
      if (domainFilter !== "all" && s.domain !== domainFilter) return false;
      if (statusFilter !== "all" && (s.active ? "active" : "inactive") !== statusFilter) return false;
      return true;
    });
  }, [skills, search, domainFilter, statusFilter]);

  const hasFilters = search !== "" || domainFilter !== "all" || statusFilter !== "all";

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(s: Skill) {
    setEditing(s);
    setForm({
      name: s.name,
      domain: s.domain,
      description: s.description,
      parameterType: s.parameterType,
      active: s.active,
    });
    setError(null);
    setDialogOpen(true);
  }

  function saveSkill() {
    if (!form.name.trim()) {
      setError("Skill name is required.");
      return;
    }
    if (editing) {
      updateSkill(editing.id, {
        name: form.name.trim(),
        domain: form.domain,
        description: form.description.trim(),
        parameterType: form.parameterType,
        active: form.active,
      });
      toast({ title: "Parameter updated", description: `"${form.name.trim()}" was saved. New imports pick up the change automatically.` });
    } else {
      addSkill({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        domain: form.domain,
        description: form.description.trim(),
        parameterType: form.parameterType,
        active: form.active,
      });
      toast({ title: "Parameter added", description: `"${form.name.trim()}" now appears in imports and profiles automatically.` });
    }
    setDialogOpen(false);
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteSkill(deleting.id);
    toast({
      title: "Parameter deleted",
      description: `"${deleting.name}" was removed. Historical assessment records are preserved.`,
    });
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills & Parameters"
        subtitle="Evaluation parameters are configurable — new skills appear in imports and profiles automatically. Historical records remain intact."
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={openAdd}>
            <Plus className="size-4" /> Add parameter
          </Button>
        }
      />

      {/* filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search parameters…"
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <FilterSelect
            value={domainFilter}
            onChange={setDomainFilter}
            ariaLabel="Filter by domain"
            options={SKILL_DOMAINS.map((d) => ({ label: d, value: d }))}
            className="w-full sm:w-52"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            options={[
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            className="w-full sm:w-32"
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2.5 text-[13px] text-muted-foreground"
              onClick={() => {
                setSearch("");
                setDomainFilter("all");
                setStatusFilter("all");
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          ) : null}
        </div>
      </div>

      {/* table */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No parameters found"
            description={
              hasFilters
                ? "No evaluation parameters match the current filters."
                : "Add your first evaluation parameter to start scoring students."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[13px]"
                  onClick={() => {
                    setSearch("");
                    setDomainFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  <RotateCcw className="size-3.5" /> Reset filters
                </Button>
              ) : (
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={openAdd}>
                  <Plus className="size-3.5" /> Add parameter
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-2 font-medium">Parameter</th>
                  <th className="px-2 py-2.5 font-medium">Domain</th>
                  <th className="px-2 py-2.5 font-medium">Type</th>
                  <th className="px-2 py-2.5 font-medium">Status</th>
                  <th className="py-2.5 pl-2 pr-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                    <td className="max-w-[280px] py-3 pl-5 pr-2">
                      <p className="truncate font-medium text-foreground">{s.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" title={s.description}>
                        {s.description}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                        {s.domain}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-[13px] text-muted-foreground">
                      {s.parameterType === "numeric" ? "Numeric" : "Text"}
                    </td>
                    <td className="px-2 py-3">
                      <Switch
                        checked={s.active}
                        onCheckedChange={(c) => {
                          updateSkill(s.id, { active: c });
                          toast({
                            title: c ? "Parameter activated" : "Parameter deactivated",
                            description: `"${s.name}" is now ${c ? "included in new imports and profiles" : "hidden from new imports"}.`,
                          });
                        }}
                        aria-label={`Toggle ${s.name}`}
                      />
                    </td>
                    <td className="py-3 pl-2 pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] text-primary" onClick={() => openEdit(s)}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[13px] text-danger hover:text-danger"
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* add / edit parameter dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit parameter" : "Add parameter"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes apply to future imports and profiles — historical records stay intact."
                : "New parameters become available in result imports and student profiles automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="skill-name">Skill name</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cloud Fundamentals"
              />
              {error ? <p className="text-xs text-danger">{error}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Domain</Label>
                <Select value={form.domain} onValueChange={(v) => setForm((f) => ({ ...f, domain: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_DOMAINS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Parameter type</Label>
                <Select
                  value={form.parameterType}
                  onValueChange={(v) => setForm((f) => ({ ...f, parameterType: v as ParameterType }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">Numeric</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="skill-desc">Description</Label>
              <Textarea
                id="skill-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this parameter measures…"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="skill-active" className="text-[13px]">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive parameters are hidden from new imports.</p>
              </div>
              <Switch
                id="skill-active"
                checked={form.active}
                onCheckedChange={(c) => setForm((f) => ({ ...f, active: c }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={saveSkill}>
              {editing ? "Save changes" : "Add parameter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this parameter?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.name}" will be removed from configuration. ` : ""}
              Historical assessment records that used this parameter are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger" onClick={confirmDelete}>
              Delete parameter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
