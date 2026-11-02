import {
  BookOpenCheck,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  MessagesSquare,
  ScrollText,
  Settings2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Page, Role } from "@/types";

export interface NavItem {
  label: string;
  page: Page;
  icon: LucideIcon;
}

export const ROLE_NAV: Record<Role, NavItem[]> = {
  trainer: [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Students", page: "students", icon: UsersRound },
    { label: "Assessments", page: "assessments", icon: ClipboardList },
    { label: "Import Results", page: "import", icon: FileSpreadsheet },
    { label: "Company Matching", page: "matching", icon: Building2 },
  ],
  student: [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "My Performance", page: "my-performance", icon: Gauge },
    { label: "Interview Feedback", page: "my-feedback", icon: MessagesSquare },
    { label: "My Profile", page: "my-profile", icon: UserRound },
  ],
  admin: [
    { label: "Dashboard", page: "dashboard", icon: LayoutDashboard },
    { label: "Users", page: "users", icon: UsersRound },
    { label: "Batches", page: "batches", icon: GraduationCap },
    { label: "Skills & Parameters", page: "skills", icon: BookOpenCheck },
    { label: "Company Requirements", page: "companies", icon: Building2 },
    { label: "Audit Logs", page: "audit", icon: ScrollText },
  ],
};

export const FOOTER_NAV: { label: string; icon: LucideIcon; dialog: "help" | "settings" }[] = [
  { label: "Help & Support", icon: LifeBuoy, dialog: "help" },
  { label: "Settings", icon: Settings2, dialog: "settings" },
];
