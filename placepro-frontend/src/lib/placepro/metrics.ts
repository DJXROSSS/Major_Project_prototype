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
  return DOMAIN_LABELS.map((domain) => ({ domain, score: domainScore(student, domain) }))
    .filter((item): item is { domain: string; score: number } => item.score !== undefined)
    .sort((a, b) => a.score - b.score)[0] ?? { domain: "Unavailable" };
}
