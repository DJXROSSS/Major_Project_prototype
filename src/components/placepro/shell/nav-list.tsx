"use client";

import { useAppStore } from "@/lib/placepro/store";
import { FOOTER_NAV, ROLE_NAV } from "@/lib/placepro/nav";
import { cn } from "@/lib/utils";
import { Pin, PinOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ */
/* NavList — shared between the floating sidebar and the mobile drawer */
/* ------------------------------------------------------------------ */

export function SidebarMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-primary font-semibold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      P
    </span>
  );
}

export function NavList({
  expanded,
  onNavigate,
  onDialog,
}: {
  expanded: boolean;
  onNavigate?: () => void;
  onDialog?: (dialog: "help" | "settings") => void;
}) {
  const user = useAppStore((s) => s.user);
  const route = useAppStore((s) => s.route);
  const pinned = useAppStore((s) => s.sidebarPinned);
  const navigate = useAppStore((s) => s.navigate);
  const setPinned = useAppStore((s) => s.setSidebarPinned);
  if (!user) return null;

  const items = ROLE_NAV[user.role];

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full flex-col">
        {/* header */}
        <div className={cn("flex h-[52px] shrink-0 items-center gap-2.5 px-3.5", !expanded && "justify-center px-0")}>
          <SidebarMark />
          {expanded ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">PlacePro</p>
              <p className="truncate text-[11px] text-muted-foreground">Placement Intelligence</p>
            </div>
          ) : null}
        </div>

        {/* primary nav */}
        <nav aria-label="Primary" className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pp-scrollbar">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = route.page === item.page;
              const link = (
                <button
                  type="button"
                  onClick={() => {
                    navigate(item.page);
                    onNavigate?.();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pp-focus group flex h-9 w-full items-center gap-3 rounded-lg text-[13.5px] font-medium transition-colors",
                    expanded ? "px-3" : "justify-center px-0",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("size-[17px] shrink-0", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")} />
                  {expanded ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
                </button>
              );
              return (
                <li key={item.page}>
                  {expanded ? (
                    link
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* pin control */}
        <div className="shrink-0 px-2.5 pb-1">
          {expanded ? (
            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className="pp-focus flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {pinned ? <PinOff className="size-[17px] shrink-0" /> : <Pin className="size-[17px] shrink-0" />}
              <span>{pinned ? "Unpin sidebar" : "Pin sidebar"}</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPinned(!pinned)}
                  aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
                  className="pp-focus flex h-9 w-full items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {pinned ? <PinOff className="size-[17px]" /> : <Pin className="size-[17px]" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="text-xs">
                {pinned ? "Unpin sidebar" : "Pin sidebar"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* footer nav + user */}
        <div className="shrink-0 border-t border-border/70 px-2.5 pb-3 pt-2">
          <ul className="space-y-0.5">
            {FOOTER_NAV.map((item) => {
              const link = (
                <button
                  type="button"
                  onClick={() => onDialog?.(item.dialog)}
                  className={cn(
                    "pp-focus flex h-9 w-full items-center gap-3 rounded-lg text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    expanded ? "px-3" : "justify-center px-0",
                  )}
                >
                  <item.icon className="size-[17px] shrink-0" />
                  {expanded ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
                </button>
              );
              return (
                <li key={item.label}>
                  {expanded ? (
                    link
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>

          <div className={cn("mt-3 flex items-center gap-2.5 rounded-lg px-1.5 py-1", !expanded && "justify-center px-0")}>
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold uppercase text-primary"
            >
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            {expanded ? (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-medium text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.title}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
