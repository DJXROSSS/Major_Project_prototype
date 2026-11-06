/* ------------------------------------------------------------------ */
/* PlacePro — mock data layer                                          */
/*                                                                     */
/* This module simulates the backend. Every value is deterministic     */
/* (seeded PRNG) so charts and tables stay stable between reloads.      */
/* When the real API lands, replace the exports here with fetch        */
/* calls — components only consume the typed structures.               */
/* ------------------------------------------------------------------ */

import type {
  ActivityItem,
  AppUser,
  Assessment,
  AuditLog,
  Batch,
  Company,
  Notification,
  Skill,
  Student,
  TrainerFeedback,
} from "@/types";

/* ------------------------------ seeded RNG ------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260214);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Number(v.toFixed(d));

/* ------------------------------ skills ------------------------------ */

export const SKILLS: Skill[] = [
  { id: "dsa", name: "DSA", domain: "Programming / DSA", description: "Data structures, algorithms and problem solving assessed through daily and weekly coding contests.", parameterType: "numeric", active: true },
  { id: "dbms", name: "DBMS", domain: "Core Computer Science", description: "Relational modelling, SQL and normalisation fundamentals.", parameterType: "numeric", active: true },
  { id: "os", name: "Operating Systems", domain: "Core Computer Science", description: "Processes, scheduling, memory management and concurrency.", parameterType: "numeric", active: true },
  { id: "cn", name: "Computer Networks", domain: "Core Computer Science", description: "TCP/IP stack, routing and application protocols.", parameterType: "numeric", active: true },
  { id: "oops", name: "OOPS", domain: "Core Computer Science", description: "Object-oriented design principles and patterns.", parameterType: "numeric", active: true },
  { id: "java", name: "Java", domain: "Software Development", description: "Core Java, collections and JVM fundamentals.", parameterType: "numeric", active: true },
  { id: "springboot", name: "Spring Boot", domain: "Software Development", description: "REST services, dependency injection and application configuration.", parameterType: "numeric", active: true },
  { id: "comm", name: "Communication", domain: "Communication / Soft Skills", description: "Clarity, structure and confidence in mock HR and technical interviews.", parameterType: "numeric", active: true },
  { id: "sysdesign", name: "System Design", domain: "Software Development", description: "High-level design thinking for distributed scenarios.", parameterType: "numeric", active: true },
  { id: "aptitude", name: "Aptitude", domain: "Communication / Soft Skills", description: "Quantitative and logical reasoning tests.", parameterType: "numeric", active: false },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Skill ids used for scoring / charts (active numeric skills) */
export const CORE_SKILL_IDS = ["dsa", "dbms", "os", "cn", "oops", "java", "springboot", "comm"];

export const DOMAIN_GROUPS: { label: string; skills: string[] }[] = [
  { label: "Programming / DSA", skills: ["dsa"] },
  { label: "Core CS", skills: ["dbms", "os", "cn", "oops"] },
  { label: "Development", skills: ["java", "springboot"] },
  { label: "Communication", skills: ["comm"] },
];

/* ------------------------------ batches ------------------------------ */

export const BATCHES: Batch[] = [
  { id: "b1", name: "2022–2026 CSE", department: "Computer Science & Engineering", academicYears: "2022 – 2026", sections: ["A", "B"], trainerIds: ["t1", "t2"], studentCount: 24, status: "active" },
  { id: "b2", name: "2023–2027 CSE", department: "Computer Science & Engineering", academicYears: "2023 – 2027", sections: ["A"], trainerIds: ["t3"], studentCount: 6, status: "active" },
];

export const BATCH_NAMES = BATCHES.map((b) => b.name);

/* ------------------------------ students ------------------------------ */

const STUDENT_NAMES: [string, string, string, string][] = [
  // name, roll, batch, section
  ["Ananya Sharma", "22CS041", "2022–2026 CSE", "A"],
  ["Rohan Verma", "22CS017", "2022–2026 CSE", "A"],
  ["Ishaan Iyer", "22CS052", "2022–2026 CSE", "A"],
  ["Meera Kulkarni", "22CS008", "2022–2026 CSE", "A"],
  ["Aditya Rao", "22CS063", "2022–2026 CSE", "A"],
  ["Sara Fernandes", "22CS029", "2022–2026 CSE", "A"],
  ["Kabir Malhotra", "22CS014", "2022–2026 CSE", "A"],
  ["Tanvi Deshpande", "22CS047", "2022–2026 CSE", "A"],
  ["Vikram Nair", "22CS021", "2022–2026 CSE", "A"],
  ["Nikita Joshi", "22CS058", "2022–2026 CSE", "A"],
  ["Arjun Pillai", "22CS003", "2022–2026 CSE", "A"],
  ["Diya Menon", "22CS036", "2022–2026 CSE", "A"],
  ["Yash Chauhan", "22CS070", "2022–2026 CSE", "B"],
  ["Riya Bansal", "22CS025", "2022–2026 CSE", "B"],
  ["Siddharth Ghosh", "22CS061", "2022–2026 CSE", "B"],
  ["Priya Sabnis", "22CS011", "2022–2026 CSE", "B"],
  ["Karan Bhatt", "22CS044", "2022–2026 CSE", "B"],
  ["Aisha Khan", "22CS032", "2022–2026 CSE", "B"],
  ["Devansh Kaul", "22CS019", "2022–2026 CSE", "B"],
  ["Shreya Reddy", "22CS055", "2022–2026 CSE", "B"],
  ["Harshad Patil", "22CS007", "2022–2026 CSE", "B"],
  ["Nandini Rao", "22CS066", "2022–2026 CSE", "B"],
  ["Imran Sheikh", "22CS027", "2022–2026 CSE", "B"],
  ["Lakshmi Venkatesh", "22CS049", "2022–2026 CSE", "B"],
  ["Aryan Gupta", "23CS012", "2023–2027 CSE", "A"],
  ["Sanjana Hegde", "23CS004", "2023–2027 CSE", "A"],
  ["Mohit Sinha", "23CS021", "2023–2027 CSE", "A"],
  ["Kritika Malhotra", "23CS017", "2023–2027 CSE", "A"],
  ["Farhan Ali", "23CS009", "2023–2027 CSE", "A"],
  ["Gauri Deshmukh", "23CS025", "2023–2027 CSE", "A"],
];

// tier: 0 strong, 1 mid, 2 weak — controls the score baseline
const TIERS = [
  0, 1, 0, 0, 2, 1, 2, 0, 1, 0, 1, 0, 2, 1, 0, 1, 2, 1, 2, 0, 2, 1, 2, 0, 1, 0, 2, 1, 2, 1,
];

const TIER_BASE: [number, number][] = [
  [73, 92],
  [60, 76],
  [42, 62],
];

function buildStudents(): Student[] {
  return STUDENT_NAMES.map(([name, roll, batch, section], i) => {
    const tier = TIERS[i];
    const [lo, hi] = TIER_BASE[tier];
    const base = lo + rand() * (hi - lo);

    // per-domain affinity so profiles feel individual
    const aff = {
      dsa: clamp(base + (rand() - 0.45) * 26, 30, 98),
      core: clamp(base + (rand() - 0.5) * 22, 30, 98),
      dev: clamp(base + (rand() - 0.5) * 26, 28, 98),
      comm: clamp(base + (rand() - 0.42) * 28, 30, 98),
    };

    const scores: Record<string, number> = {
      dsa: round(clamp(aff.dsa + (rand() - 0.5) * 10, 28, 98)),
      dbms: round(clamp(aff.core + (rand() - 0.5) * 12, 28, 98)),
      os: round(clamp(aff.core + (rand() - 0.5) * 12, 28, 98)),
      cn: round(clamp(aff.core + (rand() - 0.5) * 12, 28, 98)),
      oops: round(clamp(aff.core + (rand() - 0.5) * 10, 28, 98)),
      java: round(clamp(aff.dev + (rand() - 0.5) * 12, 28, 98)),
      springboot: round(clamp(aff.dev + (rand() - 0.5) * 14, 25, 98)),
      comm: round(clamp(aff.comm + (rand() - 0.5) * 10, 30, 98)),
    };
    if (rand() > 0.6) scores.sysdesign = round(clamp(aff.dev + (rand() - 0.5) * 16, 25, 95));

    const values = CORE_SKILL_IDS.map((id) => scores[id]);
    const average = round(values.reduce((a, b) => a + b, 0) / values.length, 1);
    const cgpa = round(clamp(5.4 + (average - 40) / 22 + (rand() - 0.5) * 0.7, 5.0, 9.6), 1);
    const prStatus = average >= 68 && cgpa >= 6.6 && scores.comm >= 58 ? "PR" : "NPR";

    const firstName = name.split(" ")[0].toLowerCase();
    const lastName = name.split(" ")[1].toLowerCase();

    return {
      id: `s${i + 1}`,
      rollNumber: roll,
      name,
      email: `${firstName}.${lastName}@campus.edu`,
      batch,
      section,
      cgpa,
      scores,
      average,
      prStatus,
      trend: [],
    };
  });
}

export const STUDENTS: Student[] = buildStudents();
export const STUDENT_BY_ID: Record<string, Student> = Object.fromEntries(STUDENTS.map((s) => [s.id, s]));

/* ------------------------------ assessments ------------------------------ */

interface AssessmentSeed {
  name: string;
  type: "exam" | "mock-interview";
  batch: string;
  date: string;
  maxMarks: number;
  focus: "dsa" | "core" | "dev" | "comm" | "mixed";
}

const ASSESSMENT_SEEDS: AssessmentSeed[] = [
  { name: "Daily Coding Contest #12 — Arrays & Hashing", type: "exam", batch: "2022–2026 CSE", date: "2025-09-18", maxMarks: 100, focus: "dsa" },
  { name: "Weekly Assessment — DBMS Fundamentals", type: "exam", batch: "2022–2026 CSE", date: "2025-09-26", maxMarks: 50, focus: "core" },
  { name: "Mock Interview — Technical Round I", type: "mock-interview", batch: "2022–2026 CSE", date: "2025-10-04", maxMarks: 50, focus: "mixed" },
  { name: "Daily Coding Contest #15 — Trees & Graphs", type: "exam", batch: "2022–2026 CSE", date: "2025-10-12", maxMarks: 100, focus: "dsa" },
  { name: "Weekly Assessment — Operating Systems", type: "exam", batch: "2022–2026 CSE", date: "2025-10-24", maxMarks: 50, focus: "core" },
  { name: "Mock Interview — HR & Communication", type: "mock-interview", batch: "2022–2026 CSE", date: "2025-11-02", maxMarks: 50, focus: "comm" },
  { name: "Weekly Assessment — OOPS & Core Java", type: "exam", batch: "2022–2026 CSE", date: "2025-11-14", maxMarks: 50, focus: "mixed" },
  { name: "Daily Coding Contest #18 — Dynamic Programming", type: "exam", batch: "2022–2026 CSE", date: "2025-11-25", maxMarks: 100, focus: "dsa" },
  { name: "Mock Interview — Technical Round II", type: "mock-interview", batch: "2022–2026 CSE", date: "2025-12-06", maxMarks: 50, focus: "mixed" },
  { name: "Weekly Assessment — Computer Networks", type: "exam", batch: "2022–2026 CSE", date: "2025-12-18", maxMarks: 50, focus: "core" },
  { name: "Mini Project Review — Spring Boot REST APIs", type: "exam", batch: "2022–2026 CSE", date: "2026-01-09", maxMarks: 100, focus: "dev" },
  { name: "Final Mock Interview — Corporate Round", type: "mock-interview", batch: "2022–2026 CSE", date: "2026-01-24", maxMarks: 50, focus: "mixed" },
  { name: "Daily Coding Contest #21 — Strings & Greedy", type: "exam", batch: "2023–2027 CSE", date: "2026-01-31", maxMarks: 100, focus: "dsa" },
  { name: "Weekly Assessment — Java Foundations", type: "exam", batch: "2023–2027 CSE", date: "2026-02-07", maxMarks: 50, focus: "dev" },
];

const FOCUS_WEIGHT: Record<AssessmentSeed["focus"], Partial<Record<string, number>>> = {
  dsa: { dsa: 0.5, core: 0.15, dev: 0.15, comm: 0.2 },
  core: { dsa: 0.15, core: 0.55, dev: 0.1, comm: 0.2 },
  dev: { dsa: 0.15, core: 0.15, dev: 0.5, comm: 0.2 },
  comm: { dsa: 0.1, core: 0.1, dev: 0.1, comm: 0.7 },
  mixed: { dsa: 0.3, core: 0.25, dev: 0.2, comm: 0.25 },
};

function domainScore(s: Student, key: "dsa" | "core" | "dev" | "comm"): number {
  const groups: Record<string, string[]> = {
    dsa: ["dsa"],
    core: ["dbms", "os", "cn", "oops"],
    dev: ["java", "springboot"],
    comm: ["comm"],
  };
  const ids = groups[key].filter((id) => s.scores[id] !== undefined);
  return ids.reduce((a, id) => a + s.scores[id], 0) / ids.length;
}

function buildAssessments(): Assessment[] {
  return ASSESSMENT_SEEDS.map((seed, ai) => {
    const batchStudents = STUDENTS.filter((s) => s.batch === seed.batch);
    const weights = FOCUS_WEIGHT[seed.focus];
    const results = batchStudents.map((s) => {
      const weightSum = (Object.values(weights) as (number | undefined)[]).reduce<number>(
        (acc, b) => acc + (b ?? 0),
        0,
      );
      let expected =
        (Object.keys(weights) as ("dsa" | "core" | "dev" | "comm")[]).reduce(
          (acc, key) => acc + domainScore(s, key) * (weights[key] ?? 0),
          0,
        ) / weightSum;
      // gentle upward drift for later assessments + noise
      expected = clamp(expected + ai * 0.6 + (rand() - 0.5) * 16, 20, 100);
      const marks = round((expected / 100) * seed.maxMarks, 1);
      return {
        studentId: s.id,
        marks,
        maxMarks: seed.maxMarks,
        percentage: round((marks / seed.maxMarks) * 100, 1),
      };
    });
    return {
      id: `a${ai + 1}`,
      name: seed.name,
      type: seed.type,
      batch: seed.batch,
      date: seed.date,
      uploadedBy: ai % 3 === 0 ? "Priya Nair" : ai % 3 === 1 ? "Dr. Rajesh Menon" : "Vikram Shetty",
      results,
      reviewed: true,
    };
  });
}

export const ASSESSMENTS: Assessment[] = buildAssessments();

/* Fill student trends from their chronological assessment results */
(function fillTrends() {
  for (const student of STUDENTS) {
    student.trend = ASSESSMENTS.filter((a) => a.batch === student.batch).map((a) => {
      const r = a.results.find((x) => x.studentId === student.id);
      return r ? r.percentage : student.average;
    });
  }
})();

export function getAssessmentHistory(studentId: string): Assessment[] {
  return ASSESSMENTS.filter((a) => a.results.some((r) => r.studentId === studentId));
}

/* ------------------------------ trainer feedback ------------------------------ */

const FEEDBACK_SEEDS: [string, string, string, string, string, string, string[], string[], string[]][] = [
  [
    "s1",
    "2026-01-26",
    "Final Mock Interview — Corporate Round",
    "Strong problem decomposition. Explained the time–space tradeoff of the sliding-window solution without prompting. Code was clean and compiled on first run.",
    "Confident and structured responses. Slight tendency to rush through the introduction — slow down and anchor the answer with a summary line.",
    "Punctual, engaged and receptive to feedback. Took notes during the review without prompting.",
    ["Sliding window and two-pointer patterns", "SQL normalisation", "REST API design"],
    ["Dynamic programming framing under time pressure"],
    ["Practice 3 DP problems weekly from the company-specific set", "Record one mock introduction per week and review pacing"],
  ],
  [
    "s2",
    "2026-01-26",
    "Final Mock Interview — Corporate Round",
    "Adequate grasp of arrays but struggled to move from brute force to an optimised approach for the graph question. Needed two hints.",
    "Communication is functional but answers lack structure — use the STAR format for scenario questions.",
    "Participates willingly but gives up early when stuck. Needs to verbalise his thinking instead of going silent.",
    ["Basic SQL queries", "Consistency in daily contests"],
    ["Graph algorithms", "Structured verbal reasoning"],
    ["Complete the graphs module in the practice track", "Two structured speaking drills per week"],
  ],
  [
    "s4",
    "2025-12-08",
    "Mock Interview — Technical Round II",
    "Excellent command of DBMS — explained indexing and query planning with a real project example. Java fundamentals are solid.",
    "Crisp articulation. Maintains good eye contact and summarises her answers well.",
    "Mentors juniors in the study group. Very professional in conduct.",
    ["DBMS internals", "Core Java", "Presentation quality"],
    ["Spring Boot auto-configuration depth"],
    ["Build one CRUD service with tests and deployment config"],
  ],
  [
    "s5",
    "2025-12-08",
    "Mock Interview — Technical Round II",
    "OS concepts are shaky — could not explain thrashing or page replacement clearly. DSA needs consistent practice.",
    "Quiet in the first ten minutes; opens up later. Needs a stronger start.",
    "Attends sessions regularly but submits contest solutions late.",
    ["Willingness to learn", "Web development basics"],
    ["Operating Systems theory", "Contest consistency", "Initial impression in interviews"],
    ["Revise OS module 4–6 with the recorded sessions", "Solve at least one contest problem daily", "Rehearse a 90-second self-introduction"],
  ],
  [
    "s10",
    "2026-01-26",
    "Final Mock Interview — Corporate Round",
    "Very strong DSA — solved the medium problem optimally and articulated complexity precisely. System design thinking is emerging.",
    "Speaks fluently but occasionally over-explains. Trimming answers will improve impact.",
    "Leads the batch's contest leaderboard discussions. Collaborative.",
    ["Graphs and DP", "Complexity analysis", "Spring Boot project work"],
    ["Answer brevity"],
    ["Time-box answers to 2 minutes in mock HR rounds"],
  ],
  [
    "s13",
    "2025-12-20",
    "Weekly Assessment — Computer Networks",
    "Networks fundamentals below the batch average. Confusion between flow control and congestion control.",
    "Written answers were brief but to the point.",
    "Needs to attend the remedial sessions scheduled on Fridays.",
    ["Logical reasoning", "Java syntax"],
    ["Computer Networks", "Consistency in weekly assessments"],
    ["Complete the CN worksheet series", "Attend Friday remedials"],
  ],
  [
    "s16",
    "2025-11-16",
    "Weekly Assessment — OOPS & Core Java",
    "Good OOPS design instincts — the inheritance vs composition answer was textbook quality.",
    "Explains technical ideas simply, a genuine strength in interviews.",
    "Polite and disciplined.",
    ["OOPS design", "Teaching mindset"],
    ["Collections API breadth"],
    ["Solve 20 collections-focused problems this month"],
  ],
  [
    "s20",
    "2026-01-11",
    "Mini Project Review — Spring Boot REST APIs",
    "The REST project had proper layering, validation and exception handling — best in section.",
    "Presented the architecture diagram clearly and fielded questions well.",
    "Proactive — finished the review a day early.",
    ["Spring Boot", "API design", "Project delivery"],
    ["Testing discipline — no unit tests written"],
    ["Add JUnit tests for the service layer"],
  ],
  [
    "s21",
    "2025-10-26",
    "Weekly Assessment — Operating Systems",
    "Attendance in the assessment was low-effort; several sections left blank.",
    "Minimal verbal participation.",
    "Has missed two consecutive remedial sessions. Needs counselor follow-up.",
    ["None observed this cycle"],
    ["Operating Systems", "Engagement", "Follow-through"],
    ["One-on-one session with the trainer this week", "Daily 30-minute guided practice block"],
  ],
  [
    "s24",
    "2026-01-26",
    "Final Mock Interview — Corporate Round",
    "Balanced performance across CS fundamentals and coding. DBMS was the highlight.",
    "Warm, professional communication. Handles pressure well.",
    "Dependable and organised — maintains a proper learning journal.",
    ["DBMS", "Composure under pressure", "Consistency"],
    ["System Design exposure"],
    ["Read one design case study per fortnight and present a summary"],
  ],
];

export const FEEDBACK: TrainerFeedback[] = FEEDBACK_SEEDS.map((f, i) => ({
  id: `f${i + 1}`,
  studentId: f[0],
  date: f[1],
  assessmentName: f[2],
  trainer: "Priya Nair",
  technical: f[3],
  communication: f[4],
  behavior: f[5],
  strengths: f[6],
  weaknesses: f[7],
  improvements: f[8],
  approved: f[0] !== "s21", // one pending-approval record for realism
}));

/* ------------------------------ companies ------------------------------ */

export const COMPANIES: Company[] = [
  {
    id: "c1",
    name: "Infosys",
    role: "Systems Engineer",
    industry: "IT Services",
    minCgpa: 7.0,
    criteria: [
      { skillId: "dsa", minCutoff: 60, weightage: 0.35, mandatory: true },
      { skillId: "comm", minCutoff: 60, weightage: 0.25, mandatory: true },
      { skillId: "oops", minCutoff: 60, weightage: 0.2, mandatory: false },
      { skillId: "java", minCutoff: 55, weightage: 0.2, mandatory: false },
    ],
  },
  {
    id: "c2",
    name: "Cognizant",
    role: "GenC Elevate",
    industry: "IT Services",
    minCgpa: 6.5,
    criteria: [
      { skillId: "dsa", minCutoff: 55, weightage: 0.3, mandatory: true },
      { skillId: "dbms", minCutoff: 55, weightage: 0.25, mandatory: true },
      { skillId: "comm", minCutoff: 60, weightage: 0.25, mandatory: true },
      { skillId: "java", minCutoff: 50, weightage: 0.2, mandatory: false },
    ],
  },
  {
    id: "c3",
    name: "TCS",
    role: "Assistant System Engineer (Ninja)",
    industry: "IT Services",
    minCgpa: 7.0,
    criteria: [
      { skillId: "dsa", minCutoff: 65, weightage: 0.3, mandatory: true },
      { skillId: "cn", minCutoff: 60, weightage: 0.25, mandatory: false },
      { skillId: "os", minCutoff: 60, weightage: 0.2, mandatory: false },
      { skillId: "comm", minCutoff: 60, weightage: 0.25, mandatory: true },
    ],
  },
  {
    id: "c4",
    name: "Accenture",
    role: "Associate Software Engineer",
    industry: "IT Consulting",
    minCgpa: 6.0,
    criteria: [
      { skillId: "comm", minCutoff: 65, weightage: 0.4, mandatory: true },
      { skillId: "oops", minCutoff: 55, weightage: 0.2, mandatory: false },
      { skillId: "java", minCutoff: 50, weightage: 0.2, mandatory: false },
      { skillId: "dsa", minCutoff: 50, weightage: 0.2, mandatory: false },
    ],
  },
];

/* ------------------------------ users ------------------------------ */

export const USERS: AppUser[] = [
  { id: "u1", name: "Anita Deshpande", email: "admin@campus.edu", role: "admin", status: "active", lastActive: "2026-02-14T09:12:00" },
  { id: "t1", name: "Priya Nair", email: "trainer@campus.edu", role: "trainer", status: "active", lastActive: "2026-02-14T08:47:00" },
  { id: "t2", name: "Dr. Rajesh Menon", email: "rajesh.menon@campus.edu", role: "trainer", status: "active", lastActive: "2026-02-13T17:20:00" },
  { id: "t3", name: "Vikram Shetty", email: "vikram.shetty@campus.edu", role: "trainer", status: "active", lastActive: "2026-02-12T11:05:00" },
  { id: "u5", name: "Ananya Sharma", email: "ananya.sharma@campus.edu", role: "student", status: "active", lastActive: "2026-02-14T09:02:00", batch: "2022–2026 CSE" },
  { id: "u6", name: "Rohan Verma", email: "rohan.verma@campus.edu", role: "student", status: "active", lastActive: "2026-02-13T20:41:00", batch: "2022–2026 CSE" },
  { id: "u7", name: "Ishaan Iyer", email: "ishaan.iyer@campus.edu", role: "student", status: "active", lastActive: "2026-02-13T19:15:00", batch: "2022–2026 CSE" },
  { id: "u8", name: "Meera Kulkarni", email: "meera.kulkarni@campus.edu", role: "student", status: "active", lastActive: "2026-02-14T07:58:00", batch: "2022–2026 CSE" },
  { id: "u9", name: "Aditya Rao", email: "aditya.rao@campus.edu", role: "student", status: "inactive", lastActive: "2026-01-28T10:22:00", batch: "2022–2026 CSE" },
  { id: "u10", name: "Sara Fernandes", email: "sara.fernandes@campus.edu", role: "student", status: "active", lastActive: "2026-02-11T14:33:00", batch: "2022–2026 CSE" },
  { id: "u11", name: "Tanvi Deshpande", email: "tanvi.deshpande@campus.edu", role: "student", status: "active", lastActive: "2026-02-10T16:09:00", batch: "2022–2026 CSE" },
  { id: "u12", name: "Nikita Joshi", email: "nikita.joshi@campus.edu", role: "student", status: "active", lastActive: "2026-02-09T12:47:00", batch: "2022–2026 CSE" },
  { id: "u13", name: "Shreya Reddy", email: "shreya.reddy@campus.edu", role: "student", status: "active", lastActive: "2026-02-13T18:30:00", batch: "2022–2026 CSE" },
  { id: "u14", name: "Lakshmi Venkatesh", email: "lakshmi.venkatesh@campus.edu", role: "student", status: "active", lastActive: "2026-02-12T09:19:00", batch: "2022–2026 CSE" },
];

/* ------------------------------ audit logs ------------------------------ */

export const AUDIT_LOGS: AuditLog[] = [
  { id: "l1", user: "Priya Nair", action: "Imported assessment results", module: "Assessments", timestamp: "2026-02-14T08:45:00", record: "Final Mock Interview — Corporate Round (24 rows)", status: "success" },
  { id: "l2", user: "Priya Nair", action: "Approved trainer feedback", module: "Feedback", timestamp: "2026-02-14T08:12:00", record: "Ananya Sharma — Final Mock Interview", status: "success" },
  { id: "l3", user: "Anita Deshpande", action: "Created skill parameter", module: "Skills", timestamp: "2026-02-13T16:40:00", record: "System Design (Software Development)", status: "success" },
  { id: "l4", user: "Anita Deshpande", action: "Deactivated parameter", module: "Skills", timestamp: "2026-02-13T16:38:00", record: "Aptitude (Communication / Soft Skills)", status: "warning" },
  { id: "l5", user: "Dr. Rajesh Menon", action: "Imported assessment results", module: "Assessments", timestamp: "2026-02-12T11:20:00", record: "Weekly Assessment — Java Foundations (6 rows)", status: "success" },
  { id: "l6", user: "Anita Deshpande", action: "Created user account", module: "Users", timestamp: "2026-02-11T10:05:00", record: "lakshmi.venkatesh@campus.edu (Student)", status: "success" },
  { id: "l7", user: "Vikram Shetty", action: "Updated batch trainers", module: "Batches", timestamp: "2026-02-10T14:55:00", record: "2023–2027 CSE", status: "success" },
  { id: "l8", user: "Priya Nair", action: "Import failed — unmapped roll numbers", module: "Assessments", timestamp: "2026-02-09T09:31:00", record: "weekly_dbms_results_v2.xlsx (3 invalid rows)", status: "failed" },
  { id: "l9", user: "Anita Deshpande", action: "Updated company criteria", module: "Companies", timestamp: "2026-02-08T12:18:00", record: "TCS — Assistant System Engineer (Ninja)", status: "success" },
  { id: "l10", user: "Anita Deshpande", action: "Deactivated user", module: "Users", timestamp: "2026-01-28T10:24:00", record: "aditya.rao@campus.edu", status: "warning" },
  { id: "l11", user: "Priya Nair", action: "Generated shortlist export", module: "Company Matching", timestamp: "2026-01-27T15:02:00", record: "Infosys — Systems Engineer (11 candidates)", status: "success" },
  { id: "l12", user: "Dr. Rajesh Menon", action: "Reviewed imported data", module: "Assessments", timestamp: "2026-01-26T17:44:00", record: "Mini Project Review — Spring Boot REST APIs", status: "success" },
];

/* ------------------------------ activity ------------------------------ */

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: "ac1", kind: "import", title: "Results imported", detail: "Final Mock Interview — Corporate Round · 24 students", time: "Today, 08:45" },
  { id: "ac2", kind: "feedback", title: "Feedback approved", detail: "Ananya Sharma — Final Mock Interview review", time: "Today, 08:12" },
  { id: "ac3", kind: "assessment", title: "Assessment conducted", detail: "Weekly Assessment — Java Foundations · 2023–2027", time: "Yesterday, 11:20" },
  { id: "ac4", kind: "system", title: "New parameter activated", detail: "System Design added to Software Development", time: "2 days ago" },
  { id: "ac5", kind: "company", title: "Shortlist exported", detail: "Infosys — Systems Engineer · 11 candidates", time: "Jan 27" },
  { id: "ac6", kind: "import", title: "Import flagged", detail: "weekly_dbms_results_v2.xlsx — 3 rows with unmapped roll numbers", time: "Jan 26" },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", title: "Import needs review", detail: "Final Mock Interview results were imported with 2 warnings.", time: "12 min ago", unread: true },
  { id: "n2", title: "Feedback pending approval", detail: "Harshad Patil — OS review is awaiting your approval.", time: "2 h ago", unread: true },
  { id: "n3", title: "Placement drive update", detail: "Infosys Systems Engineer drive opens Feb 24.", time: "Yesterday", unread: false },
];

