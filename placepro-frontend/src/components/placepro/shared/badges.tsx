"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PRStatus } from "@/types";

/* ------------------------------------------------------------------ */
/* Status badges — PR / NPR and generic semantic states                */
/* ------------------------------------------------------------------ */

export function PRBadge({ status, className }: { status: PRStatus; className?: string }) {
  return status === "PR" ? (
    <Badge className={cn("border-transparent bg-success-soft font-medium text-success hover:bg-success-soft", className)}>
      <span className="mr-1 size-1.5 rounded-full bg-success" />
      Placement Ready
    </Badge>
  ) : (
    <Badge className={cn("border-transparent bg-warning-soft font-medium text-warning hover:bg-warning-soft", className)}>
      <span className="mr-1 size-1.5 rounded-full bg-warning" />
      Not Ready
    </Badge>
  );
}

type SemanticTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASS: Record<SemanticTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  children,
  tone = "neutral",
  dot = true,
  className,
}: {
  children: React.ReactNode;
  tone?: SemanticTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge className={cn("border-transparent font-medium hover:inherit", TONE_CLASS[tone], className)}>
      {dot ? <span className={cn("mr-1.5 size-1.5 rounded-full", tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : "bg-muted-foreground")} /> : null}
      {children}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* ScorePill — compact score value with semantic colouring             */
/* ------------------------------------------------------------------ */

export function scoreTone(value: number): SemanticTone {
  if (value >= 75) return "success";
  if (value >= 60) return "info";
  if (value >= 45) return "warning";
  return "danger";
}

export function ScorePill({ value, suffix }: { value: number; suffix?: string }) {
  const tone = scoreTone(value);
  const text = tone === "success" ? "text-success" : tone === "info" ? "text-info" : tone === "warning" ? "text-warning" : "text-danger";
  return <span className={cn("tabular text-[13px] font-semibold", text)}>{value}{suffix ?? ""}</span>;
}

/* ------------------------------------------------------------------ */
/* MiniBar — tiny horizontal bar for dense tables                      */
/* ------------------------------------------------------------------ */

const BAR_COLOR: Record<SemanticTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/40",
};

export function MiniBar({ value, className, width = 44 }: { value: number; className?: string; width?: number }) {
  const tone = scoreTone(value);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" style={{ width }}>
        <span className={cn("block h-full rounded-full", BAR_COLOR[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="tabular w-8 text-[13px] font-medium text-foreground">{Math.round(value)}</span>
    </span>
  );
}
