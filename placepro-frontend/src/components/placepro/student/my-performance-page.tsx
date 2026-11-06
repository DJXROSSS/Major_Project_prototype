"use client";

import { useMemo } from "react";
import { Activity, ArrowUpRight, ClipboardList, TrendingUp, Trophy, UserRound } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import { domainScores, skillEntries } from "@/lib/placepro/skill-taxonomy";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { StatCard } from "@/components/placepro/shared/stat-card";
import { ChartCard, EmptyState } from "@/components/placepro/shared/states";
import { MiniBar, ScorePill, StatusBadge } from "@/components/placepro/shared/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* My Performance                                                      */
/* ------------------------------------------------------------------ */

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

function skillStatus(score: number): { label: string; tone: "success" | "info" | "danger" } {
  if (score >= 75) return { label: "Strong", tone: "success" };
  if (score >= 60) return { label: "Developing", tone: "info" };
  return { label: "Needs attention", tone: "danger" };
}

export default function MyPerformancePage() {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const students = useAppStore((s) => s.students);
  const assessments = useAppStore((s) => s.assessments);
  const skills = useAppStore((s) => s.skills);

  const student = students.find((entry) => entry.id === user?.studentId) ?? students[0];

  const data = useMemo(() => {
    if (!student) return null;
    const history = assessments;
    const byDate = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const percentages = history.flatMap((a) => {
      const r = a.results.find((x) => x.studentId === student.id);
      return r ? [r.percentage] : [];
    });
    const averageScore = percentages.length
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
      : student.average;
    const best = percentages.length ? Math.max(...percentages) : 0;
    const bestAssessment = byDate.find((a) => {
      const r = a.results.find((x) => x.studentId === student.id);
      return r !== undefined && r.percentage === best;
    });
    const subjects = skillEntries(student, skills);
    const domains = domainScores(student, skills).map((d) => ({ label: d.domain, score: d.score }));
    let trendScores = student.trend ?? [];
    if (!trendScores.length && byDate.length > 0) {
      trendScores = [...byDate]
        .reverse()
        .flatMap((a) => {
          const r = a.results.find((x) => x.studentId === student.id);
          return r ? [r.percentage] : [];
        });
    }
    const trendData = trendScores.map((score, i) => ({ assessment: i + 1, score }));
    return { byDate, averageScore, best, bestAssessment, subjects, domains, trendData };
  }, [student, assessments, skills]);

  if (!student || !data) {
    return (
      <EmptyState
        icon={UserRound}
        title="Student record not found"
        description="We couldn't load your enrolment record. Please sign in again or contact the placement cell."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Performance"
        subtitle="Assessment-by-assessment results across every evaluated skill."
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("my-feedback")}>
            Interview feedback <ArrowUpRight className="size-3.5" />
          </Button>
        }
      />

      {/* ------------------------------ KPIs ------------------------------ */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall performance" value={<>{student.average}<span className="text-base font-medium">%</span></>} icon={TrendingUp} hint="Average across all evaluated skills" />
        <StatCard label="Best assessment" value={<>{data.best}<span className="text-base font-medium">%</span></>} icon={Trophy} hint={data.bestAssessment?.name ?? "Your highest result so far"} />
        <StatCard label="Average score" value={<>{data.averageScore}<span className="text-base font-medium">%</span></>} icon={Activity} hint="Mean of all assessment results" />
        <StatCard label="Total assessments" value={data.byDate.length} icon={ClipboardList} hint="Exams and mock interviews" />
      </section>

      {/* ------------------------ subject-wise table ------------------------ */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none pp-rise">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading title="Subject-wise performance" description="Latest standing in every evaluated skill" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="py-2.5 pl-5 pr-2 font-medium">Skill</th>
                <th className="px-2 py-2.5 font-medium">Domain</th>
                <th className="px-2 py-2.5 font-medium">Latest score</th>
                <th className="px-2 py-2.5 font-medium">Overall average</th>
                <th className="py-2.5 pl-2 pr-5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => {
                const status = skillStatus(s.score);
                return (
                  <tr key={s.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                    <td className="py-2.5 pl-5 pr-2 font-medium text-foreground">{s.name}</td>
                    <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{s.domain}</td>
                    <td className="px-2 py-2.5">
                      <ScorePill value={s.score} suffix="%" />
                    </td>
                    <td className="px-2 py-2.5">
                      <MiniBar value={s.score} width={64} />
                    </td>
                    <td className="py-2.5 pl-2 pr-5 text-right">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------- historical progress + domains ------------------- */}
      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          title="Historical progress"
          description="Percentage score in every assessment, newest on the right"
          className="lg:col-span-7 pp-rise"
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trendData} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
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

        <Card className="gap-0 border-border bg-card p-0 shadow-none lg:col-span-5 pp-rise">
          <div className="border-b border-border/70 px-5 py-4">
            <SectionHeading title="Domain-wise averages" description="How your skills group together" />
          </div>
          <ul className="space-y-5 px-5 py-6">
            {data.domains.map((d) => (
              <li key={d.label} className="flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-foreground">{d.label}</p>
                <MiniBar value={d.score} width={150} />
              </li>
            ))}
          </ul>
          <p className="border-t border-border/70 px-5 py-3.5 text-xs leading-relaxed text-muted-foreground">
            Your strongest domain is{" "}
            <span className="font-medium text-foreground">
              {[...data.domains].sort((a, b) => b.score - a.score)[0]?.label}
            </span>
            , while{" "}
            <span className="font-medium text-foreground">
              {[...data.domains].sort((a, b) => a.score - b.score)[0]?.label}
            </span>{" "}
            is where focused practice will pay off most.
          </p>
        </Card>
      </section>

      {/* ------------------------ assessment history ------------------------ */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none pp-rise">
        <div className="border-b border-border/70 px-5 py-4">
          <SectionHeading title="Assessment history" description="Every exam and mock interview you've taken" />
        </div>
        {data.byDate.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-2 font-medium">Assessment</th>
                  <th className="px-2 py-2.5 font-medium">Type</th>
                  <th className="px-2 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">Score</th>
                  <th className="py-2.5 pl-2 pr-5 text-right font-medium">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {data.byDate.map((a) => {
                  const result = a.results.find((r) => r.studentId === student.id);
                  return (
                    <tr key={a.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                      <td className="max-w-[280px] truncate py-2.5 pl-5 pr-2 font-medium text-foreground" title={a.name}>
                        {a.name}
                      </td>
                      <td className="px-2 py-2.5">
                        {a.type === "exam" ? (
                          <StatusBadge tone="info">Exam</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">Mock Interview</StatusBadge>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[13px] text-muted-foreground">
                        {new Date(a.date).toLocaleDateString("en-IN", DATE_OPTS)}
                      </td>
                      <td className="tabular px-2 py-2.5 text-[13px] text-muted-foreground">
                        {result ? `${result.marks} / ${result.maxMarks}` : "—"}
                      </td>
                      <td className="py-2.5 pl-2 pr-5 text-right">
                        {result ? <ScorePill value={result.percentage} suffix="%" /> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description="Your exam and mock interview results will be listed here once imported."
          />
        )}
      </Card>
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