/* ------------------------------ demo accounts ------------------------------ */

export const DEMO_ACCOUNTS = [
  { email: "trainer@campus.edu", password: "placepro", role: "trainer" as const, name: "Priya Nair", userId: "t1", title: "Technical Trainer", studentId: undefined },
  { email: "ananya.sharma@campus.edu", password: "placepro", role: "student" as const, name: "Ananya Sharma", userId: "u5", title: "Student · 2022–2026 CSE", studentId: "s1" },
  { email: "admin@campus.edu", password: "placepro", role: "admin" as const, name: "Anita Deshpande", userId: "u1", title: "Administrator", studentId: undefined },
];

/* ------------------------------ shared derived helpers ------------------------------ */

export function domainAverage(students: Student[], domain: string): number {
  const group = DOMAIN_GROUPS.find((g) => g.label === domain);
  if (!group) return 0;
  const vals = students.flatMap((s) => group.skills.filter((id) => s.scores[id] !== undefined).map((id) => s.scores[id]));
  return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : 0;
}

/** Month-wise batch performance from assessment results */
export function monthlyPerformance(batch: string): { month: string; average: number }[] {
  const assessments = ASSESSMENTS.filter((a) => a.batch === batch);
  const byMonth = new Map<string, number[]>();
  for (const a of assessments) {
    const d = new Date(a.date);
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    const avg = a.results.reduce((s, r) => s + r.percentage, 0) / a.results.length;
    if (!byMonth.has(label)) byMonth.set(label, []);
    byMonth.get(label)!.push(avg);
  }
  return Array.from(byMonth.entries()).map(([month, arr]) => ({
    month,
    average: round(arr.reduce((a, b) => a + b, 0) / arr.length, 1),
  }));
}

export function studentDomainScore(student: Student, domain: string): number {
  const group = DOMAIN_GROUPS.find((g) => g.label === domain);
  if (!group) return 0;
  const ids = group.skills.filter((id) => student.scores[id] !== undefined);
  return ids.length ? round(ids.reduce((a, id) => a + student.scores[id], 0) / ids.length, 1) : 0;
}

export function weakestDomain(student: Student): { domain: string; score: number } {
  const entries = DOMAIN_GROUPS.map((g) => ({ domain: g.label, score: studentDomainScore(student, g.label) }));
  return entries.reduce((min, e) => (e.score < min.score ? e : min), entries[0]);
}
