"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileSpreadsheet,
  Loader2,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import { BATCHES, STUDENTS, STUDENT_BY_ID } from "@/lib/placepro/mock-data";
import type { Assessment, AssessmentResult, ImportedSource, Skill, Student } from "@/types";
import { PageHeader, SectionHeading } from "@/components/placepro/shared/page-header";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Import workflow — 6-step spreadsheet import wizard                   */
/* ------------------------------------------------------------------ */

const STEP_LABELS = [
  "Assessment type",
  "Upload",
  "Preview",
  "Column mapping",
  "Validation",
  "Confirm",
] as const;

const SAMPLE_BATCH = BATCHES[0]?.name ?? "2022–2026 CSE";
const SAMPLE_HEADERS = [
  "Roll No",
  "Student Name",
  "DSA (100)",
  "DBMS (50)",
  "OS (50)",
  "CN (50)",
  "OOPS (50)",
  "Java (50)",
  "Spring Boot (50)",
  "Communication (25)",
  "Trainer Remarks",
];
const SAMPLE_MAXES = [100, 50, 50, 50, 50, 50, 50, 25];
const SAMPLE_REMARKS = [
  "Improved graph handling",
  "Needs DBMS revision",
  "Strong problem solving",
  "Work on communication pace",
  "Consistent performer",
  "Revise OS scheduling",
  "Good Java fundamentals",
  "Below cutoff in CN",
];

/* ------------------------------- types ------------------------------- */

interface ParsedSheet {
  headers: string[];
  rows: string[][];
}
interface FileInfo {
  name: string;
  size: string;
}
interface ValidRow {
  rowNo: number;
  roll: string;
  studentId: string;
  values: Record<number, number>;
}
interface RowIssue {
  rowNo: number;
  roll: string;
  reason: string;
}

/* ------------------------------ helpers ------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headerTokens(h: string): string[] {
  return h.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Max marks from a header like "DSA (100)", else the 100 default. */
function defaultMaxMarks(header: string): number {
  const m = /\((\d+(?:\.\d+)?)\)/.exec(header);
  return m ? Number(m[1]) : 100;
}

/** Fuzzy header matching vocabulary for the auto-suggest engine. */
const SKILL_ALIASES: Record<string, string[]> = {
  dsa: ["dsa", "datastructures", "algorithms"],
  dbms: ["dbms", "database"],
  os: ["os", "operatingsystem"],
  cn: ["cn", "networks", "networking"],
  oops: ["oops", "oop"],
  java: ["java", "corejava"],
  springboot: ["springboot", "spring"],
  comm: ["comm", "communication", "communications", "softskills", "commskills"],
  sysdesign: ["sysdesign", "systemdesign"],
  aptitude: ["aptitude", "quant"],
};

