"use client";

import { useMemo } from "react";
import {
  ArrowUpRight,
  ClipboardList,
  Gauge,
  MessagesSquare,
  Quote,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import {
  DOMAIN_GROUPS,
  SKILL_BY_ID,
  STUDENT_BY_ID,
  getAssessmentHistory,
  studentDomainScore,
} from "@/lib/placepro/mock-data";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { ChartCard, EmptyState } from "@/components/placepro/shared/states";
import { MiniBar, PRBadge, ScorePill } from "@/components/placepro/shared/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Student Dashboard                                                   */
/* ------------------------------------------------------------------ */

/** short, actionable practice suggestion per skill for the target list */
const SKILL_GUIDANCE: Record<string, string> = {
  dsa: "Solve one contest problem daily from the arrays track",
  dbms: "Revise normalisation and write five practice queries a day",
  os: "Re-work scheduling and memory-management notes every week",
  cn: "Walk through the TCP/IP stack with one focused revision a week",
  oops: "Refactor one past project around clean OOP principles",
  java: "Finish the collections module and redo its exercises",
  springboot: "Build a small REST CRUD service end to end",
  comm: "Rehearse a two-minute self-introduction with a peer weekly",
  sysdesign: "Read and summarise one beginner design case study a week",
  aptitude: "Practice one timed reasoning set daily",
};

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export default function StudentDashboard() {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const feedback = useAppStore((s) => s.feedback);

  const student = user?.studentId ? STUDENT_BY_ID[user.studentId] : undefined;

  const data = useMemo(() => {
    if (!student) return null;
    const history = getAssessmentHistory(student.id);
    const byDate = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const mostRecent = byDate[0];
    const lastScore = student.trend[student.trend.length - 1] ?? student.average;

    const skillEntries = Object.entries(student.scores);
    const strong = skillEntries.filter(([, v]) => v >= 75).sort((a, b) => b[1] - a[1]);
    const target = skillEntries.filter(([, v]) => v < 60).sort((a, b) => a[1] - b[1]);

    const commIds = new Set(DOMAIN_GROUPS.find((g) => g.label === "Communication")?.skills ?? []);
    const techVals = skillEntries.filter(([id]) => !commIds.has(id)).map(([, v]) => v);
    const technical = techVals.length
      ? Math.round((techVals.reduce((a, b) => a + b, 0) / techVals.length) * 10) / 10
      : 0;
    const communication = student.scores["comm"] ?? 0;

    const domainBars = DOMAIN_GROUPS.map((g) => ({
      domain: g.label,
      score: studentDomainScore(student, g.label),
    }));

    const approved = feedback
      .filter((f) => f.studentId === student.id && f.approved)
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      byDate,
      mostRecent,
      lastScore,
      strong,
      target,
      technical,
      communication,
      domainBars,
      approved,
    };
  }, [student, feedback]);

  if (!student || !data) {
    return (
      <EmptyState
        icon={UserRound}
        title="Student record not found"
        description="We couldn't load your enrolment record. Please sign in again or contact the placement cell."
      />
    );
  }

  const firstName = student.name.split(" ")[0] ?? student.name;
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const trendData = student.trend.map((score, i) => ({ assessment: i + 1, score }));
  const latestFeedback = data.approved[0];
  const recentAssessments = data.byDate.slice(0, 5);
  const gap = Math.abs(data.technical - data.communication).toFixed(1);
  const techAhead = data.technical >= data.communication;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${today} · Here's where you stand and what to focus on next.`}
      />

      {/* ------------------------ readiness highlight ------------------------ */}
      <Card className="border-border bg-card p-0 shadow-none pp-rise">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Placement readiness
            </p>
            <div className="mt-2.5">
              <PRBadge status={student.prStatus} className="px-3.5 py-1.5 text-sm" />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {student.prStatus === "PR"
                ? "You meet the current cutoffs across assessments."
                : "You're close — focus on the areas highlighted below."}
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-5 border-t border-border/70 pt-5 sm:grid-cols-4 lg:max-w-2xl lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div>
              <p className="text-[11px] text-muted-foreground">Overall performance</p>
              <p className="tabular mt-1 text-xl font-semibold text-foreground">{student.average}%</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">CGPA</p>
              <p className="tabular mt-1 text-xl font-semibold text-foreground">{student.cgpa}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Assessments taken</p>
              <p className="tabular mt-1 text-xl font-semibold text-foreground">{data.byDate.length}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Most recent score</p>
              <p className="tabular mt-1 text-xl font-semibold text-foreground">{data.lastScore}%</p>
              {data.mostRecent ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={data.mostRecent.name}>
                  {data.mostRecent.name}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------ charts ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title="My performance over time"
          description="Percentage score in every assessment, newest on the right"
          className="lg:col-span-5 pp-rise"
        >
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" vertical={false} />
                <XAxis dataKey="assessment" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                <YAxis domain={[30, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                <ReTooltip
                  formatter={(v: number) => [`${v}%`, "Score"]}
                  labelFormatter={(l: number) => `Assessment ${l}`}
                  contentStyle={tooltipStyle}
                />
                <ReferenceLine
                  y={60}
                  stroke="#D99A36"
                  strokeDasharray="4 4"
                  label={{ value: "Target", position: "insideTopRight", fontSize: 11, fill: "#D99A36" }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#245C45"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "#245C45", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  animationDuration={700}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Domain-wise breakdown"
          description="Your average score by evaluation domain"
          className="lg:col-span-4 pp-rise"
          bodyClassName="h-[240px] px-2 pb-0 pt-4"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.domainBars} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="domain" tick={axisTick} axisLine={false} tickLine={false} width={100} />
              <ReTooltip formatter={(v: number) => [`${v}%`, "Average"]} contentStyle={tooltipStyle} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={18} animationDuration={700}>
                {data.domainBars.map((d) => (
                  <Cell key={d.domain} fill={d.score < 60 ? "#D99A36" : "#245C45"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="flex flex-col border-border bg-card p-5 shadow-none lg:col-span-3 pp-rise">
          <SectionHeading title="Technical vs Communication" description="Averages across your evaluated skills" />
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Technical</p>
              <p className="tabular mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
                {Math.round(data.technical)}
                <span className="text-base font-medium">%</span>
              </p>
              <MiniBar value={data.technical} width={96} className="mt-3" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Communication</p>
              <p className="tabular mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
                {Math.round(data.communication)}
                <span className="text-base font-medium">%</span>
              </p>
              <MiniBar value={data.communication} width={96} className="mt-3" />
            </div>
          </div>
          <p className="mt-6 border-t border-border/70 pt-4 text-[13px] leading-relaxed text-muted-foreground">
            {techAhead
              ? `Your technical average runs ${gap} points ahead of communication — a couple of structured speaking drills each week will keep both interview-ready.`
              : `Your communication runs ${gap} points ahead of your technical average — extra contest practice will bring the two in line.`}
          </p>
        </Card>
      </section>

      {/* --------------------- strong areas / areas to target --------------------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
          <div className="border-b border-border/70 px-5 py-4">
            <SectionHeading title="Strong areas" description="Skills where you're scoring 75% and above" />
          </div>
          {data.strong.length ? (
            <ul className="px-5 py-2">
              {data.strong.map(([id, score]) => (
                <li
                  key={id}
                  className="flex flex-col gap-2 border-b border-border/50 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{SKILL_BY_ID[id]?.name ?? id}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Averaged {score}% across {data.byDate.length} assessments
                    </p>
                  </div>
                  <MiniBar value={score} width={96} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Trophy}
              title="No strong areas yet"
              description="Scores of 75% and above will appear here as you keep improving."
            />
          )}
        </Card>

        <Card className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
          <div className="border-b border-border/70 px-5 py-4">
            <SectionHeading title="Areas to target" description="Skills below 60% — small, regular practice moves these fastest" />
          </div>
          {data.target.length ? (
            <ul className="px-5 py-2">
              {data.target.map(([id, score]) => (
                <li key={id} className="flex items-start gap-3 border-b border-border/50 py-3.5 last:border-0">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <Target className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{SKILL_BY_ID[id]?.name ?? id}</p>
                      <ScorePill value={score} suffix="%" />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {SKILL_GUIDANCE[id] ?? "Ask your trainer for a focused practice plan"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Gauge}
              title="Nothing to flag"
              description="You're scoring 60% or above in every evaluated skill — great work!"
            />
          )}
        </Card>
      </section>

      {/* ------------------- recent feedback + recent assessments ------------------- */}
      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="gap-0 border-border bg-card p-0 shadow-none lg:col-span-7 pp-rise">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
            <SectionHeading title="Recent trainer feedback" description="From your latest approved mock interview review" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-[13px] text-primary"
              onClick={() => navigate("my-feedback")}
            >
              View all feedback <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
          {latestFeedback ? (
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground">
                {latestFeedback.assessmentName} ·{" "}
                {new Date(latestFeedback.date).toLocaleDateString("en-IN", DATE_OPTS)}
              </p>
              <div className="mt-3 flex gap-2.5">
                <Quote className="mt-0.5 size-4 shrink-0 text-primary/60" aria-hidden />
                <p className="text-[13px] leading-relaxed text-foreground">{latestFeedback.technical}</p>
              </div>
              {latestFeedback.strengths.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Strength:</span>
                  <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-medium text-success">
                    {latestFeedback.strengths[0]}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="No feedback yet"
              description="Your trainer's approved review will appear here after your next mock interview."
            />
          )}
        </Card>

        <Card className="gap-0 border-border bg-card p-0 shadow-none lg:col-span-5 pp-rise">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
            <SectionHeading title="Recent assessments" description="Your five most recent results" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-[13px] text-primary"
              onClick={() => navigate("my-performance")}
            >
              Full history <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
          {recentAssessments.length ? (
            <ul className="px-5 py-2">
              {recentAssessments.map((a) => {
                const result = a.results.find((r) => r.studentId === student.id);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground" title={a.name}>
                        {a.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(a.date).toLocaleDateString("en-IN", DATE_OPTS)}
                      </p>
                    </div>
                    {result ? <ScorePill value={result.percentage} suffix="%" /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No assessments yet"
              description="Your exam and mock interview results will be listed here once imported."
            />
          )}
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
