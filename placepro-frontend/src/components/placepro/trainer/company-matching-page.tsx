"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Download,
  Info,
  ListChecks,
  RotateCcw,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { api } from "@/lib/placepro/api";
import { skillName } from "@/lib/placepro/skill-taxonomy";
import type { Company, MatchResult, Skill, Student } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { MiniBar, PRBadge, ScorePill, StatusBadge } from "@/components/placepro/shared/badges";
import { FilterSelect, SearchInput } from "@/components/placepro/shared/controls";
import { ChartCard, EmptyState } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Company Matching & Shortlisting — Trainer portal                    */
/*                                                                     */
/* Domain rule: eligibility and compatibility are independent.         */
/*   Eligibility    = CGPA >= minCgpa AND every mandatory cutoff met   */
/*   Compatibility  = Σ(skillScore × weightage) / Σ(weightage), 0-100  */
/* A high compatibility never implies eligibility.                     */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

type CriterionDraft = {
  skillId: string;
  minCutoff: number;
  weightage: number; // 0 - 0.95
  mandatory: boolean;
};

type CriteriaState = {
  minCgpa: number;
  criteria: CriterionDraft[];
};

type SortKey = "compat" | "average" | "cgpa" | "name";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "compat", label: "Compatibility high → low" },
  { value: "average", label: "Average high → low" },
  { value: "cgpa", label: "CGPA high → low" },
  { value: "name", label: "Name A → Z" },
];

function fromCompany(company: Company): CriteriaState {
  return {
    minCgpa: company.minCgpa,
    criteria: company.criteria.map((c) => ({
      skillId: c.type === "PROJECT_SCORE" ? "PROJECT_SCORE" : c.skillId,
      minCutoff: c.minCutoff,
      weightage: c.weightage,
      mandatory: c.mandatory,
    })),
  };
}

function cloneState(state: CriteriaState): CriteriaState {
  return { minCgpa: state.minCgpa, criteria: state.criteria.map((c) => ({ ...c })) };
}

function criterionName(skills: Skill[], skillId: string) {
  return skillId === "PROJECT_SCORE" ? "Verified project score" : skillName(skills, skillId);
}

function criterionScore(student: Student, skillId: string) {
  return skillId === "PROJECT_SCORE" ? student.projectScore ?? 0 : student.scores[skillId] ?? 0;
}

