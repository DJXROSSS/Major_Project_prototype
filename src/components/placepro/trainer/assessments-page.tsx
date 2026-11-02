"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Eye,
  FileCode2,
  FileSpreadsheet,
  MessagesSquare,
  RotateCcw,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { BATCHES, STUDENT_BY_ID } from "@/lib/placepro/mock-data";
import type { Assessment } from "@/types";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { MiniBar, ScorePill, StatusBadge } from "@/components/placepro/shared/badges";
import { FilterSelect, SearchInput } from "@/components/placepro/shared/controls";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Assessments — listing, filtering and per-assessment drill-down       */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const TYPE_META: Record<Assessment["type"], { label: string; icon: LucideIcon }> = {
  exam: { label: "Exam", icon: FileCode2 },
  "mock-interview": { label: "Mock Interview", icon: MessagesSquare },
};

const PAGE_SIZE = 10;

export default function AssessmentsPage() {
  const { toast } = useToast();
  const assessments = useAppStore((s) => s.assessments);
  const importedSources = useAppStore((s) => s.importedSources);
  const navigate = useAppStore((s) => s.navigate);
  const markAssessmentReviewed = useAppStore((s) => s.markAssessmentReviewed);

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Assessment | null>(null);

  /* simulated fetch so the table skeleton is visible */
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 500);
    return () => window.clearTimeout(t);
  }, []);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(assessments.map((a) => a.date.slice(0, 7)))].sort().reverse();
    return keys.map((k) => ({
      value: k,
      label: `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`,
    }));
  }, [assessments]);

  const kpis = useMemo(() => {
    const exams = assessments.filter((a) => a.type === "exam").length;
    const mocks = assessments.filter((a) => a.type === "mock-interview").length;
    const students = new Set(assessments.flatMap((a) => a.results.map((r) => r.studentId)));
    return [
      { label: "Total assessments", value: assessments.length, icon: ClipboardList, hint: "Across all batches" },
      { label: "Exams", value: exams, icon: FileCode2, hint: "Contests and weekly tests" },
      { label: "Mock interviews", value: mocks, icon: MessagesSquare, hint: "Technical and HR rounds" },
      { label: "Students evaluated", value: students.size, icon: UsersRound, hint: "Unique across assessments" },
    ];
  }, [assessments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assessments.filter(
      (a) =>
        (!q || a.name.toLowerCase().includes(q)) &&
        (typeFilter === "all" || a.type === typeFilter) &&
        (batchFilter === "all" || a.batch === batchFilter) &&
        (monthFilter === "all" || a.date.slice(0, 7) === monthFilter),
    );
  }, [assessments, query, typeFilter, batchFilter, monthFilter]);

  const hasActiveFilters =
    query.trim() !== "" || typeFilter !== "all" || batchFilter !== "all" || monthFilter !== "all";

  /* every filter change returns to the first page */
  const onQueryChange = (v: string) => {
    setQuery(v);
    setPage(1);
  };
  const onTypeChange = (v: string) => {
    setTypeFilter(v);
    setPage(1);
  };
  const onBatchChange = (v: string) => {
    setBatchFilter(v);
    setPage(1);
  };
  const onMonthChange = (v: string) => {
    setMonthFilter(v);
    setPage(1);
  };

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setBatchFilter("all");
    setMonthFilter("all");
    setPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* keep the open dialog in sync with store updates (e.g. mark reviewed) */
  const current = useMemo(
    () => (selected ? assessments.find((a) => a.id === selected.id) ?? selected : null),
    [selected, assessments],
  );
  const source =
    current?.sourceId !== undefined
      ? importedSources.find((s) => s.id === current.sourceId)
      : undefined;

  const handleMarkReviewed = (a: Assessment) => {
    markAssessmentReviewed(a.id);
    toast({
      title: "Assessment reviewed",
      description: `“${a.name}” results are approved and now count towards student profiles.`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        subtitle="Exams, coding contests and mock interviews conducted across batches."
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={() => navigate("import")}>
            <FileSpreadsheet className="size-4" /> Import results
          </Button>
        }
      />

      {/* ------------------------------ KPI strip ------------------------------ */}
      <section aria-label="Assessment metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="rounded-xl border-border bg-card p-4 shadow-none">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              </div>
              <p className="tabular mt-2 text-2xl font-semibold text-foreground">{k.value}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{k.hint}</p>
            </Card>
          );
        })}
      </section>

      {/* ------------------------------ filters ------------------------------ */}
      <Card className="rounded-xl border-border bg-card p-4 shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={onQueryChange}
            placeholder="Search by assessment name…"
            className="lg:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect
              ariaLabel="Filter by type"
              value={typeFilter}
              onChange={onTypeChange}
              options={[
                { label: "Exam", value: "exam" },
                { label: "Mock Interview", value: "mock-interview" },
              ]}
              allLabel="All types"
              className="sm:w-40"
            />
            <FilterSelect
              ariaLabel="Filter by batch"
              value={batchFilter}
              onChange={onBatchChange}
              options={BATCHES.map((b) => ({ label: b.name, value: b.name }))}
              allLabel="All batches"
              className="sm:w-44"
            />
            <FilterSelect
              ariaLabel="Filter by month"
              value={monthFilter}
              onChange={onMonthChange}
              options={monthOptions}
              allLabel="All months"
              className="sm:w-36"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-[13px] text-muted-foreground" onClick={resetFilters}>
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ------------------------------ table ------------------------------ */}
      <Card className="overflow-hidden rounded-xl border-border bg-card p-0 shadow-none">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading
            title="All assessments"
            description={loading ? "Loading records…" : `${filtered.length} assessment${filtered.length === 1 ? "" : "s"} matching the current view`}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasActiveFilters ? "No assessments match your filters" : "No assessments yet"}
            description={
              hasActiveFilters
                ? "Try adjusting the search terms or clearing the filters."
                : "Import a spreadsheet of results to create the first assessment record."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
                  <RotateCcw className="size-3.5" /> Reset filters
                </Button>
              ) : (
                <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={() => navigate("import")}>
                  <FileSpreadsheet className="size-4" /> Import results
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">Assessment name</th>
                    <th className="px-2 py-2.5 font-medium">Type</th>
                    <th className="px-2 py-2.5 font-medium">Batch</th>
                    <th className="px-2 py-2.5 font-medium">Date</th>
                    <th className="px-2 py-2.5 font-medium">Students evaluated</th>
                    <th className="px-2 py-2.5 font-medium">Average score</th>
                    <th className="px-2 py-2.5 font-medium">Uploaded by</th>
                    <th className="px-2 py-2.5 font-medium">Status</th>
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const Icon = TYPE_META[a.type].icon;
                    const avg =
                      a.results.length > 0
                        ? a.results.reduce((sum, r) => sum + r.percentage, 0) / a.results.length
                        : 0;
                    return (
                      <tr key={a.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                        <td className="py-2.5 pl-5 pr-2">
                          <span className="flex items-center gap-2.5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Icon className="size-3.5" aria-hidden />
                            </span>
                            <span className="font-semibold text-foreground">{a.name}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusBadge tone={a.type === "exam" ? "info" : "warning"}>
                            {TYPE_META[a.type].label}
                          </StatusBadge>
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-foreground">{a.batch}</td>
                        <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{formatDate(a.date)}</td>
                        <td className="tabular px-2 py-2.5 text-[13px] text-foreground">{a.results.length}</td>
                        <td className="px-2 py-2.5">
                          <MiniBar value={avg} width={52} />
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{a.uploadedBy}</td>
                        <td className="px-2 py-2.5">
                          {a.reviewed ? (
                            <StatusBadge tone="success">Reviewed</StatusBadge>
                          ) : (
                            <StatusBadge tone="warning">Needs review</StatusBadge>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 pr-5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-[13px] text-primary"
                              onClick={() => setSelected(a)}
                            >
                              <Eye className="size-3.5" /> View details
                            </Button>
                            {!a.reviewed && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-[13px]"
                                onClick={() => handleMarkReviewed(a)}
                              >
                                Mark reviewed
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={safePage}
              pageCount={pageCount}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* --------------------------- details dialog --------------------------- */}
      {current && (
        <Dialog open onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border/70 px-5 py-4">
              <DialogTitle className="flex items-center gap-2.5 text-base">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {(() => {
                    const TypeIcon = TYPE_META[current.type].icon;
                    return <TypeIcon className="size-3.5" aria-hidden />;
                  })()}
                </span>
                <span className="min-w-0 truncate">{current.name}</span>
              </DialogTitle>
              <DialogDescription className="mt-1">
                {current.results.length} student result{current.results.length === 1 ? "" : "s"} · sorted by score
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border/70 px-5 py-3.5 sm:grid-cols-4">
              {[
                { label: "Type", value: TYPE_META[current.type].label },
                { label: "Batch", value: current.batch },
                { label: "Date", value: formatDate(current.date) },
                { label: "Uploaded by", value: current.uploadedBy },
              ].map((m) => (
                <div key={m.label} className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto pp-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">Student</th>
                    <th className="px-2 py-2.5 font-medium">Roll number</th>
                    <th className="px-2 py-2.5 font-medium">Marks</th>
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[...current.results]
                    .sort((a, b) => b.percentage - a.percentage)
                    .map((r) => {
                      const student = STUDENT_BY_ID[r.studentId];
                      return (
                        <tr key={r.studentId} className="border-b border-border/50 last:border-0 hover:bg-muted/60">
                          <td className="py-2.5 pl-5 pr-2">
                            <span className="flex items-center gap-2.5">
                              <UserAvatar name={student?.name ?? r.studentId} size="sm" />
                              <span className="font-medium text-foreground">{student?.name ?? r.studentId}</span>
                            </span>
                          </td>
                          <td className="tabular px-2 py-2.5 text-[13px] text-muted-foreground">
                            {student?.rollNumber ?? "—"}
                          </td>
                          <td className="tabular px-2 py-2.5 text-[13px] text-foreground">
                            {r.marks}/{r.maxMarks}
                          </td>
                          <td className="py-2.5 pl-2 pr-5 text-right">
                            <ScorePill value={r.percentage} suffix="%" />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {current.sourceId && (
              <div className="flex items-start gap-2.5 border-t border-border/70 border-l-2 border-l-warning bg-warning-soft/40 px-5 py-3">
                <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <p className="text-[13px] leading-relaxed text-foreground">
                  Imported from spreadsheet — original preserved
                  {source ? (
                    <span className="text-muted-foreground"> ({source.fileName}, {source.rowCount} rows)</span>
                  ) : null}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
