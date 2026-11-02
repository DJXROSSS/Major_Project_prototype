"use client";

import { useAppStore } from "@/lib/placepro/store";
import { EmptyState } from "@/components/placepro/shared/states";
import { FileQuestion } from "lucide-react";

import TrainerDashboard from "@/components/placepro/trainer/trainer-dashboard";
import StudentsPage from "@/components/placepro/trainer/students-page";
import StudentProfilePage from "@/components/placepro/trainer/student-profile-page";
import AssessmentsPage from "@/components/placepro/trainer/assessments-page";
import ImportWorkflow from "@/components/placepro/trainer/import-workflow";
import CompanyMatchingPage from "@/components/placepro/trainer/company-matching-page";

import StudentDashboard from "@/components/placepro/student/student-dashboard";
import MyPerformancePage from "@/components/placepro/student/my-performance-page";
import InterviewFeedbackPage from "@/components/placepro/student/interview-feedback-page";
import MyProfilePage from "@/components/placepro/student/my-profile-page";

import AdminDashboard from "@/components/placepro/admin/admin-dashboard";
import UserManagementPage from "@/components/placepro/admin/user-management-page";
import BatchManagementPage from "@/components/placepro/admin/batch-management-page";
import SkillConfigPage from "@/components/placepro/admin/skill-config-page";
import CompanyRequirementsPage from "@/components/placepro/admin/company-requirements-page";
import AuditLogsPage from "@/components/placepro/admin/audit-logs-page";

/* ------------------------------------------------------------------ */
/* RouteView — resolves the in-app route to a portal screen            */
/* ------------------------------------------------------------------ */

export default function RouteView() {
  const user = useAppStore((s) => s.user);
  const route = useAppStore((s) => s.route);
  if (!user) return null;

  switch (route.page) {
    /* shared */
    case "dashboard":
      return user.role === "trainer" ? <TrainerDashboard /> : user.role === "admin" ? <AdminDashboard /> : <StudentDashboard />;

    /* trainer portal */
    case "students":
      return <StudentsPage />;
    case "student-profile":
      return <StudentProfilePage />;
    case "assessments":
      return <AssessmentsPage />;
    case "import":
      return <ImportWorkflow />;
    case "matching":
      return <CompanyMatchingPage />;

    /* student portal */
    case "my-performance":
      return <MyPerformancePage />;
    case "my-feedback":
      return <InterviewFeedbackPage />;
    case "my-profile":
      return <MyProfilePage />;

    /* admin portal */
    case "users":
      return <UserManagementPage />;
    case "batches":
      return <BatchManagementPage />;
    case "skills":
      return <SkillConfigPage />;
    case "companies":
      return <CompanyRequirementsPage />;
    case "audit":
      return <AuditLogsPage />;

    default:
      return (
        <EmptyState
          icon={FileQuestion}
          title="Page not found"
          description="This screen does not exist in the current build."
        />
      );
  }
}
