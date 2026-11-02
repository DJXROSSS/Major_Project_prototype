"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* ChartCard — consistent white surface for visualisations             */
/* ------------------------------------------------------------------ */

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 border-border bg-card p-0 shadow-none", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="text-[15px] font-semibold leading-tight text-foreground">{title}</CardTitle>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("p-5", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TableSkeleton — loading state for tables                            */
/* ------------------------------------------------------------------ */

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5 p-4", className)}>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.07 }} />
      ))}
    </div>
  );
}
