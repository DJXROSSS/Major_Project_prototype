"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileCode2,
  MessagesSquare,
  UserRound,
} from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { STUDENT_BY_ID } from "@/lib/placepro/mock-data";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { EmptyState } from "@/components/placepro/shared/states";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Interview Feedback                                                  */
/* ------------------------------------------------------------------ */

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export default function InterviewFeedbackPage() {
  const user = useAppStore((s) => s.user);
  const feedback = useAppStore((s) => s.feedback);

  const student = user?.studentId ? STUDENT_BY_ID[user.studentId] : undefined;

  /* SECURITY: only approved feedback for THIS student is ever rendered */
  const approved = useMemo(() => {
    if (!student) return [];
    return feedback
      .filter((f) => f.studentId === student.id && f.approved === true)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [student, feedback]);

  if (!student) {
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
        title="Interview Feedback"
        subtitle="What your trainers observed in mock interviews — only approved feedback is shown."
      />

      {approved.length === 0 ? (
        <Card className="border-border bg-card shadow-none">
          <EmptyState
            icon={MessagesSquare}
            title="No feedback approved yet"
            description="Your trainer's review will appear here after it is approved."
          />
        </Card>
      ) : (
        <>
          {/* ------------------------- summary strip ------------------------- */}
          <Card className="flex flex-col gap-3 border-border bg-card p-4 shadow-none sm:flex-row sm:items-center sm:justify-between pp-rise">
            <p className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">{approved.length}</span> approved feedback{" "}
              {approved.length === 1 ? "record" : "records"} from your mock interviews
            </p>
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />
              Latest: {new Date(approved[0].date).toLocaleDateString("en-IN", DATE_OPTS)}
            </p>
          </Card>

          {/* ------------------------- feedback cards ------------------------- */}
          <div className="space-y-4">
            {approved.map((f) => (
              <Card key={f.id} className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
                {/* header */}
                <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{f.assessmentName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(f.date).toLocaleDateString("en-IN", DATE_OPTS)} · Reviewed by {f.trainer}
                    </p>
                  </div>
                  <StatusBadge tone="success" className="shrink-0">
                    Approved
                  </StatusBadge>
                </div>

                {/* observation sections */}
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
                  <section>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <FileCode2 className="size-3.5" aria-hidden /> Technical
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground">{f.technical}</p>
                  </section>
                  <section>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <MessagesSquare className="size-3.5" aria-hidden /> Communication
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground">{f.communication}</p>
                  </section>
                  <section className="sm:col-span-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <UserRound className="size-3.5" aria-hidden /> Behavior Review
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground">{f.behavior}</p>
                  </section>
                </div>

                {/* lists */}
                <div className="grid gap-5 border-t border-border/70 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
                  <section>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Strengths</p>
                    <ul className="mt-2.5 space-y-2">
                      {f.strengths.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 rounded-lg bg-success-soft px-2.5 py-1.5 text-[13px] leading-snug text-success"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weaknesses</p>
                    <ul className="mt-2.5 space-y-2">
                      {f.weaknesses.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[13px] leading-snug text-warning"
                        >
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="sm:col-span-2 lg:col-span-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Improvement Guidance
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {f.improvements.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 rounded-lg bg-primary-soft px-2.5 py-1.5 text-[13px] leading-snug text-primary"
                        >
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
