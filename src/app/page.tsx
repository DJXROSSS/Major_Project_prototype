"use client";

import { useAppStore } from "@/lib/placepro/store";
import LoginPage from "@/components/placepro/auth/login-page";
import { AppShell } from "@/components/placepro/shell/app-shell";
import RouteView from "@/components/placepro/route-view";

export default function Home() {
  const user = useAppStore((s) => s.user);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <RouteView />
    </AppShell>
  );
}
