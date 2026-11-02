"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { SidebarMark } from "@/components/placepro/shell/nav-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* LoginPage — institutional sign-in with role-based redirect          */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  const login = useAppStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [touched, setTouched] = useState(false);
  const emailInvalid = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordInvalid = touched && password.length < 4;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 4) return;

    setLoading(true);
    // small delay so the loading state is perceivable, mimicking a request
    window.setTimeout(() => {
      const result = login(email, password);
      setLoading(false);
      if (!result.ok) setError(result.error ?? "Sign-in failed. Please try again.");
    }, 650);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------ brand panel ------------------------------ */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-[11px] bg-white/12 text-xl font-semibold">
            P
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">PlacePro</p>
            <p className="text-xs text-primary-foreground/70">Placement Intelligence</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-tight">
            One record for every student. One view for every decision.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-primary-foreground/75">
            PlacePro brings daily coding exams, mock interviews and trainer
            feedback into a single 360° performance profile — so the placement
            cell can act on evidence, not spreadsheets.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-primary-foreground/85">
            {[
              "Assessment imports with dynamic column mapping",
              "Placement readiness classification (PR / NPR)",
              "Company-wise eligibility and ranked shortlists",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-foreground/60" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/50">
          University Institute of Engineering · Department of Computer Science
        </p>
      </section>

      {/* ------------------------------ form panel ------------------------------ */}
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <SidebarMark size={38} />
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-tight">PlacePro</p>
              <p className="text-xs text-muted-foreground">Placement Intelligence</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your institutional email to continue.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Institutional email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@campus.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn("h-10 pl-9", (emailInvalid || error) && "border-danger focus-visible:ring-danger")}
                  aria-invalid={!!emailInvalid}
                />
              </div>
              {emailInvalid ? <p className="text-xs text-danger">Enter a valid email address.</p> : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    alert("Password reset links are sent by the placement cell administrator. Contact admin@campus.edu if you are locked out.")
                  }
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn("h-10 pl-9 pr-10", (passwordInvalid || error) && "border-danger focus-visible:ring-danger")}
                  aria-invalid={!!passwordInvalid}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {passwordInvalid ? <p className="text-xs text-danger">Password must be at least 4 characters.</p> : null}
            </div>

            {error ? (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                Remember me
              </label>
            </div>

            <Button type="submit" className="h-10 w-full bg-primary font-medium hover:bg-primary-hover" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* demo credentials — this is a university project demo */}
          <div className="mt-8 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts</p>
            <div className="mt-2.5 grid gap-1.5 text-[13px]">
              {[
                ["Trainer", "trainer@campus.edu"],
                ["Student", "ananya.sharma@campus.edu"],
                ["Administrator", "admin@campus.edu"],
              ].map(([role, mail]) => (
                <button
                  key={mail}
                  type="button"
                  onClick={() => {
                    setEmail(mail);
                    setPassword("placepro");
                    setError(null);
                    setTouched(false);
                  }}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="font-medium text-foreground">{role}</span>
                  <span className="font-mono text-xs text-muted-foreground">{mail}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Password for all demo accounts: <span className="font-mono">placepro</span> — click a role to fill it in.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
