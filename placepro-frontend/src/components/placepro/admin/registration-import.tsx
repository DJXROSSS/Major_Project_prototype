"use client";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Batch } from "@/types";
import { api, type RegistrationImportResult } from "@/lib/placepro/api";
import { useAppStore } from "@/lib/placepro/store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function RegistrationImport({
  role,
  batches,
  batchesLoading,
  batchError,
  onBusy,
  onRegistered,
}: {
  role: "student" | "trainer";
  batches: Batch[];
  batchesLoading: boolean;
  batchError: string;
  onBusy: (busy: boolean) => void;
  onRegistered?: (email: string) => void;
}) {
  const kind = role === "student" ? "students" : "trainers";
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RegistrationImportResult | null>(null);
  const [activity, setActivity] = useState<"template" | "preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"valid-only" | "strict">("valid-only");
  const [chunkChoice, setChunkChoice] = useState("500");
  const [customChunkSize, setCustomChunkSize] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const { toast } = useToast();
  const busy = activity !== null;
  const chunkInput = chunkChoice === "custom" ? customChunkSize : chunkChoice;
  const selectedChunkSize = Number(chunkInput);
  const chunkSizeIsValid = /^\d+$/.test(chunkInput) && selectedChunkSize >= 50 && selectedChunkSize <= 1000;
  const validation = result?.summary;
  const strictBlocked = mode === "strict" && validation?.valid !== validation?.total;
  const processingRows = strictBlocked ? 0 : validation?.valid ?? 0;
  const totalChunks = chunkSizeIsValid ? Math.ceil(processingRows / selectedChunkSize) : null;
  const previewPageSize = 100;
  const previewRows = result?.rows.slice(previewPage * previewPageSize, (previewPage + 1) * previewPageSize) ?? [];
  const previewPageCount = result ? Math.max(1, Math.ceil(result.rows.length / previewPageSize)) : 1;
  const run = async (phase: NonNullable<typeof activity>, action: () => Promise<void>) => {
    setActivity(phase);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to process import.",
      );
    } finally {
      setActivity(null);
      onBusy(false);
    }
  };
  const keys =
    role === "student"
      ? ["rollNumber", "name", "email", "mobileNumber", "section", "cgpa"]
      : ["name", "email", "mobileNumber", "assignedBatches"];
  const labels: Record<string, string> = {
    rollNumber: "Roll number",
    name: "Full name",
    email: "Email",
    mobileNumber: "Mobile number",
    section: "Section",
    cgpa: "CGPA",
    assignedBatches: "Assigned batches",
  };
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload .xlsx, .xls or .csv. Maximum 5 MB and 5,000 records. Preview
        validates records without creating accounts.
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void run("template", async () => {
            const template = await api.registrationTemplate(kind);
            const bytes = Uint8Array.from(atob(template.contentBase64), (c) =>
              c.charCodeAt(0),
            );
            download(
              bytes,
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              template.fileName,
            );
          })
        }
      >
        Download Excel Template
      </Button>
      {role === "student" && (
        <div className="space-y-1">
          <Label htmlFor="import-registration-batch">Academic batch *</Label>
          <Select
            disabled={busy || batchesLoading}
            value={batchId}
            onValueChange={(value) => {
              setBatchId(value);
              setResult(null);
              setPreviewPage(0);
            }}
          >
            <SelectTrigger id="import-registration-batch">
              <SelectValue placeholder="Select a batch before uploading" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {role === "trainer" && (
        <p className="text-sm text-muted-foreground">
          Use existing batch names or IDs from the template&apos;s Instructions
          sheet. Separate multiple assignments with semicolons.
        </p>
      )}
      {batchesLoading ? (
        <p className="text-sm">Loading batches...</p>
      ) : batchError ? (
        <p role="alert" className="text-sm text-destructive">
          {batchError}
        </p>
      ) : !batches.length ? (
        <p className="text-sm">Create an active batch before importing.</p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="registration-chunk-size">Chunk size</Label>
        <div className="flex flex-wrap gap-2">
          <Select disabled={busy} value={chunkChoice} onValueChange={setChunkChoice}>
            <SelectTrigger id="registration-chunk-size" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 records</SelectItem>
              <SelectItem value="250">250 records</SelectItem>
              <SelectItem value="500">500 records</SelectItem>
              <SelectItem value="1000">1,000 records</SelectItem>
              <SelectItem value="custom">Custom size</SelectItem>
            </SelectContent>
          </Select>
          {chunkChoice === "custom" ? <Input aria-label="Custom chunk size" aria-invalid={!chunkSizeIsValid} type="number" min={50} max={1000} step={1} disabled={busy} value={customChunkSize} onChange={(event) => setCustomChunkSize(event.target.value)} placeholder="50–1,000" className="w-36" /> : null}
        </div>
        {!chunkSizeIsValid ? <p className="text-xs text-destructive">Choose a whole number from 50 to 1,000.</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="registration-file">Excel/CSV file</Label>
        <Input
          id="registration-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={busy || (role === "student" && !batchId)}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
            setPreviewPage(0);
            setError("");
          }}
        />
      </div>
      <Button
        disabled={
          busy ||
          !file ||
          !!batchError ||
          batchesLoading ||
          !batches.length ||
          !chunkSizeIsValid ||
          (role === "student" && !batchId)
        }
        onClick={() =>
          void run("preview", async () => {
            if (!file) return;
            if (file.size > 5 * 1024 * 1024)
              throw new Error("File exceeds 5 MB.");
            const form = new FormData();
            form.append("file", file);
            form.append("chunkSize", String(selectedChunkSize));
            if (role === "student") form.append("academicBatchId", batchId);
            setResult(await api.previewRegistrationImport(kind, form));
            setPreviewPage(0);
          })
        }
      >
        Preview and Validate
      </Button>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
          {activity === "confirm" ? "Importing records. Securing login credentials can take several minutes for large files. Keep this dialog open." :
            activity === "preview" ? "Reading and validating the file…" : "Downloading the template…"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="break-all text-sm font-medium">{result.fileName ?? file?.name}</p>
          {result.confirmed ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              Imported {result.imported?.toLocaleString()} · Skipped {((result.skipped ?? 0) - (result.failed ?? 0)).toLocaleString()} · Failed {(result.failed ?? 0).toLocaleString()}
              {result.totalChunks !== undefined ? <> · {result.totalChunks} {result.totalChunks === 1 ? "chunk" : "chunks"} of up to {result.chunkSize?.toLocaleString()} records</> : null}
              {result.mode ? <> · {result.mode === "strict" ? "All or nothing" : "Valid rows only"}</> : null}
            </p>
          ) : (
            <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
              <p>Detected {validation?.total.toLocaleString()} records · {validation?.valid.toLocaleString()} valid · {validation?.invalid.toLocaleString()} invalid · {validation?.alreadyExists.toLocaleString()} already registered</p>
              {validation?.duplicates ? <p>{validation.duplicates.toLocaleString()} of the invalid records are duplicates within the file.</p> : null}
              {strictBlocked ? <p>All-or-nothing mode requires every record to pass validation.</p> : null}
              {totalChunks !== null ? <p>{processingRows.toLocaleString()} records to process in {totalChunks} {totalChunks === 1 ? "chunk" : "chunks"} of up to {selectedChunkSize.toLocaleString()} records.</p> : null}
            </div>
          )}
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th className="p-2">Row</th>
                  {keys.map((key) => (
                    <th key={key} className="p-2 whitespace-nowrap">
                      {labels[key]}
                    </th>
                  ))}
                  <th className="p-2">Status</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.rowNumber} className="border-t">
                    <td className="p-2">{row.rowNumber}</td>
                    {keys.map((key) => (
                      <td key={key} className="max-w-48 break-words p-2">
                        {row.submitted[key]}
                      </td>
                    ))}
                    <td className="p-2">{row.status}</td>
                    <td className="min-w-40 p-2">
                      {row.message ||
                        (row.linksExistingStudent
                          ? "Will link the existing student; evaluations are preserved."
                          : "Ready to register")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > previewPageSize && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {previewPage * previewPageSize + 1}-{Math.min((previewPage + 1) * previewPageSize, result.rows.length)} of {result.rows.length}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={previewPage === 0} onClick={() => setPreviewPage((page) => page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={previewPage + 1 >= previewPageCount} onClick={() => setPreviewPage((page) => page + 1)}>Next</Button>
              </div>
            </div>
          )}
          {result.rows.some(
            (row) => !["Valid", "Imported"].includes(row.status),
          ) && (
            <div>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    result.errorReport,
                    "text/csv;charset=utf-8;",
                    `${kind}-import-errors.csv`,
                  )
                }
              >
                Download CSV Error Report
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Mobile numbers are redacted in reports because they are
                temporary login credentials.
              </p>
            </div>
          )}
          {!result.confirmed && (
            <div className="flex flex-wrap items-center gap-3">
              <Select
                disabled={busy}
                value={mode}
                onValueChange={(value) => setMode(value as typeof mode)}
              >
                <SelectTrigger
                  aria-label="Import confirmation mode"
                  className="w-full sm:w-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid-only">
                    Import valid rows only
                  </SelectItem>
                  <SelectItem value="strict">All or nothing</SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={
                  busy ||
                  !result.summary?.valid ||
                  !chunkSizeIsValid ||
                  strictBlocked
                }
                onClick={() =>
                  void run("confirm", async () => {
                    const confirmed = await api.confirmRegistrationImport(
                      kind,
                      result.importId,
                      mode,
                      selectedChunkSize,
                    );
                    setResult(confirmed);
                    setPreviewPage(0);
                    if (confirmed.confirmed) {
                      onRegistered?.("");
                      toast({
                        title: "Import completed",
                        description: `${confirmed.imported} accounts registered. ${confirmed.skipped} rows skipped or failed.`,
                      });
                      // Only registration-dependent collections need fresh data here.
                      // Avoid reloading dashboards, companies, skills and assessments.
                      try {
                        const [users, students, batches] = await Promise.all([api.users(), api.students(), api.batches()]);
                        useAppStore.setState({ users, students: students.items, batches });
                      } catch {
                        setError("Import completed. Reload the page to refresh the shared lists.");
                      }
                    } else
                      setError(
                        "Some records changed after preview. Review the validation results before confirming again.",
                      );
                  })
                }
              >
                Confirm Import
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
