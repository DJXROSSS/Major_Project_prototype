"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/placepro/store";
import { bindNavigation, resolveRoute, routeHref } from "@/lib/placepro/routing";
import ChangePasswordPage from "@/components/placepro/auth/change-password-page";
import LoginPage from "@/components/placepro/auth/login-page";
import { AppShell } from "@/components/placepro/shell/app-shell";
import RouteView from "@/components/placepro/route-view";

export default function Portal() {
  const user = useAppStore(s => s.user);
  const storedRoute = useAppStore(s => s.route);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [checking, setChecking] = useState(!user);
  const route = useMemo(() => user ? resolveRoute(pathname, user.role, Object.fromEntries(search.entries())) : null, [pathname, search, user]);
  useEffect(() => { bindNavigation(href => router.push(href)); }, [router]);
  useEffect(() => {
    if (useAppStore.getState().user) { setChecking(false); return; }
    void useAppStore.getState().restoreSession().finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (user?.mustChangePassword) return;
    if (user && (pathname === "/" || pathname === "/login")) router.replace(routeHref(user.role, "dashboard"));
    if (route) {
      useAppStore.setState({ route });
      const state = useAppStore.getState();
      if (user?.role !== "student" && route.page !== "students" && !state.rosterLoaded && !state.isRefreshing) void state.refreshData();
    }
  }, [user, pathname, route, router]);
  if (checking) return <div className="grid min-h-screen place-items-center">Loading PlacePro...</div>;
  if (!user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage />;
  if (!route) return <div className="space-y-4 p-8"><h1>Page not found or unavailable for your role</h1><Link href={routeHref(user.role, "dashboard")}>Return to dashboard</Link></div>;
  if (JSON.stringify(storedRoute) !== JSON.stringify(route)) return <div className="p-8">Loading page...</div>;
  // Wait until route-dependent legacy components see the same URL parameters.
  return <AppShell><RouteView route={route} /></AppShell>;
}
