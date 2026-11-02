"use client";

import { useEffect, useState } from "react";
import { AppSidebar, SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED, SIDEBAR_OFFSET } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { NavList, SidebarMark } from "./nav-list";
import { useAppStore } from "@/lib/placepro/store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* AppShell — floating sidebar + header + content + sticky footer      */
/* ------------------------------------------------------------------ */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pinned = useAppStore((s) => s.sidebarPinned);
  const setSidebarPinned = useAppStore((s) => s.setSidebarPinned);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /* Tablet (below lg) starts collapsed; desktop starts pinned. */
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarPinned(false);
    }
  }, []);

  const contentPad = pinned ? SIDEBAR_EXPANDED + SIDEBAR_OFFSET + 24 : SIDEBAR_COLLAPSED + SIDEBAR_OFFSET + 24;

  return (
    <div className="min-h-screen">
      <AppSidebar />

      {/* Mobile navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[264px] gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <NavList expanded onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div
        className="pp-content pp-content-pad flex min-h-screen flex-col"
        style={{ ["--pp-sidebar-pad" as string]: `${contentPad}px` }}
      >
        <AppHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="mt-auto">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-1 border-t border-border/70 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>PlacePro · Placement Intelligence · University Edition</p>
            <p className="pb-[env(safe-area-inset-bottom)]">Demo environment — data resets on reload</p>
          </div>
        </footer>
      </div>

      <HelpDialog />
      <SettingsDialog />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Help & Support                                                      */
/* ------------------------------------------------------------------ */

function HelpDialog() {
  const uiDialog = useAppStore((s) => s.uiDialog);
  const closeDialog = useAppStore((s) => s.closeDialog);
  return (
    <Dialog open={uiDialog === "help"} onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SidebarMark size={26} /> Help &amp; Support
          </DialogTitle>
          <DialogDescription>
            Reach the placement cell team for help with PlacePro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-[13px] font-medium text-foreground">Placement Cell Support</p>
            <p className="mt-1 text-[13px] text-muted-foreground">placement.cell@campus.edu · Ext. 2140 (Mon–Fri, 9:00–17:00)</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-[13px] font-medium text-foreground">Trainer resources</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Import templates and the column-mapping guide are available in the shared drive under <span className="font-mono text-xs">/placepro/resources</span>.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-[13px] font-medium text-foreground">Reporting a problem</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Include the assessment name, upload date and a screenshot so the team can reproduce the issue.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Settings — functional display preferences                           */
/* ------------------------------------------------------------------ */

function SettingsDialog() {
  const uiDialog = useAppStore((s) => s.uiDialog);
  const closeDialog = useAppStore((s) => s.closeDialog);
  const pinned = useAppStore((s) => s.sidebarPinned);
  const setSidebarPinned = useAppStore((s) => s.setSidebarPinned);
  const [emailDigest, setEmailDigest] = useState(true);
  const [importAlerts, setImportAlerts] = useState(true);
  const { toast } = useToast();

  return (
    <Dialog open={uiDialog === "settings"} onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Workspace display and notification preferences.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pin-setting" className="text-[13px] font-medium">Keep sidebar expanded</Label>
              <p className="text-xs text-muted-foreground">Pin the sidebar open on desktop and tablet.</p>
            </div>
            <Switch id="pin-setting" checked={pinned} onCheckedChange={setSidebarPinned} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="digest-setting" className="text-[13px] font-medium">Weekly performance digest</Label>
              <p className="text-xs text-muted-foreground">Batch performance summary every Monday.</p>
            </div>
            <Switch id="digest-setting" checked={emailDigest} onCheckedChange={setEmailDigest} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="import-setting" className="text-[13px] font-medium">Import alerts</Label>
              <p className="text-xs text-muted-foreground">Notify me when an import needs review.</p>
            </div>
            <Switch id="import-setting" checked={importAlerts} onCheckedChange={setImportAlerts} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            onClick={() => {
              closeDialog();
              toast({ title: "Preferences saved", description: "Your workspace settings were updated." });
            }}
          >
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
