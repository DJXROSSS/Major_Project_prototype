"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* UserAvatar — initials avatar with deterministic soft-green tint     */
/* ------------------------------------------------------------------ */

const AVATAR_TINTS = [
  "bg-primary-soft text-primary",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-info-soft text-info",
];

export function UserAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const tint = AVATAR_TINTS[name.length % AVATAR_TINTS.length];
  const sizeCls = size === "sm" ? "size-7 text-[10px]" : size === "lg" ? "size-14 text-base" : "size-9 text-xs";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase tracking-wide",
        sizeCls,
        tint,
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* TablePagination — controlled pagination footer                      */
/* ------------------------------------------------------------------ */

export function TablePagination({
  page,
  pageCount,
  total,
  onPageChange,
  className,
}: {
  page: number; // 1-based
  pageCount: number;
  total: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * Math.ceil(total / pageCount) + 1;
  return (
    <div className={cn("flex items-center justify-between gap-4 border-t border-border px-4 py-2.5", className)}>
      <p className="text-xs text-muted-foreground">
        Page <span className="font-medium text-foreground">{page}</span> of {pageCount} · {total} records
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-3.5" /> Prev
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kbd — keyboard hint styling                                         */
/* ------------------------------------------------------------------ */

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/* InfoRow — label / value pair used across profile screens            */
/* ------------------------------------------------------------------ */

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}
