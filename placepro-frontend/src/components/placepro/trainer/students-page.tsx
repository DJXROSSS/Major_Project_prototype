"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, UsersRound } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import {
  DOMAIN_GROUPS,
  studentDomainScore,
} from "@/lib/placepro/mock-data";
import type { Student } from "@/types";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { MiniBar, PRBadge } from "@/components/placepro/shared/badges";
import { FilterSelect, SearchInput, type FilterOption } from "@/components/placepro/shared/controls";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Trainer — Student Management listing                                */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

const SECTION_OPTIONS: FilterOption[] = [
  { label: "Section A", value: "A" },
  { label: "Section B", value: "B" },
];
const PR_OPTIONS: FilterOption[] = [
  { label: "Placement ready (PR)", value: "PR" },
  { label: "Not ready (NPR)", value: "NPR" },
];
const DOMAIN_OPTIONS: FilterOption[] = DOMAIN_GROUPS.map((g) => ({ label: g.label, value: g.label }));
const SORT_OPTIONS: FilterOption[] = [
  { label: "Average · high to low", value: "avg-desc" },
  { label: "Average · low to high", value: "avg-asc" },
  { label: "CGPA · high to low", value: "cgpa-desc" },
  { label: "Name · A to Z", value: "name-asc" },
];

const DEFAULT_SORT = "avg-desc";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  batch: string;
  section: string;
  cgpa: number;
  dsa: number;
  coreCs: number;
  development: number;
  communication: number;
  average: number;
  prStatus: "PR" | "NPR";
}

function toRow(student: Student): StudentRow {
  const s = student.scores;
  const coreCs = (s.dbms + s.os + s.cn + s.oops) / 4;
  const development = (s.java + s.springboot) / 2;
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    rollNumber: student.rollNumber,
    batch: student.batch,
    section: student.section,
    cgpa: student.cgpa,
    dsa: s.dsa,
    coreCs,
    development,
    communication: s.comm,
    average: student.average,
    prStatus: student.prStatus,
  };
}

