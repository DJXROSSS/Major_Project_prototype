"use client";

import { useState } from "react";
import { NavList } from "./nav-list";
import { useAppStore } from "@/lib/placepro/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* AppSidebar — floating collapsible vertical navigation               */
/* Desktop / tablet only. Mobile navigation lives in AppShell's Sheet. */
/* ------------------------------------------------------------------ */

export const SIDEBAR_COLLAPSED = 72;
export const SIDEBAR_EXPANDED = 244;
export const SIDEBAR_OFFSET = 18;

export function AppSidebar() {
  const pinned = useAppStore((s) => s.sidebarPinned);
  const openDialog = useAppStore((s) => s.openDialog);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Sidebar navigation"
      className={cn(
        "pp-sidebar fixed z-40 hidden rounded-[18px] border border-border bg-card md:block",
        "shadow-[0_1px_2px_rgba(32,41,35,0.04),0_10px_28px_-14px_rgba(32,41,35,0.14)]",
      )}
      style={{
        left: SIDEBAR_OFFSET,
        top: SIDEBAR_OFFSET,
        bottom: SIDEBAR_OFFSET,
        width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
      }}
    >
      <NavList expanded={expanded} onDialog={(d) => openDialog(d)} />
    </aside>
  );
}
