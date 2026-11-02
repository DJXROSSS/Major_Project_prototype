"use client";

import { useMemo } from "react";
import {
  Activity,
  ArrowUpRight,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  MessagesSquare,
  TrendingUp,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import {
  DOMAIN_GROUPS,
  RECENT_ACTIVITY,
  STUDENTS,
  domainAverage,
  monthlyPerformance,
  weakestDomain,
} from "@/lib/placepro/mock-data";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { StatCard } from "@/components/placepro/shared/stat-card";
import { ChartCard } from "@/components/placepro/shared/states";
import { PRBadge } from "@/components/placepro/shared/badges";
import { UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Trainer Dashboard                                                   */
/* ------------------------------------------------------------------ */

const ACTIVITY_ICON = {
  import: FileSpreadsheet,
  assessment: ClipboardList,
  feedback: MessagesSquare,
  system: Activity,
  company: Trophy,
};

export default function TrainerDashboard() {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const assessments = useAppStore((s) => s.assessments);

  const data = useMemo(() => {
    const batch = STUDENTS.filter((s) => s.batch === "2022–2026 CSE");
    const pr = batch.filter((s) => s.prStatus === "PR");
    const npr = batch.filter((s) => s.prStatus === "NPR");
    const batchAvg = batch.reduce((a, s) => a + s.average, 0) / batch.length;
    const monthly = monthlyPerformance("2022–2026 CSE");
    const prev = monthly[monthly.length - 2]?.average ?? batchAvg;
    const current = monthly[monthly.length - 1]?.average ?? batchAvg;
    const top = [...batch].sort((a, b) => b.average - a.average).slice(0, 5);
    const attention = [...batch]
      .sort((a, b) => a.average - b.average)
      .slice(0, 5)
      .map((s) => ({ student: s, weak: weakestDomain(s) }));
    return { batch, pr, npr, batchAvg, monthly, top, attention, delta: Number(((current - prev) / prev) * 100).toFixed(1) };
  }, []);

  const donut = [
    { name: "Placement Ready", value: data.pr.length, color: "#245C45" },
    { name: "Not Ready", value: data.npr.length, color: "#D99A36" },
  ];

  const domainBars = DOMAIN_GROUPS.map((g) => ({
    domain: g.label,
    score: domainAverage(data.batch, g.label),
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${user?.name.split(" ")[0] ?? "Trainer"}`}
        subtitle="Here's an overview of student performance and placement readiness."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("assessments")}>
              View assessments
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={() => navigate("import")}>
              <FileSpreadsheet className="size-4" /> Import results
            </Button>
          </>
        }
      />

      {/* ------------------------------ KPIs ------------------------------ */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total students" value={STUDENTS.length} icon={UsersRound} hint="Across 2 active batches" />
        <StatCard label="Placement ready" value={data.pr.length} icon={Trophy} variant="hero" hint="PR · meeting all cutoffs" />
        <StatCard label="Not placement ready" value={data.npr.length} icon={Gauge} hint="NPR · need improvement plans" />
        <StatCard label="Assessments conducted" value={assessments.length} icon={ClipboardList} hint="Exams and mock interviews" />
        <StatCard
          label="Avg. batch performance"
          value={<>{data.batchAvg.toFixed(1)}<span className="text-base font-medium">%</span></>}
          icon={TrendingUp}
          delta={Number(data.delta)}
          deltaLabel="vs last month"
          className="col-span-2 md:col-span-1"
        />
      </section>

      {/* ------------------------ readiness + trend ------------------------ */}
      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title="Placement readiness"
          description="2022–2026 CSE · current classification"
          className="lg:col-span-4 pp-rise"
          bodyClassName="px-2 pb-2 pt-4"
        >
          <div className="relative h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={86}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {donut.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v: number, n: string) => [`${v} students`, n]} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-[30px] font-semibold leading-none text-foreground">{data.batch.length}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">students</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-5 border-t border-border/70 pt-3">
            {donut.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: d.color }} />
                {d.name} · <span className="tabular font-semibold text-foreground">{d.value}</span>
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Student performance trend"
          description="Month-wise average score across all assessments"
          className="lg:col-span-8 pp-rise"
          bodyClassName="h-[292px] px-2 pb-0 pt-4"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
              <YAxis domain={[40, 90]} tick={axisTick} axisLine={false} tickLine={false} />
              <ReTooltip formatter={(v: number) => [`${v}%`, "Average score"]} contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="average"
                stroke="#245C45"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "#245C45", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {/* ------------------- domain bars + top performers ------------------- */}
      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title="Domain performance"
          description="Batch average by evaluation domain"
          className="lg:col-span-5 pp-rise"
          bodyClassName="h-[240px] px-2 pb-0 pt-4"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={domainBars} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="domain" tick={axisTick} axisLine={false} tickLine={false} width={104} />
              <ReTooltip formatter={(v: number) => [`${v}%`, "Average"]} contentStyle={tooltipStyle} />
              <Bar dataKey="score" fill="#245C45" radius={[0, 4, 4, 0]} barSize={18} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none lg:col-span-7 pp-rise">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <SectionHeading title="Top performing students" description="Highest average score this cycle" />
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[13px] text-primary" onClick={() => navigate("students")}>
              All students <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="py-2.5 pl-5 pr-2 font-medium">#</th>
                <th className="px-2 py-2.5 font-medium">Student</th>
                <th className="px-2 py-2.5 font-medium">Roll number</th>
                <th className="px-2 py-2.5 font-medium">Average score</th>
                <th className="py-2.5 pl-2 pr-5 text-right font-medium">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((s, i) => (
                <tr
                  key={s.id}
                  onClick={() => navigate("student-profile", { studentId: s.id })}
                  className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                >
                  <td className="tabular py-2.5 pl-5 pr-2 text-[13px] text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <UserAvatar name={s.name} size="sm" />
                      <span className="font-medium text-foreground">{s.name}</span>
                    </span>
                  </td>
                  <td className="tabular px-2 py-2.5 text-[13px] text-muted-foreground">{s.rollNumber}</td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-success" style={{ width: `${s.average}%` }} />
                      </span>
                      <span className="tabular text-[13px] font-semibold text-foreground">{s.average}%</span>
                    </span>
                  </td>
                  <td className="py-2.5 pl-2 pr-5 text-right"><PRBadge status={s.prStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ------------------- attention list + activity ------------------- */}
      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none lg:col-span-7 pp-rise">
          <div className="border-b border-border/70 px-5 py-4">
            <SectionHeading title="Students requiring attention" description="Lowest average score — schedule improvement plans" />
          </div>
          <ul>
            {data.attention.map(({ student, weak }) => (
              <li
                key={student.id}
                className="flex flex-col gap-3 border-b border-border/50 px-5 py-3.5 transition-colors last:border-0 hover:bg-muted/60 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => navigate("student-profile", { studentId: student.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <UserAvatar name={student.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{student.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {student.rollNumber} · last assessment {student.trend[student.trend.length - 1] ?? "—"}%
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-5 sm:gap-6">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Weakest domain</p>
                    <span className="mt-0.5 inline-flex rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                      {weak.domain}
                    </span>
                  </div>
                  <div className="w-12">
                    <p className="text-[11px] text-muted-foreground">Score</p>
                    <p className="tabular mt-0.5 text-sm font-semibold text-danger">{student.average}%</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[13px]"
                    onClick={() => navigate("student-profile", { studentId: student.id })}
                  >
                    View profile
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="gap-0 border-border bg-card p-0 shadow-none lg:col-span-5 pp-rise">
          <div className="border-b border-border/70 px-5 py-4">
            <SectionHeading title="Recent activity" description="Imports, assessments and updates" />
          </div>
          <ul className="px-5 py-2">
            {RECENT_ACTIVITY.map((a) => {
              const Icon = ACTIVITY_ICON[a.kind];
              return (
                <li key={a.id} className="flex gap-3 py-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{a.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{a.time}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}

/* shared recharts styling */
const axisTick = { fontSize: 12, fill: "#727C74" };
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #E4E9E4",
  boxShadow: "0 4px 16px -8px rgba(32,41,35,0.16)",
  fontSize: 13,
  padding: "8px 12px",
};