export default function StudentsPage() {
  const navigate = useAppStore((s) => s.navigate);
  const students = useAppStore((s) => s.students);
  const batches = useAppStore((s) => s.batches);
  const batchOptions = useMemo(() => batches.map((b) => ({ label: b.name, value: b.name })), [batches]);

  /* ------------------------------ filters ------------------------------ */
  const [query, setQuery] = useState("");
  const [batch, setBatch] = useState("all");
  const [section, setSection] = useState("all");
  const [pr, setPr] = useState("all");
  const [domain, setDomain] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);

  /* simulated first-mount fetch */
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const filtersActive =
    query.trim() !== "" || batch !== "all" || section !== "all" || pr !== "all" || domain !== "all";

  const resetFilters = () => {
    setQuery("");
    setBatch("all");
    setSection("all");
    setPr("all");
    setDomain("all");
    setSort(DEFAULT_SORT);
    setPage(1);
  };

  /* any filter interaction restarts pagination from the first page */
  const applyFilter =
    (setter: (v: string) => void) =>
    (v: string): void => {
      setter(v);
      setPage(1);
    };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = students;
    if (q) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q),
      );
    }
    if (batch !== "all") list = list.filter((s) => s.batch === batch);
    if (section !== "all") list = list.filter((s) => s.section === section);
    if (pr !== "all") list = list.filter((s) => s.prStatus === pr);
    if (domain !== "all") {
      list = list.filter((s) => studentDomainScore(s, domain) < 60);
    }
    const mapped = list.map(toRow);
    switch (sort) {
      case "avg-asc":
        return mapped.sort((a, b) => a.average - b.average);
      case "cgpa-desc":
        return mapped.sort((a, b) => b.cgpa - a.cgpa);
      case "name-asc":
        return mapped.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return mapped.sort((a, b) => b.average - a.average);
    }
  }, [students, query, batch, section, pr, domain, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle={`${students.length} enrolled students across ${batches.length} active batches.`}
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={() => navigate("import")}>
            <FileSpreadsheet className="size-4" /> Import results
          </Button>
        }
      />

      {/* ------------------------------ filter toolbar ------------------------------ */}
      <Card className="gap-0 border-border bg-card p-4 shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={applyFilter(setQuery)}
            placeholder="Search by name or roll number…"
            className="lg:max-w-xs"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-center">
            <FilterSelect
              value={batch}
              onChange={applyFilter(setBatch)}
              options={batchOptions}
              allLabel="All batches"
              ariaLabel="Filter by batch"
              className="xl:w-[168px]"
            />
            <FilterSelect
              value={section}
              onChange={applyFilter(setSection)}
              options={SECTION_OPTIONS}
              allLabel="All sections"
              ariaLabel="Filter by section"
              className="xl:w-[136px]"
            />
            <FilterSelect
              value={pr}
              onChange={applyFilter(setPr)}
              options={PR_OPTIONS}
              allLabel="All statuses"
              ariaLabel="Filter by placement status"
              className="xl:w-[164px]"
            />
            <FilterSelect
              value={domain}
              onChange={applyFilter(setDomain)}
              options={DOMAIN_OPTIONS}
              allLabel="All domains"
              ariaLabel="Filter by weak domain (score below 60%)"
              className="xl:w-[188px]"
            />
            <FilterSelect
              value={sort}
              onChange={applyFilter(setSort)}
              options={SORT_OPTIONS}
              allLabel="Sort"
              ariaLabel="Sort students"
              className="col-span-2 sm:col-span-1 xl:ml-auto xl:w-[188px]"
            />
          </div>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-3 text-[13px] text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          ) : null}
        </div>
      </Card>

      {/* ------------------------------ student table ------------------------------ */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading
            title="Student directory"
            description={
              rows.length === students.length
                ? `All ${rows.length} students`
                : `${rows.length} of ${students.length} students match the current filters`
            }
          />
        </div>

        {loading ? (
          <TableSkeleton rows={10} />
        ) : pageRows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No students found"
            description="No students match the current search and filter combination. Try adjusting or clearing the filters."
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">Student</th>
                    <th className="px-2 py-2.5 font-medium">Roll number</th>
                    <th className="px-2 py-2.5 font-medium">Batch</th>
                    <th className="px-2 py-2.5 font-medium">CGPA</th>
                    <th className="px-2 py-2.5 font-medium">DSA</th>
                    <th className="px-2 py-2.5 font-medium">Core CS</th>
                    <th className="px-2 py-2.5 font-medium">Development</th>
                    <th className="px-2 py-2.5 font-medium">Communication</th>
                    <th className="px-2 py-2.5 font-medium">Average score</th>
                    <th className="px-2 py-2.5 font-medium">Placement status</th>
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate("student-profile", { studentId: r.id })}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                    >
                      <td className="py-2.5 pl-5 pr-2">
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={r.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-foreground">{r.name}</span>
                            <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{r.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="tabular px-2 py-2.5 text-[13px] text-muted-foreground">{r.rollNumber}</td>
                      <td className="px-2 py-2.5 text-[13px] text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {r.batch.replace(" CSE", "")}
                          <span className="text-muted-foreground/70"> · {r.section}</span>
                        </span>
                      </td>
                      <td className="tabular px-2 py-2.5 text-[13px] font-medium text-foreground">{r.cgpa.toFixed(1)}</td>
                      <td className="px-2 py-2.5"><MiniBar value={r.dsa} width={36} /></td>
                      <td className="px-2 py-2.5"><MiniBar value={r.coreCs} width={36} /></td>
                      <td className="px-2 py-2.5"><MiniBar value={r.development} width={36} /></td>
                      <td className="px-2 py-2.5"><MiniBar value={r.communication} width={36} /></td>
                      <td className="px-2 py-2.5"><MiniBar value={r.average} /></td>
                      <td className="px-2 py-2.5"><PRBadge status={r.prStatus} /></td>
                      <td className="py-2.5 pl-2 pr-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[13px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("student-profile", { studentId: r.id });
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              total={rows.length}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
