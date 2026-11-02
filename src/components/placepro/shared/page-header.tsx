"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* PageHeader — page title + optional subtitle, actions, breadcrumbs    */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breadcrumbs                                                         */
/* ------------------------------------------------------------------ */

export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[13px] text-muted-foreground">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${item}-${i}`}>
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-border" aria-hidden /> : null}
            <span className={cn("truncate", last && "font-medium text-foreground")}>{item}</span>
          </Fragment>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — inside-page group headings with optional action     */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
