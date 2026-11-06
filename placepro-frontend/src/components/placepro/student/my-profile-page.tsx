"use client";

import { GraduationCap, Lock, UserRound } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { skillEntries } from "@/lib/placepro/skill-taxonomy";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { EmptyState } from "@/components/placepro/shared/states";
import { PRBadge } from "@/components/placepro/shared/badges";
import { InfoRow, UserAvatar } from "@/components/placepro/shared/misc";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* My Profile                                                          */
/* ------------------------------------------------------------------ */

export default function MyProfilePage() {
  const user = useAppStore((s) => s.user);
  const students = useAppStore((s) => s.students);
  const assessments = useAppStore((s) => s.assessments);
  const skills = useAppStore((s) => s.skills);

  const student = students.find((entry) => entry.id === user?.studentId) ?? students[0];

  if (!student) {
    return (
      <EmptyState
        icon={UserRound}
        title="Student record not found"
        description="We couldn't load your enrolment record. Please sign in again or contact the placement cell."
      />
    );
  }

  const assessmentsTaken = assessments.length;
  const evaluatedSkills = skillEntries(student, skills);

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Your enrolment record as maintained by the placement cell." />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------- enrolment record ------------------------- */}
        <Card className="gap-0 border-border bg-card p-0 shadow-none lg:col-span-2 pp-rise">
          <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-center">
            <UserAvatar name={student.name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{student.name}</h2>
                <PRBadge status={student.prStatus} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                {student.rollNumber} · {student.batch}
              </p>
            </div>
          </div>
          <div className="mt-6 divide-y divide-border/60 border-t border-border/70 px-6">
            <InfoRow label="Name">{student.name}</InfoRow>
            <InfoRow label="Roll number">
              <span className="tabular">{student.rollNumber}</span>
            </InfoRow>
            <InfoRow label="Institutional email">{student.email}</InfoRow>
            <InfoRow label="Batch">{student.batch}</InfoRow>
            <InfoRow label="Section">{student.section}</InfoRow>
            <InfoRow label="CGPA">
              <span className="tabular">{student.cgpa}</span>
            </InfoRow>
            <InfoRow label="Readiness classification">
              <PRBadge status={student.prStatus} />
            </InfoRow>
          </div>
          <p className="px-6 pb-6 pt-4 text-xs leading-relaxed text-muted-foreground">
            Classification criteria: average ≥ 68% across skills, CGPA ≥ 6.6 and Communication ≥ 58.
          </p>
        </Card>

        {/* --------------------- snapshot + privacy note --------------------- */}
        <div className="space-y-4">
          <Card className="gap-0 border-border bg-card p-0 shadow-none pp-rise">
            <div className="border-b border-border/70 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">At a glance</h2>
            </div>
            <div className="divide-y divide-border/60 px-5">
              <InfoRow label="Overall performance">
                <span className="tabular">{student.average}%</span>
              </InfoRow>
              <InfoRow label="Assessments taken">
                <span className="tabular">{assessmentsTaken}</span>
              </InfoRow>
              <InfoRow label="Skills evaluated">
                <span className="tabular">{evaluatedSkills.length}</span>
              </InfoRow>
              <InfoRow label="Readiness">
                <PRBadge status={student.prStatus} />
              </InfoRow>
            </div>
          </Card>

          <Card className="gap-0 border-border bg-card p-5 shadow-none pp-rise">
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Lock className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Privacy</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Students can only view their own record. Academic data is maintained by trainers and the placement
                  cell.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
