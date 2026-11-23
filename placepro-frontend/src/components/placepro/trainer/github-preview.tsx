"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Github, RefreshCw } from "lucide-react";
import { api, type GithubCalendar, type GithubStatisticsResponse } from "@/lib/placepro/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const colors = ["bg-muted", "bg-emerald-100 dark:bg-primary/20", "bg-emerald-300 dark:bg-primary/40", "bg-emerald-500 dark:bg-primary/65", "bg-emerald-800 dark:bg-primary"];

function ContributionCalendar({ calendar }: { calendar: GithubCalendar }) {
  const offset = new Date(`${calendar.from}T00:00:00Z`).getUTCDay();
  const cells: (GithubCalendar["days"][number] | null)[] = [...Array(offset).fill(null), ...calendar.days];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return <section className="space-y-2" aria-label="Contribution calendar">
    <div className="flex flex-wrap items-baseline justify-between gap-1"><h3 className="text-sm font-semibold">Contribution activity</h3><span className="text-xs text-muted-foreground">{calendar.from} to {calendar.to} (UTC)</span></div>
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[620px]" role="img" aria-label={`${calendar.totalContributions} contributions over ${calendar.days.length} days. Daily values are available in the table below.`}>
        <div className="mb-1 grid gap-[3px] text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {weeks.map((week, i) => {
            const first = week.find(day => day && (day.date.endsWith("-01") || i === 0));
            return <span key={i} className="overflow-visible whitespace-nowrap">{first ? new Date(`${first.date}T00:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" }) : ""}</span>;
          })}
        </div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {weeks.map((week, i) => <div key={i} className="grid grid-rows-7 gap-[3px]">
            {Array.from({ length: 7 }, (_, row) => {
              const day = week[row];
              return <span key={row} className={`block aspect-square min-h-[9px] rounded-[2px] ${day ? colors[day.level] : "invisible"}`} title={day ? `${day.date}: ${day.count} contribution${day.count === 1 ? "" : "s"}` : undefined} />;
            })}
          </div>)}
        </div>
      </div>
    </div>
    <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground" aria-label="Activity legend: 0, 1 to 3, 4 to 7, 8 to 11, 12 or more contributions"><span>Less</span>{colors.map((color, i) => <span key={color} className={`size-2.5 rounded-sm ${color}`} title={["0", "1-3", "4-7", "8-11", "12+"][i]} />)}<span>More</span></div>
    {calendar.includesSharedPrivateCounts && <p className="text-xs text-muted-foreground">Includes anonymized private contribution counts this account has chosen to share.</p>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">View daily contribution counts</summary><div className="mt-2 max-h-40 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Daily GitHub contribution counts</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Contributions</th></tr></thead><tbody>{calendar.days.map(day => <tr key={day.date}><th scope="row" className="font-normal">{day.date}</th><td>{day.count}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export default function GithubPreview({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ studentId: string; data: GithubStatisticsResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const mode = useRef<"hover" | "click">("hover");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const cache = useRef<{ studentId: string; expires: number; promise: Promise<GithubStatisticsResponse> } | null>(null);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); };
  const scheduleClose = () => {
    clearTimer();
    if (mode.current === "hover") timer.current = setTimeout(() => { if (!content.current?.contains(document.activeElement)) setOpen(false); }, 250);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true); setError(null);
    if (!cache.current || cache.current.studentId !== studentId || cache.current.expires < Date.now()) {
      cache.current = { studentId, expires: Date.now() + 120000, promise: api.studentGithubStatistics(studentId) };
    }
    const request = cache.current;
    void request.promise.then(data => {
      if (live) setResult({ studentId, data });
    }).catch(err => {
      if (cache.current === request) cache.current = null;
      if (live) setError(err instanceof Error ? err.message : "GitHub statistics could not be loaded.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, studentId, retry]);
  const data = result?.studentId === studentId ? result.data : null;
  const profile = data?.profile;
  const calendar = profile?.calendar;
  return <Popover open={open} onOpenChange={value => { clearTimer(); setOpen(value); if (!value) mode.current = "hover"; }}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 text-xs" aria-label="Preview student GitHub statistics"
        onPointerEnter={event => { if (event.pointerType === "mouse") { clearTimer(); if (!open) { mode.current = "hover"; timer.current = setTimeout(() => setOpen(true), 180); } } }}
        onPointerLeave={scheduleClose}
        onClick={event => { clearTimer(); if (open && mode.current === "hover") event.preventDefault(); mode.current = "click"; }}>
        <Github className="size-3.5" /> GitHub
      </Button>
    </PopoverTrigger>
    <PopoverContent ref={content} align="start" sideOffset={8} collisionPadding={12} className="max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-[min(720px,calc(100vw-24px))] space-y-4 overflow-y-auto rounded-xl p-4 shadow-xl sm:p-5" aria-label="Student GitHub statistics"
      onPointerEnter={clearTimer} onPointerLeave={scheduleClose} onFocusCapture={clearTimer}
      onOpenAutoFocus={event => { if (mode.current === "hover") event.preventDefault(); }}
      onCloseAutoFocus={event => { if (mode.current === "hover") event.preventDefault(); }}>
      {loading ? <div role="status" aria-label="Loading GitHub statistics" className="space-y-4"><Skeleton className="h-12 w-52" /><div className="grid grid-cols-3 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div><Skeleton className="h-28 w-full" /></div>
      : error ? <div role="alert" className="space-y-3"><h3 className="font-semibold">GitHub statistics unavailable</h3><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={() => { cache.current = null; setRetry(n => n + 1); }}><RefreshCw className="size-3.5" /> Retry</Button></div>
      : data && !profile ? <div className="space-y-2 py-3"><Github className="size-6 text-muted-foreground" /><h3 className="font-semibold">No GitHub profile linked</h3><p className="text-sm text-muted-foreground">This student has not added a GitHub account. They can connect one in their Profile Intelligence page.</p></div>
      : profile ? <>
        <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><img src={profile.avatarUrl} alt={`${profile.username}'s GitHub avatar`} className="size-10 rounded-full" width={40} height={40} /><div><h3 className="font-semibold">{profile.username}</h3><p className="text-xs text-muted-foreground">{data?.verificationStatus === "VERIFIED" ? "Verified GitHub account" : "Student-provided account - ownership not verified"}</p></div></div><a href={profile.profileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-primary">Open GitHub Profile <ExternalLink className="size-3" /></a></header>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
          ["Contributions (last year)", calendar?.totalContributions],
          ["Current streak (calendar end)", calendar ? `${calendar.currentStreak}${calendar.currentStreakAtLeast ? "+" : ""} days` : null],
          ["Longest streak (last year)", calendar ? `${calendar.longestStreak} days` : null],
          ["Public repositories", profile.publicRepositories], ["Followers", profile.followers],
        ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-2.5"><div className="text-lg font-semibold tabular-nums">{value ?? <span className="text-xs font-normal text-muted-foreground">Unavailable</span>}</div><div className="mt-1 text-[10px] text-muted-foreground">{label}</div></div>)}</div>
        {calendar ? <ContributionCalendar calendar={calendar} /> : <div role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><p>{profile.calendarUnavailable || "Contribution data is unavailable."}</p>{profile.calendarErrorCode && <p className="mt-1 text-xs">Reference: {profile.calendarErrorCode}</p>}</div>}
        <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Primary repository languages</h3><p className="text-xs text-muted-foreground">By repository count, from {profile.sampledRepositoryCount} most recently updated public repositories (up to {profile.repositorySampleLimit}); not code volume.</p><div className="flex flex-wrap gap-2">{profile.languages.slice(0, 8).map(language => <span key={language.name} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs text-primary">{language.name} <span className="font-semibold">{language.repositories}</span></span>)}{!profile.languages.length && <p className="text-xs text-muted-foreground">No language data available for these repositories.</p>}</div></section>
        {data?.fetchedAt && <p className="text-[10px] text-muted-foreground">{data.stale ? "GitHub could not be refreshed. Showing cached data from " : "Updated "}{new Date(data.fetchedAt).toLocaleString()}. Streaks cover the displayed last-year calendar through {calendar?.to ?? "the period end"}; today's activity may still be in progress.</p>}
      </> : null}
    </PopoverContent>
  </Popover>;
}
