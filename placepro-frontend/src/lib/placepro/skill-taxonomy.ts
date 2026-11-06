import type { Skill, Student } from "@/types";

const KNOWN_SKILL_NAMES: Record<string, { name: string; domain: string }> = {
  dsa: { name: "DSA", domain: "Programming & Problem Solving" },
  dbms: { name: "DBMS", domain: "Core Computer Science" },
  os: { name: "Operating Systems", domain: "Core Computer Science" },
  cn: { name: "Computer Networks", domain: "Core Computer Science" },
  oops: { name: "OOPS", domain: "Core Computer Science" },
  java: { name: "Java", domain: "Software Development" },
  springboot: { name: "Spring Boot", domain: "Software Development" },
  spring_boot: { name: "Spring Boot", domain: "Software Development" },
  comm: { name: "Communication", domain: "Employability & Soft Skills" },
  sysdesign: { name: "System Design", domain: "Software Development" },
  aptitude: { name: "Aptitude", domain: "Employability & Soft Skills" },
};

export const findSkill = (skills: Skill[] = [], id: string): Skill | undefined => {
  if (!id) return undefined;
  const normalizedId = String(id).toLowerCase().trim();
  return skills.find(
    (skill) =>
      skill.id === id ||
      skill.id.toLowerCase() === normalizedId ||
      (skill as { numericId?: string }).numericId === id ||
      skill.name.toLowerCase() === normalizedId
  );
};

export const skillName = (skills: Skill[] = [], id: string): string => {
  const found = findSkill(skills, id);
  if (found) return found.name;
  if (KNOWN_SKILL_NAMES[id.toLowerCase()]) return KNOWN_SKILL_NAMES[id.toLowerCase()].name;
  return id || "Unknown skill";
};

export const skillDomain = (skills: Skill[] = [], id: string): string => {
  const found = findSkill(skills, id);
  if (found) return found.domain;
  if (KNOWN_SKILL_NAMES[id.toLowerCase()]) return KNOWN_SKILL_NAMES[id.toLowerCase()].domain;
  return "General";
};

export const isCoreCsSkill = (skillOrId: Skill | string, skills: Skill[] = []): boolean => {
  const domain = typeof skillOrId === "string" ? skillDomain(skills, skillOrId) : skillOrId.domain;
  const id = typeof skillOrId === "string" ? skillOrId.toLowerCase() : skillOrId.id.toLowerCase();
  const dLower = domain.toLowerCase();
  return (
    dLower.includes("core") ||
    dLower.includes("programming") ||
    dLower.includes("dsa") ||
    ["dsa", "dbms", "os", "cn", "oops"].includes(id)
  );
};

export const domainGroups = (skills: Skill[] = []): { label: string; skills: string[] }[] => {
  const domains = [...new Set(skills.map((s) => s.domain).filter(Boolean))];
  if (domains.length === 0) {
    return [
      { label: "Programming & Problem Solving", skills: ["dsa"] },
      { label: "Core Computer Science", skills: ["dbms"] },
      { label: "Software Development", skills: ["spring_boot"] },
      { label: "Employability & Soft Skills", skills: ["comm"] },
    ];
  }
  return domains.map((label) => ({
    label,
    skills: skills.filter((s) => s.domain === label).map((s) => s.id),
  }));
};

export const domainSkills = (skills: Skill[] = [], domain: string): Skill[] => {
  return skills.filter((s) => s.domain.toLowerCase() === domain.toLowerCase());
};

export const skillEntries = (
  student: Student,
  skills: Skill[] = []
): { id: string; name: string; domain: string; score: number }[] => {
  if (!student || !student.scores) return [];

  // Deduplicate keys: student.scores may have both 'dsa' and '1' for the same skill
  const seenSkillCodes = new Set<string>();
  const entries: { id: string; name: string; domain: string; score: number }[] = [];

  // First process from known skills taxonomy
  for (const skill of skills) {
    const numericId = (skill as { numericId?: string }).numericId;
    let score: number | undefined;

    if (Object.hasOwn(student.scores, skill.id)) {
      score = student.scores[skill.id];
    } else if (numericId && Object.hasOwn(student.scores, numericId)) {
      score = student.scores[numericId];
    }

    if (score !== undefined) {
      seenSkillCodes.add(skill.id.toLowerCase());
      if (numericId) seenSkillCodes.add(numericId);
      entries.push({
        id: skill.id,
        name: skill.name,
        domain: skill.domain,
        score,
      });
    }
  }

  // Next, include any remaining scores from student.scores that were not in active taxonomy
  for (const [rawId, score] of Object.entries(student.scores)) {
    const rawLower = rawId.toLowerCase();
    if (!seenSkillCodes.has(rawLower)) {
      seenSkillCodes.add(rawLower);
      entries.push({
        id: rawId,
        name: skillName(skills, rawId),
        domain: skillDomain(skills, rawId),
        score,
      });
    }
  }

  return entries;
};

export const domainScores = (
  student: Student,
  skills: Skill[] = []
): { domain: string; score: number }[] => {
  if (!student) return [];

  // If backend provided domainAverages, prioritize them
  if (student.domainAverages && Object.keys(student.domainAverages).length > 0) {
    return Object.entries(student.domainAverages).map(([domain, score]) => ({
      domain,
      score: Number(score),
    }));
  }

  const entries = skillEntries(student, skills);
  const domains = [...new Set(skills.map((s) => s.domain).concat(entries.map((e) => e.domain)))].filter(Boolean);

  if (domains.length === 0) {
    return [
      { domain: "Programming & Problem Solving", score: student.scores["dsa"] ?? 0 },
      { domain: "Core Computer Science", score: student.scores["dbms"] ?? 0 },
      { domain: "Software Development", score: student.scores["spring_boot"] ?? 0 },
      { domain: "Employability & Soft Skills", score: student.scores["comm"] ?? 0 },
    ];
  }

  return domains.map((domain) => {
    const vals = entries.filter((e) => e.domain.toLowerCase() === domain.toLowerCase()).map((e) => e.score);
    return {
      domain,
      score: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0,
    };
  });
};

export const studentDomainScore = (student: Student, domain: string, skills: Skill[] = []): number => {
  if (!student) return 0;
  if (student.domainAverages && student.domainAverages[domain] !== undefined) {
    return Number(student.domainAverages[domain]);
  }
  const dMap = domainScores(student, skills);
  const found = dMap.find((d) => d.domain.toLowerCase() === domain.toLowerCase());
  return found ? found.score : 0;
};

export const domainAverage = (students: Student[] = [], domain: string, skills: Skill[] = []): number => {
  if (!students.length) return 0;
  const scores = students.map((s) => studentDomainScore(s, domain, skills));
  return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
};

export const weakestDomain = (
  student: Student,
  skills: Skill[] = []
): { domain: string; score: number } | null => {
  const dScores = domainScores(student, skills);
  if (!dScores.length) return null;
  return [...dScores].sort((a, b) => a.score - b.score)[0] ?? null;
};
