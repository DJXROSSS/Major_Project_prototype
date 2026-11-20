"use client";

import { useEffect, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/placepro/api";
import { useSubjectColumns } from "./use-subject-columns";
import StudentFilterPanel from "./student-filter-panel";
import { applyStudentFilters, readStudentFilters, studentFilterKeys, type StudentFilters } from "@/lib/placepro/student-filters";
import type { Student } from "@/types";
import RegistrationButton from "@/components/placepro/admin/registration-button";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { MiniBar, PRBadge } from "@/components/placepro/shared/badges";
import { SearchInput, type FilterOption } from "@/components/placepro/shared/controls";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* Trainer — Student Management listing                                */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

const SORT_OPTIONS: FilterOption[] = [
  { label: "Name: A to Z", value: "name-asc" },
  { label: "Name: Z to A", value: "name-desc" },
  { label: "CGPA: High to Low", value: "cgpa-desc" },
  { label: "CGPA: Low to High", value: "cgpa-asc" },
];

const DEFAULT_SORT = "name-asc";
const VALID_SORTS = new Set(SORT_OPTIONS.map(option => option.value));

export default function StudentsPage() {
  const user = useAppStore(s => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const batches = useAppStore((s) => s.batches);
  const columns = useSubjectColumns();
  const { visible } = columns;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const batch = searchParams.get("batch") ?? "all";
  const section = searchParams.get("section") ?? "all";
  const pr = searchParams.get("pr") ?? "all";
  const domain = searchParams.get("domain") ?? "all";
  const projectFilter = searchParams.get("project") ?? "all";
  const requestedSort = searchParams.get("sort");
  const sort = requestedSort && VALID_SORTS.has(requestedSort) ? requestedSort : DEFAULT_SORT;
  const pageValue = Number(searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const [result, setResult] = useState<{ items: Student[]; total: number; page: number }>({ items: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editMode, setEditMode] = useState<"details" | "section">("details");
  const [editForm, setEditForm] = useState({ name: "", email: "", mobileNumber: "", section: "", cgpa: "" });
  const [mutationError, setMutationError] = useState("");
  const [mutating, setMutating] = useState(false);
  const [unassigningStudent, setUnassigningStudent] = useState<Student | null>(null);
  const { toast } = useToast();
  const batchOptions = useMemo(() => batches.map(b => ({ label: b.name, value: b.name })), [batches]);
  const filters = readStudentFilters(new URLSearchParams(searchParams.toString()));
  const sectionOptions = useMemo<FilterOption[]>(() => [...new Set(batches.flatMap(b => b.sections))].sort().map(s => ({ label: `Section ${s}`, value: s })), [batches]);
  const applyFilters = (nextFilters: StudentFilters) => router.push(`${pathname}?${applyStudentFilters(new URLSearchParams(searchParams.toString()), nextFilters)}`, { scroll: false });
  const updateQuery = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.push(`${pathname}?${next}`, { scroll: false });
  };
  const filtersActive = !!query || [batch, section, pr, domain, projectFilter].some(v => v !== "all");
  const resetFilters = () => router.push(pathname, { scroll: false });
  const setPage = (value: number) => updateQuery("page", String(value));
  useEffect(() => {
    if (requestedSort === sort) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("sort", sort);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [requestedSort, sort, searchParams, router, pathname]);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    const optional = (value: string) => value === "all" ? undefined : value;
    const sorts: Record<string, string> = { "name-asc": "name_asc", "name-desc": "name_desc", "cgpa-desc": "cgpa_desc", "cgpa-asc": "cgpa_asc" };
    // Debounce typing and discard responses for superseded URL states.
    const timer = setTimeout(() => {
      void api.listStudents({ q: query, batchId: optional(batch), section: optional(section), prStatus: optional(pr), domainId: optional(domain), projectFilter: optional(projectFilter), sort: sorts[sort], page, pageSize: PAGE_SIZE })
        .then(response => {
          if (!live) return;
          setResult(response);
          if (response.page !== page || (searchParams.has("page") && searchParams.get("page") !== String(page))) {
            const next = new URLSearchParams(searchParams.toString()); next.set("page", String(response.page));
            router.replace(`${pathname}?${next}`, { scroll: false });
          }
        })
        .catch(err => { if (live) setError(err instanceof Error ? err.message : "Unable to load students."); })
        .finally(() => { if (live) setLoading(false); });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [query, batch, section, pr, domain, projectFilter, sort, page, retry, searchParams, router, pathname]);
  const pageRows = result.items;
  const currentPage = result.page;
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const editBatch = editingStudent ? batches.find(item => item.id === editingStudent.batchId || item.name === editingStudent.batch) : undefined;
  const openEditor = (student: Student, mode: "details" | "section") => {
    setEditingStudent(student); setEditMode(mode); setMutationError("");
    setEditForm({ name: student.name, email: student.email, mobileNumber: student.mobileNumber || "", section: student.section, cgpa: String(student.cgpa) });
  };
  const saveStudent = async () => {
    if (!editingStudent || mutating) return;
    setMutating(true); setMutationError("");
    try {
      await api.updateStudent(editingStudent.id, editMode === "section"
        ? { section: editForm.section }
        : { name: editForm.name, email: editForm.email, mobileNumber: editForm.mobileNumber, section: editForm.section, cgpa: Number(editForm.cgpa) });
      setEditingStudent(null); setRetry(value => value + 1); await useAppStore.getState().refreshData();
      toast({ title: editMode === "section" ? "Section updated" : "Student updated", description: `${editingStudent.name}'s record was saved.` });
    } catch (error) { setMutationError(error instanceof Error ? error.message : "Unable to update student."); }
    finally { setMutating(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle={`${result.total} matching students across ${batches.length} batches.`}
        actions={<RegistrationButton role="student" allowImport={user?.role === "admin"} onRegistered={email => { router.push(`${pathname}?q=${encodeURIComponent(email)}&sort=${sort}`); setRetry(value => value + 1); }} />}
      />

      <Card className="gap-0 border-border bg-card p-0 shadow-none">
        {/* filter toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 p-4 sm:p-5">
          <SearchInput value={query} onChange={value => updateQuery("q", value)} placeholder="Search by name, roll number or email" className="min-w-[200px] flex-1 sm:max-w-md" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Select value={sort} onValueChange={value => updateQuery("sort", value)}>
              <SelectTrigger aria-label="Sort students" className="h-9 w-[195px] text-sm">
                <SelectValue>{SORT_OPTIONS.find(option => option.value === sort)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <StudentFilterPanel filters={filters} apply={applyFilters} batches={batchOptions} sections={sectionOptions} columns={columns} />
          </div>
          {studentFilterKeys.some(key => filters[key] !== "all") && <div className="flex w-full flex-wrap gap-2" aria-label="Applied filters">
            {studentFilterKeys.filter(key => filters[key] !== "all").map(key => <Button key={key} variant="secondary" size="sm" className="h-7 max-w-full text-xs" onClick={() => applyFilters({ ...filters, [key]: "all" })} aria-label={`Remove ${key} filter: ${filters[key]}`}><span className="truncate">{key}: {filters[key]}</span><span aria-hidden> x</span></Button>)}
          </div>}
        </div>

        {/* content */}
        {error ? (<div role="alert" className="p-5 text-danger">{error} <Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>) : loading ? (
          <TableSkeleton rows={8} />
        ) : result.total === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No students found"
            description="No students match the current search and filter combination. Try adjusting or clearing the filters."
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" onClick={resetFilters} className="h-9">
                  Reset all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2">Student</th>
                    <th className="px-2 py-2.5">Roll No</th>
                    <th className="px-2 py-2.5">Email</th><th className="px-2 py-2.5">Mobile</th>
                    <th className="px-2 py-2.5">Batch</th>
                    <th className="px-2 py-2.5">Section</th>
                    <th className="px-2 py-2.5">CGPA</th>
                    {visible.map(subject => <th key={subject.id} className="whitespace-nowrap px-2 py-2.5">{subject.name}</th>)}
                    <th className="px-2 py-2.5">Average</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="py-2.5 pl-2 pr-5 text-right">Action</th>
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
                      <td className="px-2 py-2.5">{r.email}</td><td className="px-2 py-2.5">{r.mobileNumber || "-"}</td>
                      <td className="px-2 py-2.5 text-[13px] text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {r.batch.replace(" CSE", "")}
                          <span className="text-muted-foreground/70"> · {r.section}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{r.section || "Unassigned"}</td>
                      <td className="tabular px-2 py-2.5 text-[13px] font-medium text-foreground">{r.cgpa.toFixed(1)}</td>
                      {visible.map(subject => <td key={subject.id} className="px-2 py-2.5">{r.scores[subject.id] === undefined ? <span className="text-muted-foreground">-</span> : <MiniBar value={r.scores[subject.id]} width={36} />}</td>)}
                      <td className="px-2 py-2.5"><MiniBar value={r.average} /></td>
                      <td className="px-2 py-2.5"><PRBadge status={r.prStatus} /></td>
                      <td className="py-2.5 pl-2 pr-5 text-right">
                        <div className="flex justify-end gap-1"><Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[13px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("student-profile", { studentId: r.id });
                          }}
                        >
                          View
                        </Button><Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={(e) => { e.stopPropagation(); openEditor(r, "details"); }}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={(e) => { e.stopPropagation(); openEditor(r, "section"); }}>Change section</Button>
                        <Button variant="outline" size="sm" className="h-8 text-[13px] text-danger" disabled={!r.section} onClick={(e) => { e.stopPropagation(); setMutationError(""); setUnassigningStudent(r); }}>Remove</Button></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              total={result.total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
      <Dialog open={editingStudent !== null} onOpenChange={(open) => { if (!open && !mutating) setEditingStudent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editMode === "section" ? "Change section" : "Edit student"}</DialogTitle>
            <DialogDescription>{editingStudent?.rollNumber} · {editingStudent?.batch}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {editMode === "details" ? <>
              <div className="space-y-1"><Label htmlFor="student-name">Name</Label><Input id="student-name" value={editForm.name} maxLength={100} onChange={event => setEditForm(form => ({ ...form, name: event.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="student-email">Email</Label><Input id="student-email" type="email" value={editForm.email} maxLength={120} onChange={event => setEditForm(form => ({ ...form, email: event.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="student-mobile">Mobile</Label><Input id="student-mobile" value={editForm.mobileNumber} maxLength={20} onChange={event => setEditForm(form => ({ ...form, mobileNumber: event.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="student-cgpa">CGPA</Label><Input id="student-cgpa" type="number" min={0} max={10} step={0.01} value={editForm.cgpa} onChange={event => setEditForm(form => ({ ...form, cgpa: event.target.value }))} /></div>
            </> : null}
            <div className="space-y-1"><Label htmlFor="student-section">Section</Label><Select value={editForm.section} onValueChange={sectionValue => setEditForm(form => ({ ...form, section: sectionValue }))}>
              <SelectTrigger id="student-section"><SelectValue placeholder="Select section" /></SelectTrigger><SelectContent>{editBatch?.sections.map(sectionValue => <SelectItem key={sectionValue} value={sectionValue}>{sectionValue}</SelectItem>)}</SelectContent>
            </Select></div>
            {mutationError ? <p role="alert" className="text-sm text-danger">{mutationError}</p> : null}
          </div>
          <DialogFooter><Button variant="outline" disabled={mutating} onClick={() => setEditingStudent(null)}>Cancel</Button><Button disabled={mutating || !editForm.section} onClick={() => void saveStudent()}>{mutating ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={unassigningStudent !== null} onOpenChange={(open) => { if (!open && !mutating) setUnassigningStudent(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove student from section?</AlertDialogTitle><AlertDialogDescription>
          {unassigningStudent?.name} will become unassigned. Their account, batch, assessments, scores, projects, and history will remain intact.
        </AlertDialogDescription></AlertDialogHeader>
          {mutationError ? <p role="alert" className="text-sm text-danger">{mutationError}</p> : null}
          <AlertDialogFooter><AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel><AlertDialogAction disabled={mutating} onClick={async event => { event.preventDefault(); if (!unassigningStudent) return; setMutating(true); setMutationError(""); try { await api.unassignStudentSection(unassigningStudent.id); toast({ title: "Section assignment removed" }); setUnassigningStudent(null); setRetry(value => value + 1); await useAppStore.getState().refreshData(); } catch (error) { setMutationError(error instanceof Error ? error.message : "Unable to remove section assignment."); } finally { setMutating(false); } }}>{mutating ? "Removing…" : "Remove from section"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
