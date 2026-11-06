"use client";

import { useMemo, useState } from "react";
import { RotateCcw, ScrollText } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import type { AuditLog } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { SearchInput, FilterSelect } from "@/components/placepro/shared/controls";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Audit Logs                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

type AuditStatus = AuditLog["status"];

const STATUS_LABEL: Record<AuditStatus, string> = {
  success: "Success",
  warning: "Warning",
  failed: "Failed",
};

const STATUS_TONE: Record<AuditStatus, "success" | "warning" | "danger"> = {
  success: "success",
  warning: "warning",
  failed: "danger",
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const logs = useAppStore((s) => s.auditLogs);
  const loading = useAppStore((s) => s.isRefreshing);

  const modules = useMemo(
    () => Array.from(new Set(logs.map((l) => l.module))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...logs]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .filter((l) => {
        if (q && !l.user.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !(l.record ?? "").toLowerCase().includes(q))
          return false;
        if (moduleFilter !== "all" && l.module !== moduleFilter) return false;
        if (statusFilter !== "all" && l.status !== statusFilter) return false;
        return true;
      });
  }, [logs, search, moduleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilters = search !== "" || moduleFilter !== "all" || statusFilter !== "all";

  function resetFilters() {
    setSearch("");
    setModuleFilter("all");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" subtitle="Chronological record of administrative and trainer activity." />

      {/* filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search user, action or record…"
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <FilterSelect
            value={moduleFilter}
            onChange={setModuleFilter}
            ariaLabel="Filter by module"
            options={modules.map((m) => ({ label: m, value: m }))}
            className="w-full sm:w-48"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            options={[
              { label: "Success", value: "success" },
              { label: "Warning", value: "warning" },
              { label: "Failed", value: "failed" },
            ]}
            className="w-full sm:w-32"
          />
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2.5 text-[13px] text-muted-foreground" onClick={resetFilters}>
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          ) : null}
        </div>
      </div>

      {/* table */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        {loading ? (
          <TableSkeleton rows={9} />
        ) : paged.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No log entries found"
            description={
              hasFilters
                ? "No audit records match the current filters. Try adjusting your search."
                : "System activity will appear here as administrators and trainers work."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={resetFilters}>
                  <RotateCcw className="size-3.5" /> Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">Date &amp; time</th>
                    <th className="px-2 py-2.5 font-medium">User</th>
                    <th className="px-2 py-2.5 font-medium">Action</th>
                    <th className="px-2 py-2.5 font-medium">Module</th>
                    <th className="px-2 py-2.5 font-medium">Record</th>
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((log) => (
                    <tr key={log.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                      <td className="whitespace-nowrap py-3 pl-5 pr-2">
                        <span className="block text-[13px] font-medium text-foreground">
                          {formatDay(log.timestamp)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{formatTime(log.timestamp)}</span>
                      </td>
                      <td className="px-2 py-3">
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={log.user} size="sm" />
                          <span className="whitespace-nowrap text-[13px] font-medium text-foreground">{log.user}</span>
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[13px] font-semibold text-foreground">{log.action}</td>
                      <td className="px-2 py-3">
                        <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {log.module}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-2 py-3">
                        <span className="block truncate text-[13px] text-muted-foreground" title={log.record ?? ""}>
                          {log.record || "—"}
                        </span>
                      </td>
                      <td className="py-3 pl-2 pr-5 text-right">
                        <StatusBadge tone={STATUS_TONE[log.status]}>{STATUS_LABEL[log.status]}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={safePage} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
