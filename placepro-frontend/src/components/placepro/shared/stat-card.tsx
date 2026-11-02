"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* StatCard — dashboard KPI                                            */
/* variant "hero" renders on the forest-green surface for hierarchy.   */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  hint,
  variant = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  /** signed number, e.g. +4.2 or -1.8 — renders a trend chip when given */
  delta?: number;
  deltaLabel?: string;
  hint?: string;
  variant?: "default" | "hero";
  className?: string;
}) {
  const hero = variant === "hero";
  return (
    <Card
      className={cn(
        "gap-0 border p-5 shadow-none",
        hero
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[13px] font-medium", hero ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {label}
        </p>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            hero ? "bg-white/12 text-primary-foreground" : "bg-primary-soft text-primary",
          )}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn("tabular text-[28px] font-semibold leading-none tracking-tight", !hero && "text-foreground")}>
          {value}
        </span>
        {typeof delta === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
              hero
                ? delta >= 0
                  ? "bg-white/15 text-white"
                  : "bg-white/15 text-white"
                : delta >= 0
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger",
            )}
          >
            {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
      </div>
      {(deltaLabel || hint) && (
        <p className={cn("mt-1.5 text-xs", hero ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {deltaLabel ?? hint}
        </p>
      )}
    </Card>
  );
}
