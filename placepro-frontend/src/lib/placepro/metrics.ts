import type { Student } from "@/types";

/** Display configuration, not business data. Scores always come from the API. */
export const DOMAIN_LABELS = [
  "Programming / DSA",
  "Core Computer Science",
  "Software Development",
  "Communication / Soft Skills",
] as const;

const domainAliases: Record<string, string> = {
  "Programming/DSA": "Programming / DSA",
  "Employability & Soft Skills": "Communication / Soft Skills",
};

export function domainScore(student: Student, domain: string): number | undefined {
  const values = student.domainAverages ?? {};
  const direct = values[domain] ?? values[Object.entries(domainAliases).find(([, label]) => label === domain)?.[0] ?? ""];
  return typeof direct === "number" ? direct : undefined;
}

export function weakestDomain(student: Student): { domain: string; score?: number } {
  const scored: { domain: string; score: number }[] = [];
  for (const domain of DOMAIN_LABELS) {
    const score = domainScore(student, domain);
    if (typeof score === "number") {
      scored.push({ domain, score });
    }
  }
  if (scored.length === 0) return { domain: "Unavailable" };
  scored.sort((a, b) => a.score - b.score);
  return scored[0];
}
