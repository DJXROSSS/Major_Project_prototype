import type { Page, Role, Route } from "@/types";

const pages: Record<Role, Page[]> = {
  trainer: ["dashboard", "students", "student-profile", "assessments", "import", "matching"],
  admin: ["dashboard", "students", "student-profile", "users", "batches", "skills", "domains", "companies", "audit"],
  student: ["dashboard", "my-performance", "my-feedback", "my-profile", "profile-intelligence"],
};
export function canVisit(role: Role, page: Page) { return pages[role].includes(page); }
export function routeHref(role: Role, page: Page, params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `/${role}/${page}${query ? `?${query}` : ""}`;
}
export function resolveRoute(pathname: string, role: Role, params: Record<string, string>): Route | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== role || !canVisit(role, parts[1] as Page)) return null;
  return { page: parts[1] as Page, params };
}
// Existing action buttons share the App Router mounted by the portal.
let pushRoute: ((href: string) => void) | undefined;
export function bindNavigation(push: (href: string) => void) { pushRoute = push; }
export function pushNavigation(href: string) { pushRoute?.(href); }