export default function CompanyMatchingPage() {
  const { toast } = useToast();
  const companies = useAppStore((s) => s.companies);
  const skills = useAppStore((s) => s.skills);

  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId) ?? companies[0];

  const [draft, setDraft] = useState<CriteriaState>(() =>
    company ? fromCompany(company) : { minCgpa: 7, criteria: [] },
  );
  const [applied, setApplied] = useState<CriteriaState>(() =>
    company ? fromCompany(company) : { minCgpa: 7, criteria: [] },
  );

  const requestSequence = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [matchingVersion, setMatchingVersion] = useState<string | null>(null);
  const [matchedCompany, setMatchedCompany] = useState<Company | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"eligible" | "ineligible" | "all">("eligible");
  const [search, setSearch] = useState("");
  const [prFilter, setPrFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("compat");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchMatches = useCallback(async (cid: string, override?: CriteriaState) => {
    if (!cid) return false;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelected(new Set());
    setMatchedCompany(null);
    setMatchingVersion(null);
    try {
      const saved = await api.company(cid);
      if (requestId !== requestSequence.current) return false;
      const state = override ?? fromCompany(saved);
      if (!override) { setDraft(cloneState(state)); setApplied(cloneState(state)); }
      const res = await api.companyMatches(cid, { criteriaOverride: state, page: 1, pageSize: 1000 });
      const items = [...res.items];
      for (let nextPage = 2; items.length < res.total; nextPage++) {
        if (requestId !== requestSequence.current) return false;
        const next = await api.companyMatches(cid, { criteriaOverride: state, page: nextPage, pageSize: res.pageSize });
        if (next.matchingVersion !== res.matchingVersion) throw new Error("Company requirements changed. Please retry matching.");
        if (!next.items.length) break;
        items.push(...next.items);
      }
      if (requestId !== requestSequence.current) return false;
      setResults(items);
      setMatchedCompany(res.company);
      setMatchingVersion(res.matchingVersion);
      return true;
    } catch (err) {
      if (requestId === requestSequence.current) setError(err instanceof Error ? err.message : "Failed to load matches");
      return false;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sequence = requestSequence;
    if (company?.id) void fetchMatches(company.id);
    return () => { sequence.current++; };
  }, [company, fetchMatches]);

  const handleSelectCompany = (id: string) => {
    if (id === company?.id) return;
    requestSequence.current++;
    setResults([]);
    setSelected(new Set());
    setMatchedCompany(null);
    setMatchingVersion(null);
    setLoading(true);
    setCompanyId(id);
    setPage(1);
  };

  /* --------------------------- evaluation ----------------------------- */

  const eligibleResults = useMemo(
    () =>
      results
        .filter((r) => r.eligible)
        .sort(
          (a, b) =>
            b.compatibility - a.compatibility ||
            a.student.name.localeCompare(b.student.name),
        ),
    [results],
  );

  const rankById = useMemo(
    () => new Map(eligibleResults.map((r, i) => [r.student.id, i + 1])),
    [eligibleResults],
  );

  const ineligibleCount = results.length - eligibleResults.length;

  /* ----------------------------- filters ------------------------------ */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byView =
      view === "eligible"
        ? results.filter((r) => r.eligible)
        : view === "ineligible"
          ? results.filter((r) => !r.eligible)
          : results;

    const byPr = byView.filter((r) =>
      prFilter === "all" ? true : r.student.prStatus === prFilter,
    );

    const bySearch = byPr.filter(
      (r) =>
        q === "" ||
        r.student.name.toLowerCase().includes(q) ||
        r.student.rollNumber.toLowerCase().includes(q),
    );

    const sorted = [...bySearch];
    switch (sortBy) {
      case "average":
        sorted.sort(
          (a, b) =>
            b.student.average - a.student.average ||
            a.student.name.localeCompare(b.student.name),
        );
        break;
      case "cgpa":
        sorted.sort(
          (a, b) =>
            b.student.cgpa - a.student.cgpa ||
            a.student.name.localeCompare(b.student.name),
        );
        break;
      case "name":
        sorted.sort((a, b) => a.student.name.localeCompare(b.student.name));
        break;
      default:
        sorted.sort(
          (a, b) =>
            b.compatibility - a.compatibility ||
            a.student.name.localeCompare(b.student.name),
        );
    }
    return sorted;
  }, [results, view, prFilter, search, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* filter changes flow through these handlers, so the page resets there */
  const changeView = (v: string) => {
    setView(v as typeof view);
    setPage(1);
  };
  const changeSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const changePrFilter = (v: string) => {
    setPrFilter(v);
    setPage(1);
  };
  const changeSort = (v: string) => {
    setSortBy(v as SortKey);
    setPage(1);
  };

  /* --------------------------- criteria edits -------------------------- */

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const totalWeightPct = Math.round(
    draft.criteria.reduce((a, c) => a + c.weightage, 0) * 100,
  );

  const updateCriterion = (index: number, patch: Partial<CriterionDraft>) =>
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const applyCriteria = async () => {
    if (!company || loading) return;
    setApplied(cloneState(draft));
    setPage(1);
    if (await fetchMatches(company.id, draft)) toast({ title: "Criteria applied", description: "Evaluated only students in the company's saved eligible batches." });
  };

  const resetCriteria = async () => {
    if (!company || loading) return;
    setPage(1);
    if (await fetchMatches(company.id)) toast({ title: "Criteria reset to saved", description: "Restored saved requirements and eligible batches." });
  };

  /* ----------------------------- selection ----------------------------- */

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const pageSelectableIds = pageRows.filter((r) => r.eligible).map((r) => r.student.id);
  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id));
  const somePageSelected = pageSelectableIds.some((id) => selected.has(id));

  const togglePageSelection = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageSelectableIds.forEach((id) => next.delete(id));
      else pageSelectableIds.forEach((id) => next.add(id));
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  /* ------------------------------- export ------------------------------ */

  const exportShortlist = async () => {
    if (!company || loading || error || exporting || !matchingVersion || matchedCompany?.id !== company.id) return;
    if (selected.size === 0) {
      toast({ title: "Select students first", description: "Select at least one eligible student to export a shortlist." });
      return;
    }
    const requestId = requestSequence.current;
    setExporting(true);
    try {
      const result = await api.exportCompanyShortlist(company.id, {
        selectedStudentIds: [...selected], criteriaOverride: applied, matchingVersion,
      });
      if (requestId !== requestSequence.current) return;
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Shortlist exported", description: `${result.rowCount} selected students exported for ${company.name}.` });
    } catch (error) {
      if (requestId === requestSequence.current) toast({ title: "Unable to export shortlist", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setExporting(false); }
  };

  /* ------------------------------- render ------------------------------ */

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Company Matching"
          subtitle="Evaluate batch eligibility against company requirement profiles and build ranked shortlists."
        />
        <Card className="border-border p-0 shadow-none">
          <EmptyState
            icon={ListChecks}
            title="No company profiles available"
            description="Ask the administrator to configure company requirement profiles before running a match."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Matching"
        subtitle="Evaluate batch eligibility against company requirement profiles and build ranked shortlists."
      />

      {/* ------------------------- company selector ------------------------- */}
      <section aria-label="Company profiles" className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {companies.map((c) => {
            const isSelected = c.id === company.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCompany(c.id)}
                aria-pressed={isSelected}
                className={cn(
                  "relative rounded-xl border p-4 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary-soft/40"
                    : "border-border bg-card hover:border-primary/50 hover:bg-muted/50",
                )}
              >
                {isSelected ? (
                  <span
                    className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    aria-label="Selected company"
                  >
                    <Check className="size-3" />
                  </span>
                ) : null}
                <p className="pr-6 text-sm font-semibold text-foreground">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.role}</p>
                <span className="mt-2.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {c.industry}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Company profiles configured by the administrator.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
        <span className="font-medium">Eligible batches:</span>
        {loading ? <span className="text-muted-foreground">Loading company requirements...</span> : error ? <span className="text-danger">Unable to load current requirements.</span> : matchedCompany?.eligibleBatches?.length ? matchedCompany.eligibleBatches.map(batch => (
          <span key={batch.id} className="max-w-full break-words rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{batch.name}</span>
        )) : <span className="text-warning">Ask an administrator to configure eligible batches. No students will be evaluated.</span>}
      </div>

      {/* ------------------------- criteria panel ------------------------- */}
      <ChartCard
        title="Eligibility criteria"
        description={`${company.name} · ${company.role} · minimum CGPA and skill thresholds`}
      >
        <div className="space-y-4">
          {/* minimum CGPA */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium text-foreground">Minimum CGPA</span>
            <Input
              type="number"
              step={0.1}
              min={0}
              max={10}
              value={draft.minCgpa}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) {
                  setDraft((d) => ({ ...d, minCgpa: Math.min(10, Math.max(0, n)) }));
                }
              }}
              aria-label="Minimum CGPA"
              className="h-8 w-24 text-[13px] tabular"
            />
            <span className="text-xs text-muted-foreground">
              Candidates below this CGPA are ineligible regardless of skill scores.
            </span>
          </div>

          {/* criteria table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-2 font-medium">Skill</th>
                  <th className="px-2 py-2.5 font-medium">Minimum cutoff</th>
                  <th className="px-2 py-2.5 font-medium">Weightage</th>
                  <th className="py-2.5 pl-2 pr-5 text-right font-medium">Mandatory</th>
                </tr>
              </thead>
              <tbody>
                {draft.criteria.map((c, i) => {
                  const sName = criterionName(skills, c.skillId);
                  return (
                    <tr key={c.skillId} className="border-b border-border/50 last:border-0">
                      <td className="relative py-2.5 pl-5 pr-2">
                        <span
                          className={cn(
                            "absolute left-0 top-0 h-full w-[3px]",
                            c.mandatory ? "bg-warning" : "bg-transparent",
                          )}
                          aria-hidden
                        />
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">
                            {sName}
                          </span>
                          {c.mandatory ? (
                            <StatusBadge tone="warning" className="px-1.5 py-0 text-[10px]">
                              Mandatory
                            </StatusBadge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <Input
                          type="number"
                          step={1}
                          min={0}
                          max={100}
                          value={c.minCutoff}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isNaN(n)) {
                              updateCriterion(i, {
                                minCutoff: Math.min(100, Math.max(0, n)),
                              });
                            }
                          }}
                          aria-label={`${sName} minimum cutoff`}
                          className="h-8 w-20 text-[13px] tabular"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step={5}
                            min={0}
                            max={95}
                            value={Math.round(c.weightage * 100)}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isNaN(n)) {
                                updateCriterion(i, {
                                  weightage: Math.min(0.95, Math.max(0, n)) / 100,
                                });
                              }
                            }}
                            aria-label={`${sName} weightage percent`}
                            className="h-8 w-20 text-[13px] tabular"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 pr-5 text-right">
                        <Switch
                          checked={c.mandatory}
                          onCheckedChange={(on) => updateCriterion(i, { mandatory: on })}
                          aria-label={`${sName} mandatory toggle`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* weightage normalisation warning */}
          {totalWeightPct !== 100 ? (
            <p className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              Weightages total {totalWeightPct}% — compatibility is normalised.
            </p>
          ) : null}

          {/* actions + explainer */}
          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" aria-hidden />
              Mandatory cutoffs decide eligibility. Weightages only decide ranking.
              {dirty ? (
                <span className="ml-1 font-medium text-warning">
                  · unsaved changes
                </span>
              ) : null}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[13px]"
                disabled={loading} onClick={() => void resetCriteria()}
              >
                <RotateCcw className="size-3.5" /> Reset to saved
              </Button>
              <Button
                size="sm"
                className="h-9 bg-primary text-[13px] hover:bg-primary-hover"
                disabled={loading} onClick={() => void applyCriteria()}
              >
                Apply criteria
              </Button>
            </div>
          </div>
        </div>
      </ChartCard>

      {/* --------------------------- results ---------------------------- */}
      <section aria-label="Matching results" className="space-y-4">
        {/* summary strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-border p-0 shadow-none">
            <div className="flex items-center gap-4 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Eligible candidates</p>
                <p className="tabular text-2xl font-semibold leading-tight text-success">
                  {eligibleResults.length}
                </p>
              </div>
              <p className="ml-auto hidden text-right text-[11px] leading-snug text-muted-foreground md:block">
                Meet every mandatory
                <br />
                cutoff and CGPA
              </p>
            </div>
          </Card>
          <Card className="border-border p-0 shadow-none">
            <div className="flex items-center gap-4 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                <XCircle className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Ineligible candidates</p>
                <p className="tabular text-2xl font-semibold leading-tight text-danger">
                  {ineligibleCount}
                </p>
              </div>
              <p className="ml-auto hidden text-right text-[11px] leading-snug text-muted-foreground md:block">
                Missing at least one
                <br />
                requirement
              </p>
            </div>
          </Card>
          <Card className="border-border p-0 shadow-none">
            <div className="flex items-center gap-4 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UsersRound className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Total evaluated</p>
                <p className="tabular text-2xl font-semibold leading-tight text-foreground">
                  {results.length}
                </p>
              </div>
              <p className="ml-auto hidden text-right text-[11px] leading-snug text-muted-foreground md:block">
                Students scored
                <br />
                against this profile
              </p>
            </div>
          </Card>
        </div>

        {/* results card */}
        <Card className="gap-0 overflow-hidden border-border p-0 shadow-none">
          {/* tabs + filters */}
          <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={view} onValueChange={changeView}>
              <TabsList className="h-9">
                <TabsTrigger value="eligible" className="text-[13px]">
                  Eligible ({eligibleResults.length})
                </TabsTrigger>
                <TabsTrigger value="ineligible" className="text-[13px]">
                  Ineligible ({ineligibleCount})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-[13px]">
                  All ({results.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={changeSearch}
                placeholder="Search name or roll…"
                className="sm:w-52"
              />
              <FilterSelect
                value={prFilter}
                onChange={changePrFilter}
                allLabel="PR / NPR"
                options={[
                  { value: "PR", label: "Placement Ready" },
                  { value: "NPR", label: "Not Ready" },
                ]}
                ariaLabel="Filter by readiness"
                className="sm:w-36"
              />
              <Select value={sortBy} onValueChange={changeSort}>
                <SelectTrigger aria-label="Sort candidates" className="h-9 w-full text-sm sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* selection bar */}
          {selected.size > 0 ? (
            <div className="flex flex-col gap-3 border-b border-border bg-primary-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] font-medium text-primary">
                {selected.size} {selected.size === 1 ? "candidate" : "candidates"} selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 bg-primary text-[13px] hover:bg-primary-hover"
                  disabled={exporting || loading || !matchingVersion} onClick={() => void exportShortlist()}
                >
                  <Download className="size-3.5" /> {exporting ? "Exporting..." : "Export shortlist"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[13px]"
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {/* table / loading / error / empty state */}
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Evaluating candidate pool against company cutoffs…
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-danger">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-[13px]"
                onClick={() => void fetchMatches(company.id, applied)}
              >
                Retry matching
              </Button>
            </div>
          ) : pageRows.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={!matchedCompany?.eligibleBatchIds?.length ? "Eligible batches need configuration" : results.length === 0 ? "No students in eligible batches" : "No candidates match these filters"}
              description={!matchedCompany?.eligibleBatchIds?.length ? "Ask an administrator to edit this company and select at least one eligible batch." : results.length === 0 ? "The selected batches do not contain any students yet." : "Try clearing the search, switching the readiness filter, or relaxing the eligibility criteria."}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[13px]"
                  onClick={() => {
                    setSearch("");
                    setPrFilter("all");
                    setView("all");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                className={cn(
                  "w-full text-sm",
                  view === "eligible" ? "min-w-[960px]" : "min-w-[1180px]",
                )}
              >
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    {view !== "ineligible" ? (
                      <th className="w-10 py-2.5 pl-4 pr-1">
                        <Checkbox
                          checked={
                            allPageSelected ? true : somePageSelected ? "indeterminate" : false
                          }
                          onCheckedChange={togglePageSelection}
                          aria-label="Select all eligible candidates on this page"
                        />
                      </th>
                    ) : null}
                    <th className="px-2 py-2.5 font-medium">Rank</th>
                    <th className="px-2 py-2.5 font-medium">Candidate</th>
                    <th className="px-2 py-2.5 font-medium">CGPA</th>
                    {applied.criteria.map((c) => (
                      <th key={c.skillId} className="px-2 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-1">
                          {criterionName(skills, c.skillId)}
                          {c.mandatory ? (
                            <span
                              className="inline-block size-1.5 rounded-full bg-warning"
                              title="Mandatory skill"
                              aria-label="Mandatory skill"
                            />
                          ) : null}
                        </span>
                      </th>
                    ))}
                    <th className="px-2 py-2.5 font-medium">Compatibility</th>
                    {view !== "eligible" ? (
                      <th className="px-2 py-2.5 font-medium">Missing requirements</th>
                    ) : null}
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const rank = rankById.get(r.student.id);
                    const cgpaFailed = r.student.cgpa < applied.minCgpa;
                    return (
                      <tr
                        key={r.student.id}
                        className={cn(
                          "border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60",
                          !r.eligible && "bg-danger-soft/20",
                        )}
                      >
                        {view !== "ineligible" ? (
                          <td className="py-2.5 pl-4 pr-1">
                            <Checkbox
                              checked={selected.has(r.student.id)}
                              disabled={!r.eligible}
                              onCheckedChange={(on) =>
                                toggleSelected(r.student.id, on === true)
                              }
                              aria-label={`Select ${r.student.name} for shortlist`}
                            />
                          </td>
                        ) : null}
                        <td className="tabular px-2 py-2.5 text-[13px] font-semibold text-foreground">
                          {rank !== undefined ? `#${rank}` : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <UserAvatar name={r.student.name} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-foreground">
                                {r.student.name}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {r.student.rollNumber} · {r.student.prStatus}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td
                          className={cn(
                            "tabular px-2 py-2.5 text-[13px]",
                            cgpaFailed
                              ? "font-semibold text-danger"
                              : "text-foreground",
                          )}
                        >
                          {r.student.cgpa.toFixed(1)}
                        </td>
                        {applied.criteria.map((c) => {
                          const score = criterionScore(r.student, c.skillId);
                          const below = score < c.minCutoff;
                          return (
                            <td key={c.skillId} className="px-2 py-2.5">
                              <span
                                className="inline-flex items-center gap-1"
                                title={below ? `Below cutoff of ${c.minCutoff}` : undefined}
                              >
                                <ScorePill value={score} />
                                {below ? (
                                  <span
                                    className="size-1.5 shrink-0 rounded-full bg-danger"
                                    aria-label="Below cutoff"
                                  />
                                ) : null}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center">
                            <MiniBar value={r.compatibility} width={60} />
                            <span className="text-[11px] font-medium text-muted-foreground">%</span>
                          </span>
                        </td>
                        {view !== "eligible" ? (
                          <td className="px-2 py-2.5">
                            {r.failedRequirements.length > 0 ? (
                              <span className="flex max-w-[240px] flex-wrap gap-1">
                                {r.failedRequirements.map((req) => (
                                  <span
                                    key={req}
                                    className="inline-flex rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger"
                                  >
                                    {req}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-[13px] text-muted-foreground">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="py-2.5 pl-2 pr-5 text-right">
                          <span className="flex items-center justify-end gap-1.5">
                            <PRBadge status={r.student.prStatus} />
                            {r.eligible ? (
                              <StatusBadge tone="success">Eligible</StatusBadge>
                            ) : (
                              <StatusBadge tone="danger">Ineligible</StatusBadge>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <TablePagination
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            onPageChange={setPage}
          />
        </Card>

        {/* footer note */}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Compatibility is a weighted average of skill scores against this profile.
          Eligibility requires every mandatory cutoff and the minimum CGPA.
        </p>
      </section>
    </div>
  );
}
