"use client";

import { useMemo } from "react";
import {
  Activity,
  Building2,
  GraduationCap,
  Layers,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import { AUDIT_LOGS, STUDENTS } from "@/lib/placepro/mock-data";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { StatCard } from "@/components/placepro/shared/stat-card";
import { ChartCard } from "@/components/placepro/shared/states";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { UserAvatar } from "@/components/placepro/shared/misc";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/placepro/shared/page-header";
import { StudentVerificationRequests } from "./student-verification-requests";

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

  const stats = useMemo(() => {
    const trainers = users.filter((u) => u.role === "trainer").length;
    const admins = users.filter((u) => u.role === "admin").length;
    const students = users.filter((u) => u.role === "student").length;
    const active = users.filter((u) => u.status === "active").length;
    const inactive = users.length - active;
    const activeSkills = skills.filter((s) => s.active).length;
    return { trainers, admins, students, active, inactive, activeSkills };
  }, [users, skills]);

  const roleBars = [
    { role: "Administrator", count: stats.admins },
    { role: "Trainer", count: stats.trainers },
    { role: "Student", count: stats.students },
  ];

  const statusDonut = [
    { name: "Active", value: stats.active, color: GREEN },
    { name: "Inactive", value: stats.inactive, color: AMBER },
  ];

  const readiness = useMemo(
    () =>
      batches.map((b) => {
        const list = STUDENTS.filter((s) => s.batch === b.name);
        return {
          name: b.name,
          pr: list.filter((s) => s.prStatus === "PR").length,
          npr: list.filter((s) => s.prStatus === "NPR").length,
        };
      }),
    [batches],
  );

  const recentLogs = useMemo(() => [...AUDIT_LOGS].slice(0, 8), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration overview"
        subtitle="System configuration and institutional activity at a glance."
      />

      <StudentVerificationRequests />

      {/* ------------------------------ KPIs ------------------------------ */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total students" value={STUDENTS.length} icon={GraduationCap} variant="hero" hint="Enrolled across all batches" />
        <StatCard label="Total trainers" value={stats.trainers} icon={UsersRound} hint="Technical staff accounts" />
        <StatCard label="Total batches" value={batches.length} icon={Layers} hint="Active cohorts" />
        <StatCard label="Active users" value={stats.active} icon={UserCheck} hint="Signed in recently" />
        <StatCard label="Configured skills" value={stats.activeSkills} icon={SlidersHorizontal} hint="Active evaluation parameters" />
        <StatCard label="Registered companies" value={companies.length} icon={Building2} hint="Eligibility profiles" />
      </section>

      {/* ------------------------------ charts ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title="Users by role"
          description="Distribution of accounts across the platform"
          className="lg:col-span-4 pp-rise"
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
          title="Active vs inactive users"
          description="Account status across all roles"
          className="lg:col-span-4 pp-rise"
          bodyClassName="px-2 pb-2 pt-4"
        >
          <div className="relative h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDonut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={80}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {statusDonut.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v: number, n: string) => [`${v} users`, n]} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-[28px] font-semibold leading-none text-foreground">{users.length}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">total users</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-5 border-t border-border/70 pt-3">
            {statusDonut.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: d.color }} />
                {d.name} · <span className="tabular font-semibold text-foreground">{d.value}</span>
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Batch readiness"
          description="Placement-ready vs not-ready students per batch"
          className="lg:col-span-4 pp-rise"
          bodyClassName="px-2 pb-2 pt-4"
        >
          <div className="h-[188px]">
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
      </section>

      {/* ---------------------- recent system activity ---------------------- */}
      <Card className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading title="Recent system activity" description="Latest administrative and trainer actions" />
        </div>
        <ul className="px-5 py-2">
          {recentLogs.map((log) => (
            <li key={log.id} className="flex items-start gap-3 border-b border-border/50 py-3 last:border-0">
              <UserAvatar name={log.user} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">
                  <span className="font-semibold">{log.user}</span>
                  <span className="text-muted-foreground"> — {log.action}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={log.record}>
                  {log.record}
                </p>
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
          ))}
        </ul>
      </Card>
    </div>
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
