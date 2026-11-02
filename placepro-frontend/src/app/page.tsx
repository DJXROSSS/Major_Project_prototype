"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/placepro/store";
import LoginPage from "@/components/placepro/auth/login-page";
import { AppShell } from "@/components/placepro/shell/app-shell";
import RouteView from "@/components/placepro/route-view";

export default function Home() {
  const user = useAppStore((s) => s.user);
  const restoreSession = useAppStore((s) => s.restoreSession);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    void restoreSession().finally(() => setCheckingSession(false));
  }, [restoreSession]);

  if (checkingSession) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading PlacePro…</div>;

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <RouteView />
    </AppShell>
  );
}
