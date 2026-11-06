"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* SearchInput                                                         */
/* ------------------------------------------------------------------ */

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9 pr-8 text-sm"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FilterSelect — labelled dropdown filter with "All" sentinel         */
/* ------------------------------------------------------------------ */

export interface FilterOption {
  label: string;
  value: string;
}

export function FilterSelect({
  value,
  onChange,
  options,
  allLabel = "All",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  allLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const display = value === "all" ? allLabel : options.find((o) => o.value === value)?.label ?? allLabel;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-9 w-full text-sm", className)}>
        <SelectValue>{display}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
