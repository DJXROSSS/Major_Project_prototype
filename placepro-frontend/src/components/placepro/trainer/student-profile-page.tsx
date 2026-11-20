"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  Gauge,
  MessagesSquare,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore } from "@/lib/placepro/store";
import {
  domainGroups,
  skillEntries,
  studentDomainScore,
} from "@/lib/placepro/skill-taxonomy";
import { api, type StudentAssessment, type StudentProject } from "@/lib/placepro/api";
import type { Assessment, Student } from "@/types";
import { SectionHeading } from "@/components/placepro/shared/page-header";
import { MiniBar, PRBadge, ScorePill, StatusBadge, scoreTone } from "@/components/placepro/shared/badges";
import { ChartCard, EmptyState } from "@/components/placepro/shared/states";
import { UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import GithubPreview from "./github-preview";

/* ------------------------------------------------------------------ */
/* Trainer — Student 360° profile                                      */
/* ------------------------------------------------------------------ */

/* shared recharts styling */
const axisTick = { fontSize: 12, fill: "#727C74" };
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #E4E9E4",
  boxShadow: "0 4px 16px -8px rgba(32,41,35,0.16)",
  fontSize: 13,
  padding: "8px 12px",
};

const DOMAIN_GUIDANCE: Record<string, string> = {
  "Programming/DSA":
    "Practice 3–4 timed problems daily from the contest set and review the pattern write-ups weekly.",
  "Core Computer Science":
    "Revise the module recordings, complete the worksheet series and attempt the section quizzes.",
  "Software Development":
    "Build one small CRUD project end-to-end and add unit tests for the service layer.",
  "Employability & Soft Skills":
    "Rehearse a 90-second introduction and structure scenario answers with the STAR format.",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function barColor(value: number): string {
  if (value >= 60) return "#245C45";
  if (value >= 45) return "#D99A36";
  return "#C65B54";
}

export default function StudentProfilePage() {
  const navigate = useAppStore((s) => s.navigate);
  const route = useAppStore((s) => s.route);
  const skills = useAppStore((s) => s.skills);
  const { toast } = useToast();

  const studentId = route.params?.studentId;
  const [student, setStudent] = useState<Student>();
  const [historyResponse, setHistoryResponse] = useState<StudentAssessment[]>([]);
  const [feedback, setFeedback] = useState<import("@/types").TrainerFeedback[]>([]);
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [projectReviewDrafts, setProjectReviewDrafts] = useState<Record<string, {
    trainerScore: string;
    ownershipConfirmed: boolean;
    vivaCompleted: boolean;
  }>>({});
  const [reviewingProjectId, setReviewingProjectId] = useState<string | null>(null);
  const [loadedForStudentId, setLoadedForStudentId] = useState<string>();
  const loading = Boolean(studentId && loadedForStudentId !== studentId);

  useEffect(() => {
    if (!studentId) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      api.student(studentId),
      api.studentAssessments(studentId),
      api.studentFeedback(studentId),
      api.studentProjects(studentId),
    ])
      .then(([profile, assessments, studentFeedback, studentProjects]) => {
        if (cancelled) return;
        setStudent(profile);
        setHistoryResponse(assessments.items);
        setFeedback(studentFeedback);
        setProjects(studentProjects);
        setLoadedForStudentId(studentId);
      })
      .catch(() => {
        if (!cancelled) {
          setStudent(undefined);
          setHistoryResponse([]);
          setFeedback([]);
          setProjects([]);
          setLoadedForStudentId(studentId);
        }
      });
    return () => { cancelled = true; };
  }, [studentId]);

  async function reviewProject(project: StudentProject) {
    if (!studentId) return;
    const draft = projectReviewDrafts[project.id] ?? {
      trainerScore: "60",
      ownershipConfirmed: project.ownershipConfirmed,
      vivaCompleted: project.vivaCompleted,
    };
    const trainerScore = Number(draft.trainerScore);
    if (!Number.isFinite(trainerScore) || trainerScore < 0 || trainerScore > 100) {
      toast({ title: "Invalid trainer score", description: "Enter a score from 0 to 100.", variant: "destructive" });
      return;
    }
    setReviewingProjectId(project.id);
    try {
      const result = await api.reviewStudentProject(studentId, project.id, {
        trainerScore,
        ownershipConfirmed: draft.ownershipConfirmed,
        vivaCompleted: draft.vivaCompleted,
      });
      setProjects((current) => current.map((item) => item.id === project.id
        ? {
            ...item,
            ownershipStatus: "VERIFIED",
            reviewStatus: "APPROVED",
            ownershipConfirmed: true,
            vivaCompleted: true,
            score: {
              automatic: result.automaticScore,
              trainer: result.trainerScore,
              final: result.finalScore,
              formulaVersion: result.formulaVersion,
              breakdown: item.score?.breakdown ?? {},
              computedAt: result.reviewedAt,
            },
            scoreHistory: [
              {
                automatic: result.automaticScore,
                trainer: result.trainerScore,
                final: result.finalScore,
                formulaVersion: result.formulaVersion,
                computedAt: result.reviewedAt,
              },
              ...item.scoreHistory,
            ],
          }
        : item));
      toast({
        title: "Project score approved",
        description: `Final score ${result.finalScore.toFixed(1)}% saved as ${result.formulaVersion}.`,
      });
      try {
        const [updatedStudent, updatedProjects] = await Promise.all([
          api.student(studentId),
          api.studentProjects(studentId),
        ]);
        setStudent(updatedStudent);
        setProjects(updatedProjects);
      } catch (error) {
        toast({
          title: "Review saved, profile not refreshed",
          description: error instanceof Error ? error.message : "Refresh the student profile to see the updated readiness.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Project review failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReviewingProjectId(null);
    }
  }

  function updateProjectReviewDraft(
    project: StudentProject,
    patch: Partial<{ trainerScore: string; ownershipConfirmed: boolean; vivaCompleted: boolean }>,
  ) {
    setProjectReviewDrafts((current) => ({
      ...current,
      [project.id]: {
        trainerScore: current[project.id]?.trainerScore ?? "60",
        ownershipConfirmed: current[project.id]?.ownershipConfirmed ?? project.ownershipConfirmed,
        vivaCompleted: current[project.id]?.vivaCompleted ?? project.vivaCompleted,
        ...patch,
      },
    }));
  }

  const model = useMemo(() => {
    if (!student || !studentId) return null;
    const history: Assessment[] = historyResponse.map((assessment) => ({
      id: assessment.assessmentId,
      name: assessment.name,
      type: assessment.type,
      batch: student.batch,
      date: assessment.date,
      uploadedBy: "",
      reviewed: true,
      results: [{
        studentId: student.id,
        marks: assessment.marks,
        maxMarks: assessment.maxMarks,
        percentage: assessment.percentage,
      }],
    }));
    const sortedHistory = [...history].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const resultFor = (a: Assessment) => a.results.find((r) => r.studentId === student.id);
    const assessed = sortedHistory.filter((a) => resultFor(a) !== undefined);
    const avgPct = assessed.length
      ? Math.round(
        (assessed.reduce((sum, a) => sum + (resultFor(a)?.percentage ?? 0), 0) / assessed.length) * 10,
      ) / 10
      : 0;

    const allSkillEntries = skillEntries(student, skills).sort((a, b) => b.score - a.score);
    const techEntries = allSkillEntries.filter(
      (e) =>
        !e.domain.toLowerCase().includes("communication") &&
        !e.domain.toLowerCase().includes("soft") &&
        e.id !== "comm"
    );
    const technical = techEntries.length
      ? Math.round((techEntries.reduce((sum, e) => sum + e.score, 0) / techEntries.length) * 10) / 10
      : student.average;

    const approvedFeedback = feedback
      .filter((f) => f.studentId === student.id && f.approved)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const interviewFeedback = approvedFeedback.filter((f) => {
      const a = history.find((h) => h.name === f.assessmentName);
      return a?.type === "mock-interview";
    });

    return {
      history: sortedHistory,
      resultFor,
      avgPct,
      technical,
      skillEntries: allSkillEntries,
      strong: allSkillEntries.filter((s) => s.score >= 75),
      targets: [...allSkillEntries].filter((s) => s.score < 60).sort((a, b) => a.score - b.score),
      latestFeedback: approvedFeedback[0],
      interviewFeedback,
    };
  }, [student, studentId, historyResponse, feedback, skills]);

  const groups = useMemo(() => domainGroups(skills), [skills]);

  /* ------------------------------ not found ------------------------------ */
  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading student profile…</div>;
  }

  if (!student || !model) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2 text-[13px] text-muted-foreground"
          onClick={() => navigate("students")}
        >
          <ArrowLeft className="size-4" /> Students
        </Button>
        <Card className="border-border bg-card shadow-none">
          <EmptyState
            icon={UsersRound}
            title="Student not found"
            description="The requested student profile does not exist or has been removed."
            action={
              <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("students")}>
                Back to students
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const radarData = groups.map((g) => ({
    domain: g.label,
    score: studentDomainScore(student, g.label, skills),
  }));
  const useDomainRadar = radarData.length >= 3 && radarData.length <= 6 && radarData.every((item) => item.domain.length <= 18);
  const trendData = student.trend.map((v, i) => ({ assessment: i + 1, score: v }));
  const barData = model.skillEntries.map((s) => ({ name: s.name, score: s.score }));

  /* ------------------------------ report download ------------------------------ */
  const handleDownloadReport = () => {
    const lines: string[] = [];
    lines.push("PLACEPRO — STUDENT PERFORMANCE REPORT");
    lines.push("======================================");
    lines.push("");
    lines.push(`Name:              ${student.name}`);
    lines.push(`Roll number:       ${student.rollNumber}`);
    lines.push(`Email:             ${student.email}`);
    lines.push(`Batch / section:   ${student.batch} · Section ${student.section}`);
    lines.push(`CGPA:              ${student.cgpa.toFixed(1)}`);
    lines.push(`Placement status:  ${student.prStatus === "PR" ? "Placement Ready (PR)" : "Not Ready (NPR)"}`);
    lines.push(`Average score:     ${student.average}%`);
    lines.push(`Generated:         ${fmtDate(new Date().toISOString())}`);
    lines.push("");
    lines.push("DOMAIN AVERAGES");
    lines.push("---------------");
    for (const g of groups) {
      lines.push(`${g.label.padEnd(24)} ${studentDomainScore(student, g.label, skills)}%`);
    }
    lines.push("");
    lines.push("SKILL SCORES");
    lines.push("------------");
    for (const s of model.skillEntries) {
      lines.push(`${s.name.padEnd(24)} ${s.score}%  (${s.domain})`);
    }
    lines.push("");
    lines.push("ASSESSMENT HISTORY");
    lines.push("------------------");
    if (model.history.length === 0) {
      lines.push("No assessments recorded.");
    } else {
      model.history.forEach((a, i) => {
        const r = model.resultFor(a);
        lines.push(
          `${String(i + 1).padStart(2, "0")}. ${a.name} (${a.type === "exam" ? "Exam" : "Mock Interview"}) — ${fmtDate(a.date)} — ${r ? `${r.marks}/${r.maxMarks} (${r.percentage}%)` : "not assessed"}`,
        );
      });
      lines.push("");
      lines.push(`Average across assessments: ${model.avgPct}%`);
    }
    if (model.latestFeedback) {
      lines.push("");
      lines.push("TRAINER FEEDBACK (LATEST)");
      lines.push("-------------------------");
      lines.push(`Assessment: ${model.latestFeedback.assessmentName} · ${fmtDate(model.latestFeedback.date)} · by ${model.latestFeedback.trainer}`);
      lines.push(`Technical:     ${model.latestFeedback.technical}`);
      lines.push(`Communication: ${model.latestFeedback.communication}`);
      lines.push(`Behavior:      ${model.latestFeedback.behavior}`);
      lines.push(`Strengths:     ${model.latestFeedback.strengths.join("; ")}`);
      lines.push(`Weaknesses:    ${model.latestFeedback.weaknesses.join("; ")}`);
      lines.push(`Improvements:  ${model.latestFeedback.improvements.join("; ")}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${student.name.replace(/\s+/g, "-").toLowerCase()}-placepro-report.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const summaryTiles = [
    { label: "Overall performance", icon: Gauge, value: `${student.average}%` },
    { label: "Total assessments", icon: ClipboardList, value: model.history.length },
    { label: "Technical score", icon: Target, value: `${model.technical}%` },
    { label: "Communication score", icon: MessagesSquare, value: `${student.scores.comm}%` },
    { label: "Project score", icon: Target, value: student.projectScore === null || student.projectScore === undefined ? "—" : `${student.projectScore}%` },
  ];

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground"
        onClick={() => navigate("students")}
      >
        <ArrowLeft className="size-4" /> Students
      </Button>

      {/* ------------------------------ identity card ------------------------------ */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <UserAvatar name={student.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{student.name}</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {student.rollNumber} · {student.email}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {student.batch} · Section {student.section}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="tabular inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                  CGPA {student.cgpa.toFixed(1)}
                </span>
                <PRBadge status={student.prStatus} />
                <GithubPreview key={student.id} studentId={student.id} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 text-[13px]" onClick={() => navigate("students")}>
              View all students
            </Button>
            <Button
              size="sm"
              className="h-9 bg-primary hover:bg-primary-hover"
              onClick={handleDownloadReport}
            >
              <Download className="size-4" /> Download report
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 lg:grid-cols-5">
          {summaryTiles.map((t) => (
            <div key={t.label} className="flex items-center justify-between gap-3 bg-card px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="tabular mt-1 text-2xl font-semibold leading-none tracking-tight text-foreground">
                  {t.value}
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <t.icon className="size-4" />
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------------ tabs ------------------------------ */}
      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
            <TabsTrigger value="skills">Skill Analysis</TabsTrigger>
            <TabsTrigger value="feedback">Interview Feedback</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>
        </div>

        {/* ------------------------------ overview ------------------------------ */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Domain performance"
              description="Scores grouped by evaluation domain"
              bodyClassName="h-[260px] px-2 pb-0 pt-4"
            >
              {!radarData.length ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No domain scores recorded yet.</div>
              ) : useDomainRadar ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="#E4E9E4" />
                    <PolarAngleAxis dataKey="domain" tick={axisTick} />
                    <PolarRadiusAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                    <ReTooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={tooltipStyle} />
                    <Radar dataKey="score" stroke="#245C45" strokeWidth={2} fill="#245C45" fillOpacity={0.15} animationDuration={700} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={radarData} layout="vertical" margin={{ top: 0, right: 18, bottom: 0, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="domain" width={136} tick={axisTick} axisLine={false} tickLine={false} interval={0} tickFormatter={(value: string) => value.length > 20 ? `${value.slice(0, 18)}…` : value} />
                    <ReTooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={tooltipStyle} />
                    <Bar dataKey="score" fill="#245C45" radius={[0, 4, 4, 0]} barSize={18} animationDuration={700} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Progress trend"
              description="Percentage scored across consecutive assessments"
              bodyClassName="h-[260px] px-2 pb-0 pt-4"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" vertical={false} />
                  <XAxis dataKey="assessment" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                  <ReTooltip
                    formatter={(v: number) => [`${v}%`, "Score"]}
                    labelFormatter={(l: number) => `Assessment ${l}`}
                    contentStyle={tooltipStyle}
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
            </ChartCard>
          </div>

          {/* domain breakdown */}
          <Card className="gap-0 border-border bg-card p-0 shadow-none">
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Domain breakdown"
                description="Individual skill scores grouped by evaluation domain"
              />
            </div>
            <div>
              {groups.map((g) => {
                const groupSkills = model.skillEntries.filter(
                  (s) => s.domain.toLowerCase() === g.label.toLowerCase()
                );
                if (groupSkills.length === 0) return null;
                return (
                  <div key={g.label} className="border-b border-border/50 px-5 py-3.5 last:border-0">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-foreground">{g.label}</p>
                      <span className="tabular text-[13px] font-semibold text-foreground">
                        {studentDomainScore(student, g.label, skills)}%
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                      {groupSkills.map((entry) => (
                        <span key={entry.id} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                            {entry.name}
                          </span>
                          <MiniBar value={entry.score} width={36} />
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* strong areas / areas to target */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 border-border bg-card p-0 shadow-none">
              <div className="border-b border-border/70 px-5 py-4">
                <SectionHeading
                  title="Strong areas"
                  description="Skills consistently at 75% or above"
                />
              </div>
              {model.strong.length === 0 ? (
                <EmptyState
                  icon={Check}
                  title="No strong areas yet"
                  description="No skill has reached the 75% benchmark — keep tracking progress."
                  className="py-8"
                />
              ) : (
                <ul className="px-5 py-1">
                  {model.strong.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 border-b border-border/50 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Check className="size-3.5 shrink-0 text-success" />
                          {s.name}
                        </p>
                        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                          Averaged {s.score}% across {model.history.length} assessments
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-[13px] font-semibold text-success">{s.score}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="gap-0 border-border bg-card p-0 shadow-none">
              <div className="border-b border-border/70 px-5 py-4">
                <SectionHeading
                  title="Areas to target"
                  description="Skills below the 60% readiness threshold"
                />
              </div>
              {model.targets.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="No weak areas"
                  description="All evaluated skills are at or above the 60% threshold."
                  className="py-8"
                />
              ) : (
                <ul className="px-5 py-1">
                  {model.targets.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 border-b border-border/50 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <X className="size-3.5 shrink-0 text-danger" />
                          {s.name}
                        </p>
                        <p className="mt-0.5 pl-6 text-xs leading-relaxed text-muted-foreground">
                          {DOMAIN_GUIDANCE[s.domain] ?? "Review recent assessment feedback and focus practice on the skills in this domain that need improvement."}
                        </p>
                      </div>
                      <span
                        className={`tabular shrink-0 text-[13px] font-semibold ${s.score >= 45 ? "text-warning" : "text-danger"}`}
                      >
                        {s.score}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* trainer feedback */}
          {model.latestFeedback ? (
            <Card className="gap-0 border-border bg-card p-0 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/70 px-5 py-4">
                <SectionHeading
                  title="Trainer feedback"
                  description={`${model.latestFeedback.assessmentName} · ${fmtDate(model.latestFeedback.date)}`}
                />
                <span className="text-xs text-muted-foreground">by {model.latestFeedback.trainer}</span>
              </div>
              <div className="space-y-5 px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Technical</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      {model.latestFeedback.technical}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Communication</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      {model.latestFeedback.communication}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Behavior</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      {model.latestFeedback.behavior}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Strengths</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {model.latestFeedback.strengths.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weaknesses</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {model.latestFeedback.weaknesses.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                          <X className="mt-0.5 size-3.5 shrink-0 text-danger" /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Suggested improvements
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {model.latestFeedback.improvements.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
        </TabsContent>

        {/* ------------------------------ assessments ------------------------------ */}
        <TabsContent value="assessments" className="mt-4">
          <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Assessment history"
                description={`${model.history.length} assessment${model.history.length === 1 ? "" : "s"} · average ${model.avgPct}%`}
              />
            </div>
            {model.history.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assessments yet"
                description="This student has not appeared in any recorded assessment."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                      <th className="py-2.5 pl-5 pr-2 font-medium">Assessment</th>
                      <th className="px-2 py-2.5 font-medium">Type</th>
                      <th className="px-2 py-2.5 font-medium">Date</th>
                      <th className="px-2 py-2.5 font-medium">Marks</th>
                      <th className="py-2.5 pl-2 pr-5 font-medium">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.history.map((a) => {
                      const r = model.resultFor(a);
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                        >
                          <td className="py-2.5 pl-5 pr-2 text-[13px] font-medium text-foreground">{a.name}</td>
                          <td className="px-2 py-2.5">
                            {a.type === "exam" ? (
                              <StatusBadge tone="info">Exam</StatusBadge>
                            ) : (
                              <StatusBadge tone="warning">Mock Interview</StatusBadge>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{fmtDate(a.date)}</td>
                          <td className="tabular px-2 py-2.5 text-[13px] text-muted-foreground">
                            {r ? `${r.marks} / ${r.maxMarks}` : "—"}
                          </td>
                          <td className="py-2.5 pl-2 pr-5">
                            {r ? <ScorePill value={r.percentage} suffix="%" /> : <span className="text-[13px] text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------ skill analysis ------------------------------ */}
        <TabsContent value="skills" className="mt-4 space-y-4">
          <ChartCard
            title="Skill scores"
            description="All evaluated skills — dashed line marks the 60% readiness threshold"
            bodyClassName="h-[260px] px-2 pb-0 pt-4"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ ...axisTick, fontSize: 10 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={52}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                <ReTooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={tooltipStyle} />
                <ReferenceLine y={60} stroke="#D99A36" strokeDasharray="6 4" />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={26} animationDuration={700}>
                  {barData.map((d) => (
                    <Cell key={d.name} fill={barColor(d.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading title="Skill detail" description="Per-skill breakdown with readiness status" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">Skill</th>
                    <th className="px-2 py-2.5 font-medium">Domain</th>
                    <th className="px-2 py-2.5 font-medium">Score</th>
                    <th className="py-2.5 pl-2 pr-5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {model.skillEntries.map((s) => {
                    const tone = scoreTone(s.score);
                    const label = s.score >= 75 ? "Strong" : s.score >= 60 ? "Developing" : "Needs attention";
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                      >
                        <td className="py-2.5 pl-5 pr-2 text-[13px] font-medium text-foreground">{s.name}</td>
                        <td className="px-2 py-2.5 text-[13px] text-muted-foreground">{s.domain}</td>
                        <td className="px-2 py-2.5">
                          <MiniBar value={s.score} width={36} />
                        </td>
                        <td className="py-2.5 pl-2 pr-5">
                          <StatusBadge tone={tone}>{label}</StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ------------------------------ interview feedback ------------------------------ */}
        <TabsContent value="feedback" className="mt-4 space-y-4">
          {model.interviewFeedback.length === 0 ? (
            <Card className="border-border bg-card shadow-none">
              <EmptyState
                icon={MessagesSquare}
                title="No interview feedback yet"
                description="Approved mock interview feedback for this student will appear here once recorded."
              />
            </Card>
          ) : (
            model.interviewFeedback.map((fb) => (
              <Card key={fb.id} className="gap-0 border-border bg-card p-0 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/70 px-5 py-4">
                  <SectionHeading title={fb.assessmentName} description={`Conducted ${fmtDate(fb.date)}`} />
                  <span className="text-xs text-muted-foreground">by {fb.trainer}</span>
                </div>
                <div className="space-y-5 px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Technical</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">{fb.technical}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Communication</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">{fb.communication}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Behavior</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">{fb.behavior}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Strengths</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {fb.strengths.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weaknesses</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {fb.weaknesses.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                            <X className="mt-0.5 size-3.5 shrink-0 text-danger" /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Suggested improvements
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {fb.improvements.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-[13px] text-foreground">
                            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-4 space-y-4">
          <Card className="gap-1 border-border bg-card p-5 shadow-none">
            <h2 className="text-base font-semibold text-foreground">Project scoring</h2>
            <p className="text-sm text-muted-foreground">
              Final score = 40% automated repository score + 60% trainer score. Approved project scores are averaged for readiness; a score of at least 60% is required for PR.
            </p>
          </Card>
          {projects.length === 0 ? (
            <Card className="border-dashed border-border bg-card p-8 text-center shadow-none">
              <p className="text-sm font-medium text-foreground">No projects submitted</p>
              <p className="mt-1 text-sm text-muted-foreground">Student projects appear here after submission from Profile Intelligence.</p>
            </Card>
          ) : projects.map((project) => {
            const draft = projectReviewDrafts[project.id] ?? {
              trainerScore: "60",
              ownershipConfirmed: project.ownershipConfirmed,
              vivaCompleted: project.vivaCompleted,
            };
            const isReviewing = reviewingProjectId === project.id;
            return (
              <Card key={project.id} className="gap-0 border-border bg-card p-0 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
                  <div className="min-w-0">
                    <a
                      className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                      href={project.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {project.name} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ownership: {project.ownershipStatus.replaceAll("_", " ")} · Review: {project.reviewStatus.toLowerCase()}
                    </p>
                    {project.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{project.description}</p> : null}
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">Automated score</p>
                    <p className="font-semibold text-foreground">{project.score?.automatic ?? "—"}%</p>
                    {project.score?.final !== null && project.score?.final !== undefined ? (
                      <p className="mt-1 text-muted-foreground">Latest final: {project.score.final}%</p>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["README", project.readmePresent],
                    ["Tests", project.hasTests],
                    ["Docker", project.hasDocker],
                    ["CI workflow", project.hasCi],
                    ["Original repository", project.isFork === null ? null : !project.isFork],
                    ["Live demo", Boolean(project.liveDemoUrl)],
                  ].map(([label, present]) => (
                    <p key={String(label)} className="text-xs text-muted-foreground">
                      {label}: <span className="font-medium text-foreground">{present === null ? "Unknown" : present ? "Yes" : "No"}</span>
                    </p>
                  ))}
                </div>
                {project.scoreHistory.length > 1 ? (
                  <details className="border-t border-border/70 px-5 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Score history</summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {project.scoreHistory.map((entry, index) => (
                        <li key={`${entry.computedAt}-${index}`}>
                          {fmtDate(entry.computedAt)} · {entry.formulaVersion} · Auto {entry.automatic ?? "—"} · Trainer {entry.trainer ?? "—"} · Final {entry.final ?? "pending"}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className="grid gap-4 border-t border-border/70 px-5 py-4 md:grid-cols-[12rem_1fr_auto] md:items-end">
                  <label className="grid gap-1.5 text-xs font-medium text-foreground">
                    Trainer score (0–100)
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={draft.trainerScore}
                      onChange={(event) => updateProjectReviewDraft(project, { trainerScore: event.target.value })}
                      aria-label={`Trainer score for ${project.name}`}
                    />
                  </label>
                  <div className="grid gap-2 text-sm text-foreground">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.ownershipConfirmed}
                        onChange={(event) => updateProjectReviewDraft(project, { ownershipConfirmed: event.target.checked })}
                      />
                      Confirm project ownership
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.vivaCompleted}
                        onChange={(event) => updateProjectReviewDraft(project, { vivaCompleted: event.target.checked })}
                      />
                      Project viva completed
                    </label>
                    <p className="text-xs text-muted-foreground">Viva status is recorded but isn’t required for score approval.</p>
                  </div>
                  <Button
                    onClick={() => void reviewProject(project)}
                    disabled={isReviewing || !draft.ownershipConfirmed}
                  >
                    {isReviewing ? "Saving…" : project.reviewStatus === "APPROVED" ? "Recalculate score" : "Approve project"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