function autoSuggestMapping(headers: string[], skills: Skill[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  let rollTaken = false;
  let nameTaken = false;

  // longest candidate aliases first so "communication" wins over shorter keys
  const ordered = [...skills]
    .map((sk) => {
      const candidates = [
        normalizeHeader(sk.name),
        sk.id,
        ...(SKILL_ALIASES[sk.id] ?? []),
      ].filter(Boolean);
      const longest = candidates.reduce((a, c) => (c.length > a.length ? c : a), "");
      return { skill: sk, candidates, longest };
    })
    .sort((a, b) => b.longest.length - a.longest.length);

  headers.forEach((header, i) => {
    const norm = normalizeHeader(header);
    const tokens = headerTokens(header);

    if (!rollTaken && (norm.includes("roll") || norm.includes("regn") || norm.includes("registration"))) {
      mapping[i] = "roll";
      rollTaken = true;
      return;
    }
    if (!nameTaken && (norm.includes("name") || norm === "student")) {
      mapping[i] = "name";
      nameTaken = true;
      return;
    }
    const hit = ordered.find(({ candidates }) =>
      candidates.some((c) => norm === c || (c.length >= 4 && norm.includes(c)) || tokens.includes(c)),
    );
    mapping[i] = hit ? hit.skill.id : "ignore";
  });
  return mapping;
}

/** Match a spreadsheet roll against the batch roster (case / leading-zero tolerant). */
function findStudentByRoll(roll: string, batch: string): Student | undefined {
  const norm = roll.trim().toLowerCase();
  const noZeros = norm.replace(/^0+/, "");
  return Object.values(STUDENT_BY_ID).find(
    (s) =>
      s.batch === batch &&
      (s.rollNumber.toLowerCase() === norm ||
        s.rollNumber.toLowerCase().replace(/^0+/, "") === noZeros),
  );
}

function sanitizeGrid(grid: string[][]): ParsedSheet | null {
  const rows = grid.map((r) => r.map((c) => String(c ?? "").trim()));
  while (rows.length > 1 && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => rows[0][i] ?? "");
  const data = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  if (!headers.some(Boolean) || data.length === 0) return null;
  return { headers, rows: data };
}

/* --------------------------- sample dataset --------------------------- */

function sampleScore(seed: string, max: number): number {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pct = 45 + ((h % 1000) / 1000) * 50; // 45–95 % of max marks
  return Math.max(1, Math.round((pct / 100) * max));
}

function buildSampleSheet(): ParsedSheet {
  const students = STUDENTS.filter((s) => s.batch === SAMPLE_BATCH).slice(0, 24);
  const toRow = (roll: string, name: string, seedSuffix: string, remark: string): string[] => [
    roll,
    name,
    ...SAMPLE_MAXES.map((max, i) => String(sampleScore(`${roll}:${i}:${seedSuffix}`, max))),
    remark,
  ];

  const rows = students.map((s, i) =>
    toRow(s.rollNumber, s.name, "main", SAMPLE_REMARKS[i % SAMPLE_REMARKS.length] ?? ""),
  );

  // deliberately broken rows so validation warnings are demonstrable
  const dup = students[3];
  if (dup) rows.push(toRow(dup.rollNumber, dup.name, "reattempt", "Reattempt — improved"));
  rows.push(toRow("22CS999", "Unmapped Student", "unknown", "Roll not found in batch"));

  return { headers: SAMPLE_HEADERS, rows };
}

/* ------------------------------ component ------------------------------ */

export default function ImportWorkflow() {
  const { toast } = useToast();
  const user = useAppStore((s) => s.user);
  const skills = useAppStore((s) => s.skills);
  const importAssessment = useAppStore((s) => s.importAssessment);
  const navigate = useAppStore((s) => s.navigate);

  /* step 1 */
  const [step, setStep] = useState(1);
  const [assessType, setAssessType] = useState<"exam" | "mock-interview">("exam");
  const [name, setName] = useState("");
  const [batch, setBatch] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  /* step 2 */
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);

  /* step 4 */
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [maxMarks, setMaxMarks] = useState<Record<number, string>>({});

  /* step 6 */
  const [confirming, setConfirming] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const activeSkills = useMemo(
    () => skills.filter((s) => s.active && s.parameterType === "numeric"),
    [skills],
  );

  /* --------------------------- parsing pipeline --------------------------- */

  const applyParsed = (parsed: ParsedSheet, info: FileInfo) => {
    setSheet(parsed);
    setFileInfo(info);
    const suggested = autoSuggestMapping(parsed.headers, activeSkills);
    setMapping(suggested);
    const mm: Record<number, string> = {};
    Object.entries(suggested).forEach(([i, target]) => {
      if (activeSkills.some((s) => s.id === target)) {
        mm[Number(i)] = String(defaultMaxMarks(parsed.headers[Number(i)] ?? ""));
      }
    });
    setMaxMarks(mm);
    setUploading(false);
    setStep(3);
  };

  const simulateUpload = (onComplete: () => void) => {
    setUploading(true);
    setProgress(0);
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + 7 + Math.random() * 11);
      setProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        timerRef.current = null;
        onComplete();
      }
    }, 60);
    timerRef.current = timer;
  };

  const parseWorkbook = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const first = wb.SheetNames[0] ?? "";
      const ws = wb.Sheets[first];
      if (!ws) throw new Error("no sheet");
      const grid = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown as string[][];
      const parsed = sanitizeGrid(grid);
      if (!parsed) throw new Error("empty sheet");
      applyParsed(parsed, { name: file.name, size: formatBytes(file.size) });
    } catch {
      setFileError(
        "We couldn't read this spreadsheet. Make sure it contains a header row and at least one data row.",
      );
      setUploading(false);
    }
  };

  const handleFile = (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".xlsx", ".xls", ".csv"].includes(ext)) {
      setFileError(`“${file.name}” isn't a supported format. Upload a .xlsx, .xls or .csv spreadsheet.`);
      return;
    }
    setFileError(null);
    setSheet(null);
    const info = { name: file.name, size: formatBytes(file.size) };
    setFileInfo(info);
    simulateUpload(() => void parseWorkbook(file));
  };

  const loadSample = () => {
    setFileError(null);
    setSheet(null);
    const sample = buildSampleSheet();
    const csv = [sample.headers, ...sample.rows].map((r) => r.join(",")).join("\n");
    const info = { name: "sample-coding-assessment.csv", size: formatBytes(new Blob([csv]).size) };
    setFileInfo(info);
    simulateUpload(() => applyParsed(sample, info));
  };

  /* ------------------------------ validation ------------------------------ */

  const validation = useMemo(() => {
    if (!sheet) return null;
    const entries = Object.entries(mapping).map(([i, t]) => ({ col: Number(i), target: t }));
    const rollCol = entries.find((e) => e.target === "roll")?.col ?? null;
    const skillCols = entries
      .filter((e) => activeSkills.some((s) => s.id === e.target))
      .map((e) => e.col);
    const mappedCols = entries.filter((e) => e.target !== "ignore").map((e) => e.col);

    const validRows: ValidRow[] = [];
    const issues: RowIssue[] = [];
    const unknownRolls: string[] = [];
    const seen = new Map<string, number>();

    if (rollCol !== null) {
      sheet.rows.forEach((row, idx) => {
        const rowNo = idx + 2; // header occupies spreadsheet row 1
        const roll = (row[rollCol] ?? "").trim();
        if (!roll) {
          issues.push({ rowNo, roll: "—", reason: "Roll number is missing" });
          return;
        }
        const student = findStudentByRoll(roll, batch);
        if (!student) {
          issues.push({
            rowNo,
            roll,
            reason: "Unknown roll number — no matching student in this batch",
          });
          unknownRolls.push(roll);
          return;
        }
        const key = roll.toLowerCase();
        const firstRow = seen.get(key);
        if (firstRow !== undefined) {
          issues.push({
            rowNo,
            roll,
            reason: `Duplicate roll number — also appears in row ${firstRow}`,
          });
          return;
        }
        seen.set(key, rowNo);

        const values: Record<number, number> = {};
        let badScore: string | null = null;
        for (const c of skillCols) {
          const raw = (row[c] ?? "").trim();
          if (raw === "" || Number.isNaN(Number(raw))) {
            badScore = sheet.headers[c] || `Column ${c + 1}`;
            break;
          }
          values[c] = Number(raw);
        }
        if (badScore) {
          issues.push({ rowNo, roll, reason: `Missing or invalid score in “${badScore}”` });
          return;
        }
        validRows.push({ rowNo, roll, studentId: student.id, values });
      });
    }

    const duplicateCount = issues.filter((i) => i.reason.startsWith("Duplicate")).length;
    const emptyCells = mappedCols
      .map((c) => ({
        header: sheet.headers[c] || `Column ${c + 1}`,
        count: sheet.rows.filter((r) => (r[c] ?? "").trim() === "").length,
      }))
      .filter((e) => e.count > 0);
    const unmappedCount = sheet.headers.length - mappedCols.length;

    return { rollCol, skillCols, mappedCols, validRows, issues, duplicateCount, unknownRolls, emptyCells, unmappedCount };
  }, [sheet, mapping, batch, activeSkills]);

  /* ------------------------------- actions ------------------------------- */

  const handleMapChange = (colIdx: number, target: string) => {
    if (!sheet) return;
    const conflicting = Object.entries(mapping).find(
      ([i, t]) => Number(i) !== colIdx && t === target && target !== "ignore",
    );
    setMapping((prev) => {
      const next = { ...prev };
      if (conflicting) next[Number(conflicting[0])] = "ignore";
      next[colIdx] = target;
      return next;
    });
    if (target !== "ignore" && activeSkills.some((s) => s.id === target)) {
      setMaxMarks((prev) =>
        prev[colIdx] !== undefined
          ? prev
          : { ...prev, [colIdx]: String(defaultMaxMarks(sheet.headers[colIdx] ?? "")) },
      );
    }
    if (conflicting && target === "roll") {
      toast({
        title: "Roll number column reassigned",
        description: `“${sheet.headers[Number(conflicting[0])] || `Column ${Number(conflicting[0]) + 1}`}” was unmapped — roll numbers can only come from one column.`,
      });
    }
  };

  const handleConfirm = () => {
    if (!validation || !sheet || !fileInfo || !user) return;
    setConfirming(true);
    window.setTimeout(() => {
      const sourceId = `src-${Date.now()}`;
      const results: AssessmentResult[] = validation.validRows.map((v) => {
        let marks = 0;
        let max = 0;
        for (const c of validation.skillCols) {
          marks += v.values[c] ?? 0;
          const configured = Number(maxMarks[c]);
          max += configured > 0 ? configured : defaultMaxMarks(sheet.headers[c] ?? "");
        }
        max = Math.max(1, max);
        return {
          studentId: v.studentId,
          marks: Math.round(marks * 10) / 10,
          maxMarks: max,
          percentage: Math.round((marks / max) * 1000) / 10,
        };
      });
      const assessment: Assessment = {
        id: `imp-${Date.now()}`,
        name: name.trim(),
        type: assessType,
        batch,
        date,
        uploadedBy: user.name,
        results,
        reviewed: false,
        sourceId,
      };
      const source: ImportedSource = {
        id: sourceId,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.name,
        rowCount: sheet.rows.length,
        columnCount: sheet.headers.length,
        headers: sheet.headers,
        sampleRows: sheet.rows.slice(0, 5),
        assessmentName: name.trim(),
      };
      importAssessment(assessment, source);
      setDoneCount(results.length);
      setConfirming(false);
      toast({
        title: "Import complete",
        description: `${results.length} student records added to “${name.trim()}” — pending review.`,
      });
    }, 700);
  };

  const resetWizard = () => {
    setStep(1);
    setAssessType("exam");
    setName("");
    setBatch("");
    setDate(new Date().toISOString().slice(0, 10));
    setDragging(false);
    setUploading(false);
    setProgress(0);
    setFileError(null);
    setFileInfo(null);
    setSheet(null);
    setMapping({});
    setMaxMarks({});
    setConfirming(false);
    setDoneCount(null);
  };

  /* --------------------------- derived guards --------------------------- */

  const step1Valid = name.trim().length > 0 && batch !== "" && date !== "";
  const rollMapped = validation?.rollCol != null;
  const skillsMapped = (validation?.skillCols.length ?? 0) > 0;
  const mappedSkillNames = (validation?.skillCols ?? [])
    .map((c) => activeSkills.find((s) => s.id === mapping[c])?.name)
    .filter((n): n is string => Boolean(n));

  const typeCards = [
    {
      value: "exam" as const,
      title: "Exam / Coding Assessment",
      description: "Contests, weekly tests and project reviews scored by marks.",
      icon: FileCode2,
    },
    {
      value: "mock-interview" as const,
      title: "Mock Interview",
      description: "Technical and HR rounds with rubric-based scoring.",
      icon: MessagesSquare,
    },
  ];

  const targetLabel = (target: string): string => {
    if (target === "roll") return "Roll number";
    if (target === "name") return "Name";
    if (target === "ignore") return "Ignored";
    return activeSkills.find((s) => s.id === target)?.name ?? target;
  };

  /* ------------------------------ success ------------------------------ */

  if (doneCount !== null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Import results"
          subtitle="Upload a spreadsheet of exam or mock-interview scores — original files are always preserved."
        />
        <Card className="rounded-xl border-border bg-card p-0 shadow-none">
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" aria-hidden />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-foreground">Import complete</h2>
            <p className="mt-1.5 text-sm text-foreground">
              <span className="tabular font-semibold">{doneCount}</span> student record
              {doneCount === 1 ? "" : "s"} added to “{name.trim()}”.
            </p>
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              The original spreadsheet is preserved as a source record, and the results are pending
              review before they count towards student profiles and placement readiness.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" onClick={resetWizard}>
                <UploadCloud className="size-4" /> Import another file
              </Button>
              <Button className="bg-primary hover:bg-primary-hover" onClick={() => navigate("assessments")}>
                View assessments
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ------------------------------- wizard ------------------------------- */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import results"
        subtitle="Upload a spreadsheet of exam or mock-interview scores — map columns, validate, and publish. Original files are always preserved."
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("assessments")}>
            Back to assessments
          </Button>
        }
      />

      {/* stepper */}
      <Card className="rounded-xl border-border bg-card p-4 shadow-none">
        <nav aria-label="Import progress" className="flex flex-wrap items-center gap-y-2">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const complete = n < step;
            return (
              <Fragment key={label}>
                <button
                  type="button"
                  disabled={!complete}
                  onClick={() => complete && setStep(n)}
                  aria-current={n === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors",
                    complete ? "cursor-pointer hover:bg-muted/60" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      n === step
                        ? "bg-primary text-white"
                        : complete
                          ? "bg-primary-soft text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3.5" aria-hidden /> : n}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap",
                      n === step ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </button>
                {i < STEP_LABELS.length - 1 && (
                  <ChevronRight
                    className="mx-0.5 hidden size-3.5 shrink-0 text-border sm:block"
                    aria-hidden
                  />
                )}
              </Fragment>
            );
          })}
        </nav>
      </Card>

      <Card className="gap-0 rounded-xl border-border bg-card p-0 shadow-none">
        {/* ------------------------------ step 1 ------------------------------ */}
        {step === 1 && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Select assessment type"
                description="What kind of evaluation are these results from?"
              />
            </div>
            <div className="space-y-6 px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {typeCards.map((c) => {
                  const Icon = c.icon;
                  const selectedCard = assessType === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setAssessType(c.value)}
                      aria-pressed={selectedCard}
                      className={cn(
                        "relative rounded-xl border p-4 text-left transition-colors",
                        selectedCard
                          ? "border-primary bg-primary-soft/50"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      {selectedCard && (
                        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                      <Icon
                        className={cn("size-5", selectedCard ? "text-primary" : "text-muted-foreground")}
                        aria-hidden
                      />
                      <p className="mt-2.5 text-sm font-semibold text-foreground">{c.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        {c.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="assess-name">
                    Assessment name <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="assess-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Weekly Assessment — DBMS"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Batch <span className="text-danger">*</span>
                  </Label>
                  <Select value={batch} onValueChange={setBatch}>
                    <SelectTrigger className="h-9 w-full text-sm" aria-label="Select batch">
                      <SelectValue placeholder="Select a batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {BATCHES.map((b) => (
                        <SelectItem key={b.id} value={b.name}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assess-date">
                    Date <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="assess-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ------------------------------ step 2 ------------------------------ */}
        {step === 2 && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Upload spreadsheet"
                description="Drop an Excel or CSV file with one row per student."
              />
            </div>
            <div className="space-y-4 px-5 py-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging ? "border-primary bg-primary-soft/30" : "border-border bg-card",
                )}
              >
                <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Drag &amp; drop your spreadsheet here
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Supports .xlsx, .xls and .csv — the first sheet is imported
                </p>
                <Button
                  variant="outline"
                  className="mt-4 h-9"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  Browse files
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-[13px] text-primary"
                  onClick={loadSample}
                  disabled={uploading}
                >
                  <Sparkles className="size-3.5" /> Load sample spreadsheet
                </Button>
              </div>

              {fileInfo && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                  <FileSpreadsheet className="size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{fileInfo.name}</p>
                    <p className="text-xs text-muted-foreground">{fileInfo.size}</p>
                  </div>
                  {!uploading && sheet && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success">
                      <Check className="size-3.5" aria-hidden /> Parsed
                    </span>
                  )}
                </div>
              )}

              {uploading && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Uploading &amp; parsing…</span>
                    <span className="tabular">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              {fileError && (
                <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft/40 px-4 py-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-danger">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    Couldn&apos;t use this file
                  </p>
                  <p className="mt-1 pl-6 text-[13px] leading-relaxed text-foreground">{fileError}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ------------------------------ step 3 ------------------------------ */}
        {step === 3 && sheet && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Spreadsheet preview"
                description="First 8 rows of the parsed file — check the headers look right before mapping."
              />
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Rows", value: sheet.rows.length },
                  { label: "Columns", value: sheet.headers.length },
                  { label: "Headers detected", value: sheet.headers.filter(Boolean).length },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
                  >
                    {chip.label}: <span className="tabular">{chip.value}</span>
                  </span>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="max-h-80 overflow-auto pp-scrollbar">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                        <th className="py-2.5 pl-3 pr-2 font-medium">#</th>
                        {sheet.headers.map((h, i) => (
                          <th key={i} className="whitespace-nowrap px-2 py-2.5 font-medium">
                            {h || `Column ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, 8).map((row, ri) => (
                        <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/60">
                          <td className="tabular py-2.5 pl-3 pr-2 text-xs text-muted-foreground">{ri + 1}</td>
                          {sheet.headers.map((_, ci) => (
                            <td key={ci} className="whitespace-nowrap px-2 py-2.5 text-[13px] text-foreground">
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {sheet.rows.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  Showing first 8 of {sheet.rows.length} rows — the full file is preserved as a source record.
                </p>
              )}
            </div>
          </>
        )}

        {/* ------------------------------ step 4 ------------------------------ */}
        {step === 4 && sheet && validation && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Column mapping"
                description="Tell PlacePro what each spreadsheet column means — unmapped columns are kept but not scored."
              />
            </div>
            <div className="space-y-4 px-5 py-5">
              {/* roll-number summary chip */}
              {validation.rollCol !== null ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                  <Check className="size-3.5" aria-hidden />
                  Roll number column: mapped to “{sheet.headers[validation.rollCol] || `Column ${validation.rollCol + 1}`}”
                </p>
              ) : (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Roll number column: not mapped — required to match students
                </p>
              )}

              <div className="space-y-2.5">
                {sheet.headers.map((header, i) => {
                  const target = mapping[i] ?? "ignore";
                  const isSkill = activeSkills.some((s) => s.id === target);
                  const sample = sheet.rows[0]?.[i]?.trim() ?? "";
                  return (
                    <div
                      key={i}
                      className={cn(
                        "grid gap-3 rounded-xl border p-3.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,260px)] sm:items-center",
                        target === "roll" ? "border-primary/50" : "border-border",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {header || `Column ${i + 1}`}
                          </p>
                          {target === "roll" ? (
                            <StatusBadge tone="info">Required</StatusBadge>
                          ) : target === "ignore" ? (
                            <StatusBadge tone="neutral" dot={false}>
                              Ignored
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="success">Mapped</StatusBadge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          e.g. {sample || "—"}
                        </p>
                      </div>
                      <ArrowRight
                        className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                        aria-hidden
                      />
                      <div className="space-y-2">
                        <Select value={target} onValueChange={(v) => handleMapChange(i, v)}>
                          <SelectTrigger
                            aria-label={`Map column ${header || i + 1}`}
                            className="h-9 w-full text-sm"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="roll">Student Roll Number</SelectItem>
                            <SelectItem value="name">Student Name</SelectItem>
                            {activeSkills.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="ignore">Ignore this column</SelectItem>
                          </SelectContent>
                        </Select>
                        {isSkill && (
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`max-${i}`}
                              className="shrink-0 text-xs text-muted-foreground"
                            >
                              Max marks
                            </Label>
                            <Input
                              id={`max-${i}`}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              className="h-8 w-24 text-sm"
                              value={maxMarks[i] ?? ""}
                              placeholder={String(defaultMaxMarks(header))}
                              onChange={(e) =>
                                setMaxMarks((prev) => ({ ...prev, [i]: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* inline warnings */}
              {(validation.emptyCells.length > 0 ||
                validation.duplicateCount > 0 ||
                validation.unknownRolls.length > 0) && (
                <div className="space-y-2.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-warning">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    Data warnings — these rows will be flagged on the next step
                  </p>
                  <ul className="space-y-1 text-[13px] leading-relaxed text-foreground">
                    {validation.emptyCells.map((e) => (
                      <li key={e.header}>
                        “{e.header}” has {e.count} empty cell{e.count === 1 ? "" : "s"}
                      </li>
                    ))}
                    {validation.duplicateCount > 0 && (
                      <li>
                        {validation.duplicateCount} duplicate roll number row
                        {validation.duplicateCount === 1 ? "" : "s"} — only the first occurrence is imported
                      </li>
                    )}
                    {validation.unknownRolls.length > 0 && (
                      <li>
                        {validation.unknownRolls.length} roll number
                        {validation.unknownRolls.length === 1 ? "" : "s"} not matching any student in{" "}
                        {batch || "the selected batch"}
                        {validation.unknownRolls.length > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({validation.unknownRolls.slice(0, 5).join(", ")}
                            {validation.unknownRolls.length > 5 ? ", …" : ""})
                          </span>
                        )}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* ------------------------------ step 5 ------------------------------ */}
        {step === 5 && validation && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Validation summary"
                description="Rows that pass will be imported; problem rows are skipped and listed below."
              />
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: "Valid rows", value: validation.validRows.length, cls: "text-success" },
                  { label: "Invalid rows", value: validation.issues.length, cls: "text-danger" },
                  { label: "Duplicate records", value: validation.duplicateCount, cls: "text-warning" },
                  { label: "Unmapped columns", value: validation.unmappedCount, cls: "text-muted-foreground" },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{tile.label}</p>
                    <p className={cn("tabular mt-1.5 text-2xl font-semibold", tile.cls)}>{tile.value}</p>
                  </div>
                ))}
              </div>

              {validation.issues.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg bg-success-soft/50 px-3.5 py-2.5 text-[13px] font-medium text-success">
                  <Check className="size-4 shrink-0" aria-hidden />
                  Every row passed validation — nothing will be skipped.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <ul className="max-h-72 divide-y divide-border/50 overflow-y-auto pp-scrollbar">
                    {validation.issues.map((issue) => (
                      <li
                        key={`${issue.rowNo}-${issue.roll}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2 text-[13px]"
                      >
                        <span className="tabular shrink-0 text-muted-foreground">Row {issue.rowNo}</span>
                        <span className="shrink-0 font-semibold text-foreground">{issue.roll}</span>
                        <span className="text-muted-foreground">— {issue.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Unrecognized columns are preserved in the source record — nothing is discarded.
              </p>
            </div>
          </>
        )}

        {/* ------------------------------ step 6 ------------------------------ */}
        {step === 6 && sheet && validation && (
          <>
            <div className="border-b border-border/70 px-5 py-4">
              <SectionHeading
                title="Confirm import"
                description="Review the details below — the original spreadsheet is stored alongside the assessment."
              />
            </div>
            <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
              <div className="divide-y divide-border/60 rounded-xl border border-border px-4 py-1">
                {[
                  { label: "Assessment name", value: name.trim() },
                  { label: "Type", value: assessType === "exam" ? "Exam / Coding Assessment" : "Mock Interview" },
                  { label: "Batch", value: batch },
                  { label: "Date", value: date },
                  { label: "Source file", value: fileInfo ? `${fileInfo.name} (${fileInfo.size})` : "—" },
                  { label: "Rows to import", value: String(validation.validRows.length) },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-[13px] text-muted-foreground">{row.label}</span>
                    <span className="text-right text-sm font-medium text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Mapped columns</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {validation.mappedCols.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {sheet.headers[c] || `Column ${c + 1}`} → {targetLabel(mapping[c] ?? "ignore")}
                      </span>
                    ))}
                    {validation.mappedCols.length === 0 && (
                      <span className="text-xs text-muted-foreground">No columns mapped</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">Skills being recorded</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mappedSkillNames.map((skillName) => (
                      <span
                        key={skillName}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {skillName}
                      </span>
                    ))}
                    {mappedSkillNames.length === 0 && (
                      <span className="text-xs text-muted-foreground">No skills mapped</span>
                    )}
                  </div>
                </div>
                <p className="rounded-lg bg-muted/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  Results are imported as <span className="font-medium text-foreground">pending review</span> —
                  they count towards student profiles once a trainer approves them from the assessments list.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ------------------------------ footer ------------------------------ */}
        <div className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Step {step} of {STEP_LABELS.length}
            {sheet && step >= 3 ? ` · ${fileInfo?.name ?? ""}` : ""}
          </p>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={uploading}>
                <ChevronLeft className="size-4" /> Back
              </Button>
            )}
            {step < 6 ? (
              <Button
                className="bg-primary hover:bg-primary-hover"
                disabled={
                  (step === 1 && !step1Valid) ||
                  (step === 2 && !sheet) ||
                  (step === 4 && (!rollMapped || !skillsMapped)) ||
                  (step === 5 && validation !== null && validation.validRows.length === 0)
                }
                onClick={() => setStep(step + 1)}
              >
                Continue <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                className="bg-primary hover:bg-primary-hover"
                disabled={confirming || (validation?.validRows.length ?? 0) === 0}
                onClick={handleConfirm}
              >
                {confirming ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Importing…
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="size-4" /> Confirm import
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
