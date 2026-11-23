"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Code2,
  ExternalLink,
  Github,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  api,
  type ProfileChallenge,
  type ProfilePlatform,
  type StudentCodingProfile,
  type StudentProject,
} from "@/lib/placepro/api";
import { useAppStore } from "@/lib/placepro/store";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const PLATFORM_LABEL: Record<ProfilePlatform, string> = {
  GITHUB: "GitHub",
};

const STATUS_CLASS: Record<StudentCodingProfile["verificationStatus"], string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-warning-soft dark:text-warning",
  VERIFIED: "bg-emerald-100 text-emerald-800 dark:bg-success-soft dark:text-success",
  EXPIRED: "bg-muted text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
};

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not yet"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function metricLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function metricValue(value: unknown) {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") {
    const date = new Date(value);
    return value.includes("T") && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString()
      : value;
  }
  return String(value);
}

function snapshotMetrics(profile: StudentCodingProfile) {
  const metrics = profile.latestSnapshot?.metrics;
  if (!metrics) return [];
  return Object.entries(metrics).filter(
    ([key, value]) => key !== "profileUrl" && key !== "username" &&
      (typeof value === "string" || typeof value === "number"),
  );
}

export default function ProfileIntelligencePage() {
  const navigate = useAppStore((state) => state.navigate);
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<StudentCodingProfile[]>([]);
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [challenges, setChallenges] = useState<Record<string, ProfileChallenge>>({});
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [liveDemoUrl, setLiveDemoUrl] = useState("");
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.myCodingProfiles(), api.myProjects()])
      .then(([items, projectItems]) => {
        if (!cancelled) {
          setProfiles(items);
          setProjects(projectItems);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(messageFor(error, "Unable to load your coding profiles."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshProfiles() {
    setRefreshing(true);
    try {
      const [items, projectItems] = await Promise.all([api.myCodingProfiles(), api.myProjects()]);
      setProfiles(items);
      setProjects(projectItems);
      setLoadError(null);
    } catch (error) {
      const message = messageFor(error, "Unable to refresh your coding profiles.");
      setLoadError(message);
      toast({ title: "Could not refresh profiles", description: message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  async function addProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return;
    setAdding(true);
    try {
      const created = await api.addMyCodingProfile({ platform: "GITHUB", username: trimmedUsername });
      setChallenges((current) => ({ ...current, [created.id]: created.challenge }));
      setUsername("");
      toast({
        title: "GitHub profile added",
        description: "Follow the verification instructions below before syncing profile data.",
      });
      try {
        setProfiles(await api.myCodingProfiles());
        setLoadError(null);
      } catch (error) {
        const message = messageFor(error, "The profile was added, but the list could not be refreshed.");
        setLoadError(message);
        toast({ title: "Profile added, list not refreshed", description: message, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "Could not add profile",
        description: messageFor(error, "Check the username and try again."),
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingProject(true);
    try {
      const created = await api.addMyProject({
        repositoryUrl: repositoryUrl.trim(),
        ...(liveDemoUrl.trim() ? { liveDemoUrl: liveDemoUrl.trim() } : {}),
      });
      setRepositoryUrl("");
      setLiveDemoUrl("");
      toast({
        title: "Project submitted",
        description: `Automated score: ${created.automaticScore}/100. A trainer must confirm ownership and approve the project.`,
      });
      try {
        setProjects(await api.myProjects());
      } catch (error) {
        toast({
          title: "Project submitted, list not refreshed",
          description: messageFor(error, "Refresh the project list to see the submission."),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Could not submit project",
        description: messageFor(error, "Check the GitHub URL and try again."),
        variant: "destructive",
      });
    } finally {
      setSubmittingProject(false);
    }
  }

  async function regenerateChallenge(profile: StudentCodingProfile) {
    setBusyProfileId(profile.id);
    try {
      const result = await api.updateMyCodingProfile(profile.id, profile.username);
      setChallenges((current) => ({ ...current, [profile.id]: result.challenge }));
      setProfiles((current) => current.map((item) => item.id === profile.id
        ? { ...item, username: result.username, verificationStatus: "PENDING", verifiedAt: null, latestSnapshot: null }
        : item));
      toast({ title: "Verification token generated", description: "Use the new token in your provider profile, then verify ownership." });
    } catch (error) {
      toast({
        title: "Could not generate token",
        description: messageFor(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusyProfileId(null);
    }
  }

  async function verifyProfile(profile: StudentCodingProfile) {
    setBusyProfileId(profile.id);
    try {
      await api.verifyMyCodingProfile(profile.id);
      setProfiles((current) => current.map((item) => item.id === profile.id
        ? { ...item, verificationStatus: "VERIFIED", verifiedAt: new Date().toISOString() }
        : item));
      setChallenges((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      toast({ title: "Profile verified", description: "You can now sync its public coding activity." });
    } catch (error) {
      toast({
        title: "Verification failed",
        description: messageFor(error, "Confirm the token is visible on the provider profile and try again."),
        variant: "destructive",
      });
    } finally {
      setBusyProfileId(null);
    }
  }

  async function syncProfile(profile: StudentCodingProfile) {
    setBusyProfileId(profile.id);
    try {
      const result = await api.syncMyCodingProfile(profile.id);
      setProfiles((current) => current.map((item) => item.id === profile.id
        ? {
            ...item,
            lastFetchedAt: result.fetchedAt,
            latestSnapshot: {
              id: result.snapshotId,
              status: result.status,
              metrics: result.metrics,
              error: null,
              fetchedAt: result.fetchedAt,
            },
          }
        : item));
      toast({ title: "Profile synced", description: `${PLATFORM_LABEL[profile.platform]} activity was updated.` });
    } catch (error) {
      toast({
        title: "Profile sync failed",
        description: messageFor(error, "Please try again later."),
        variant: "destructive",
      });
    } finally {
      setBusyProfileId(null);
    }
  }

  async function deleteProfile(profile: StudentCodingProfile) {
    setBusyProfileId(profile.id);
    try {
      await api.deleteMyCodingProfile(profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setChallenges((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      setDeletingProfileId(null);
      toast({ title: "Profile removed", description: `${PLATFORM_LABEL[profile.platform]} was unlinked.` });
    } catch (error) {
      toast({
        title: "Could not remove profile",
        description: messageFor(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusyProfileId(null);
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast({ title: "Token copied" });
    } catch (error) {
      toast({
        title: "Could not copy token",
        description: messageFor(error, "Copy the token manually."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile Intelligence"
        subtitle="Verify your GitHub account to include coding activity in your profile."
        actions={
          <Button variant="outline" className="h-9" onClick={() => navigate("my-profile")}>
            <ArrowLeft className="size-4" aria-hidden /> My Profile
          </Button>
        }
      />

      <Card className="gap-4 border-border bg-card p-5 shadow-none">
        <div>
          <h2 className="text-base font-semibold text-foreground">Link a coding profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your public username, verify that you own the account, then sync its latest activity.
          </p>
        </div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={addProfile}>
          <div className="grid gap-1.5">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              autoComplete="off"
              maxLength={39}
              placeholder="GitHub username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button className="h-9 w-full sm:w-auto" disabled={adding}>
              {adding ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Add profile
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Linked profiles</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Only verified profiles can be synchronized.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshProfiles()} disabled={refreshing}>
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading linked profiles…</p>
        ) : loadError && profiles.length === 0 ? (
          <Card className="border-destructive/30 bg-card p-5 shadow-none" role="alert">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refreshProfiles()}>
              Try again
            </Button>
          </Card>
        ) : profiles.length === 0 ? (
          <Card className="border-dashed border-border bg-card p-8 text-center shadow-none">
            <Code2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">No coding profiles linked</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a GitHub username above to get started.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {loadError ? <p className="text-sm text-destructive" role="alert">{loadError}</p> : null}
            {profiles.map((profile) => {
              const challenge = challenges[profile.id];
              const isBusy = busyProfileId === profile.id;
              const metrics = snapshotMetrics(profile);
              const canRegenerateToken = profile.verificationMethod !== "OAUTH";

              return (
                <Card key={profile.id} className="gap-0 border-border bg-card p-0 shadow-none">
                  <div className="flex flex-col gap-4 border-b border-border/70 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Github className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">{PLATFORM_LABEL[profile.platform]}</h3>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[profile.verificationStatus]}`}>
                            {profile.verificationStatus.toLowerCase()}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{profile.username}</p>
                        <a
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          href={profile.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View public profile <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.verificationStatus === "VERIFIED" ? (
                        <Button size="sm" onClick={() => void syncProfile(profile)} disabled={isBusy}>
                          {isBusy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
                          Sync activity
                        </Button>
                      ) : null}
                      {profile.verificationStatus === "PENDING" && challenge ? (
                        <Button size="sm" onClick={() => void verifyProfile(profile)} disabled={isBusy}>
                          {isBusy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
                          Verify ownership
                        </Button>
                      ) : null}
                      {canRegenerateToken ? (
                        <Button variant="outline" size="sm" onClick={() => void regenerateChallenge(profile)} disabled={isBusy}>
                          <ShieldCheck className="size-3.5" aria-hidden />
                          {challenge ? "New token" : "Get verification token"}
                        </Button>
                      ) : null}
                      {deletingProfileId === profile.id ? (
                        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                          <span className="text-xs text-muted-foreground">Unlink this profile?</span>
                          <Button variant="destructive" size="sm" onClick={() => void deleteProfile(profile)} disabled={isBusy}>
                            Remove
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingProfileId(null)} disabled={isBusy}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${PLATFORM_LABEL[profile.platform]} profile`}
                          onClick={() => setDeletingProfileId(profile.id)}
                          disabled={isBusy}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  {challenge ? (
                    <div className="border-b border-border/70 bg-muted/30 px-5 py-4">
                      <p className="text-sm font-medium text-foreground">Verify account ownership</p>
                      <p className="mt-1 text-sm text-muted-foreground">{challenge.instructions}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <code className="break-all rounded bg-background px-2.5 py-1.5 text-sm text-foreground">{challenge.token}</code>
                        <Button variant="outline" size="sm" onClick={() => void copyToken(challenge.token)}>
                          <Check className="size-3.5" aria-hidden /> Copy token
                        </Button>
                        <span className="text-xs text-muted-foreground">Expires in {challenge.expiresInMinutes} minutes</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 p-5">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>Last synced: {formatDate(profile.lastFetchedAt)}</span>
                      <span>Verified: {formatDate(profile.verifiedAt)}</span>
                    </div>
                    {profile.latestSnapshot?.error ? (
                      <p className="text-sm text-destructive" role="alert">{profile.latestSnapshot.error.message}</p>
                    ) : null}
                    {profile.verificationStatus === "VERIFIED" && metrics.length ? (
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-foreground">Latest activity</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {metrics.map(([key, value]) => (
                            <div key={key} className="rounded-lg bg-muted/50 px-3 py-2">
                              <p className="text-xs text-muted-foreground">{metricLabel(key)}</p>
                              <p className="mt-1 break-words text-sm font-semibold text-foreground">{metricValue(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : profile.verificationStatus === "VERIFIED" && profile.latestSnapshot?.status === "FAILED" ? (
                      <p className="text-sm text-muted-foreground">The most recent sync failed. Try syncing again.</p>
                    ) : profile.verificationStatus === "VERIFIED" ? (
                      <p className="text-sm text-muted-foreground">No activity synced yet. Sync to fetch the latest public data.</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {canRegenerateToken
                          ? "Generate a token and add it to your provider profile to verify ownership."
                          : "This GitHub account is linked through OAuth and can be synchronized once verified."}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="gap-4 border-border bg-card p-5 shadow-none">
        <div>
          <h2 className="text-base font-semibold text-foreground">Project portfolio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit repositories from your verified GitHub account. A trainer reviews ownership and project quality before the score affects readiness.
          </p>
        </div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={submitProject}>
          <div className="grid gap-1.5">
            <Label htmlFor="project-repository">GitHub repository URL</Label>
            <Input
              id="project-repository"
              type="url"
              placeholder="https://github.com/username/project"
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-demo">Live demo URL (optional)</Label>
            <Input
              id="project-demo"
              type="url"
              placeholder="https://example.com"
              value={liveDemoUrl}
              onChange={(event) => setLiveDemoUrl(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="h-9 w-full sm:w-auto" disabled={submittingProject}>
              {submittingProject ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Submit project
            </Button>
          </div>
        </form>

        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            No projects submitted yet. Verify a GitHub profile above before adding a repository.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg border border-border/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a
                      className="font-medium text-primary hover:underline"
                      href={project.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {project.name}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">{project.ownershipStatus.replaceAll("_", " ")} · {project.reviewStatus.toLowerCase()}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {project.score?.final !== null && project.score?.final !== undefined
                      ? `Score ${project.score.final.toFixed(1)}`
                      : "Awaiting review"}
                  </span>
                </div>
                {project.score?.automatic !== null && project.score?.automatic !== undefined ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Automated repository score: {project.score.automatic}/100
                    {project.score.trainer !== null ? ` · Trainer: ${project.score.trainer}/100` : ""}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {project.readmePresent ? <span>README</span> : null}
                  {project.hasTests ? <span>Tests</span> : null}
                  {project.hasDocker ? <span>Docker</span> : null}
                  {project.hasCi ? <span>CI</span> : null}
                  {project.liveDemoUrl ? <span>Live demo</span> : null}
                </div>
                {project.scoreHistory.length > 1 ? (
                  <details className="mt-3 border-t border-border/70 pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Score history</summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {project.scoreHistory.map((entry, index) => (
                        <li key={`${entry.computedAt}-${index}`}>
                          {formatDate(entry.computedAt)} · {entry.formulaVersion} · Auto {entry.automatic ?? "—"} · Trainer {entry.trainer ?? "—"} · Final {entry.final ?? "pending"}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
