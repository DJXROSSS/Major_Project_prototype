"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  GraduationCap,
  Layers,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import { api } from "@/lib/placepro/api";
import type { AppUser } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { StatCard } from "@/components/placepro/shared/stat-card";
import { ChartCard, EmptyState } from "@/components/placepro/shared/states";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { UserAvatar } from "@/components/placepro/shared/misc";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/placepro/shared/page-header";
import { StudentVerificationRequests } from "./student-verification-requests";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/* Admin Dashboard                                                     */
/* ------------------------------------------------------------------ */

const GREEN = "#245C45";
const AMBER = "#D99A36";

export default function AdminDashboard() {
  const users = useAppStore((s) => s.users);
  const batches = useAppStore((s) => s.batches);
  const skills = useAppStore((s) => s.skills);
  const companies = useAppStore((s) => s.companies);
  const students = useAppStore((s) => s.students);
  const auditLogs = useAppStore((s) => s.auditLogs);
  const dashboard = useAppStore((s) => s.dashboard);
  const isRefreshing = useAppStore((s) => s.isRefreshing);

  const stats = useMemo(() => {
    const countRole = (role: string) => dashboard?.userCounts
      ? dashboard.userCounts.filter((entry) => entry.role === role).reduce((sum, entry) => sum + entry.count, 0)
      : users.filter((u) => u.role === role).length;
    const trainers = countRole("trainer");
    const admins = countRole("admin");
    const studentUsers = countRole("student");
    const activeSkills = skills.filter((s) => s.active).length;
    const totalStudents = dashboard?.totalStudents ?? students.length;
    return { trainers, admins, studentUsers, activeSkills, totalStudents };
  }, [users, skills, students, dashboard]);

  const roleBars = [
    { role: "Administrator", count: stats.admins },
    { role: "Trainer", count: stats.trainers },
    { role: "Student", count: stats.studentUsers },
  ];

  const readiness = useMemo(() => {
    if (dashboard?.batchReadiness && dashboard.batchReadiness.length > 0) {
      return dashboard.batchReadiness.map((b) => ({
        name: b.batch,
        pr: b.pr_count,
        npr: b.npr_count,
      }));
    }
    return batches.map((b) => {
      const list = students.filter(
        (s) => s.batch === b.name || (s as { batchId?: string }).batchId === b.id
      );
      return {
        name: b.name,
        pr: list.filter((s) => s.prStatus === "PR").length,
        npr: list.filter((s) => s.prStatus === "NPR").length,
      };
    });
  }, [dashboard?.batchReadiness, batches, students]);

  const recentLogs = useMemo(() => {
    if (auditLogs.length > 0) return auditLogs.slice(0, 8);
    if (dashboard?.recentAuditLogs && dashboard.recentAuditLogs.length > 0) {
      return dashboard.recentAuditLogs.slice(0, 8);
    }
    return [];
  }, [auditLogs, dashboard?.recentAuditLogs]);

  if (isRefreshing && !users.length && !dashboard) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading administration overview…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration overview"
        subtitle="System configuration and institutional activity at a glance."
      />

      <StudentVerificationRequests />

      {/* ------------------------------ KPIs ------------------------------ */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total students"
          value={stats.totalStudents}
          icon={GraduationCap}
          variant="hero"
          hint="Enrolled across all batches"
        />
        <StatCard label="Total trainers" value={stats.trainers} icon={UsersRound} hint="Technical staff accounts" />
        <StatCard label="Total batches" value={batches.length} icon={Layers} hint="Active cohorts" />
        <StatCard label="Configured skills" value={stats.activeSkills} icon={SlidersHorizontal} hint="Active evaluation parameters" />
        <StatCard label="Registered companies" value={companies.length} icon={Building2} hint="Eligibility profiles" />
      </section>

      {/* ------------------------------ charts ------------------------------ */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Users by role"
          description="Distribution of accounts across the platform"
          className="pp-rise"
          bodyClassName="h-[240px] px-2 pb-2 pt-4"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roleBars} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" vertical={false} />
              <XAxis dataKey="role" tick={axisTick} axisLine={false} tickLine={false} dy={6} interval={0} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <ReTooltip formatter={(v: number) => [`${v} users`, "Accounts"]} contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} barSize={38} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Batch readiness"
          description="Placement-ready vs not-ready students per batch"
          className="pp-rise"
          bodyClassName="px-2 pb-2 pt-4"
        >
          <div className="h-[188px]">
            {readiness.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={readiness} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={92} />
                  <ReTooltip formatter={(v: number, n: string) => [`${v} students`, n]} contentStyle={tooltipStyle} />
                  <Bar dataKey="pr" name="Placement ready" fill={GREEN} radius={[0, 4, 4, 0]} barSize={13} animationDuration={700} />
                  <Bar dataKey="npr" name="Not ready" fill={AMBER} radius={[0, 4, 4, 0]} barSize={13} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No batch readiness data available
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-5 border-t border-border/70 pt-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: GREEN }} />
              Placement ready
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: AMBER }} />
              Not ready
            </span>
          </div>
        </ChartCard>

        <FacultyDirectory />
      </section>

      {/* ---------------------- recent system activity ---------------------- */}
      <Card className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading title="Recent system activity" description="Latest administrative and trainer actions" />
        </div>
        {recentLogs.length > 0 ? (
          <ul className="px-5 py-2">
            {recentLogs.map((log) => {
              const actorName = log.user || (log as { actor?: string }).actor || "System";
              return (
                <li key={log.id} className="flex items-start gap-3 border-b border-border/50 py-3 last:border-0">
                  <UserAvatar name={actorName} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">
                      <span className="font-semibold">{actorName}</span>
                      <span className="text-muted-foreground"> — {log.action}</span>
                    </p>
                    {log.record ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={log.record}>
                        {log.record}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {log.module}
                    </span>
                    <span className="text-[11px] tabular text-muted-foreground/80">{formatLogTime(log.timestamp)}</span>
                    <StatusBadge tone={log.status === "success" ? "success" : log.status === "warning" ? "warning" : "danger"}>
                      {log.status === "success" ? "Success" : log.status === "warning" ? "Warning" : "Failed"}
                    </StatusBadge>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Activity}
            title="No recent audit logs"
            description="System activity will be recorded here as users perform actions."
          />
        )}
      </Card>
    </div>
  );
}

function FacultyDirectory() {
  const [faculty, setFaculty] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const loadFaculty = async () => {
      const allFaculty: AppUser[] = [];
      for (let page = 1; ; page += 1) {
        const users = await api.users({ role: "trainer", page, pageSize: 100 });
        allFaculty.push(...users);
        if (users.length < 100) break;
      }
      if (active) setFaculty(allFaculty);
    };
    void loadFaculty()
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <ChartCard
      title="Faculty directory"
      description="Registered faculty and trainers"
      className="pp-rise"
      bodyClassName="h-[240px] overflow-hidden p-0"
    >
      {loading ? (
        <div className="space-y-3 p-4" role="status" aria-label="Loading faculty directory">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <div role="status" className="flex h-full flex-col items-center justify-center px-5 text-center">
          <p className="text-sm font-medium text-foreground">Faculty directory unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">Please refresh the dashboard to try again.</p>
        </div>
      ) : faculty.length ? (
        <ul className="h-full divide-y divide-border/60 overflow-y-auto px-4">
          {faculty.map((member) => (
            <li key={member.id} className="flex min-w-0 items-center gap-3 py-3">
              <UserAvatar name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{member.name}</p>
                <p className="text-[11px] text-muted-foreground">Technical Trainer</p>
                <a href={"mailto:" + member.email} className="block truncate text-[11px] text-primary hover:underline">
                  {member.email}
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-5 text-center">
          <UserRound className="size-7 text-muted-foreground/70" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground">No faculty registered</p>
          <p className="mt-1 text-xs text-muted-foreground">Trainer accounts will appear here.</p>
        </div>
      )}
    </ChartCard>
  );
}

/* helpers + shared recharts styling */
function formatLogTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, ${d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const axisTick = { fontSize: 12, fill: "#727C74" };
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #E4E9E4",
  boxShadow: "0 4px 16px -8px rgba(32,41,35,0.16)",
  fontSize: 13,
  padding: "8px 12px",
};
