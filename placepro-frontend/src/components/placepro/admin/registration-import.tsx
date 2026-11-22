"use client";
import { useId, useState } from "react";
import type { Batch } from "@/types";
import { api } from "@/lib/placepro/api";
import { useRegistrationImports, type RegistrationReview } from "@/lib/placepro/registration-imports";
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

const PRESET_CHUNK_SIZES = [100, 250, 500, 1000];

function ChunkSize({ initialSize, onChange }: {
  initialSize: number;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState(PRESET_CHUNK_SIZES.includes(initialSize) ? String(initialSize) : "custom");
  const [custom, setCustom] = useState(choice === "custom" ? String(initialSize) : "");
  const validCustom = /^\d+$/.test(custom) && Number(custom) >= 50 && Number(custom) <= 1000;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Chunk size</Label>
      <div className="flex flex-wrap gap-2">
        <Select value={choice} onValueChange={(value) => {
          setChoice(value);
          onChange(value === "custom" ? (validCustom ? Number(custom) : null) : Number(value));
        }}>
          <SelectTrigger id={id} className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESET_CHUNK_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size.toLocaleString()} records</SelectItem>)}
            <SelectItem value="custom">Custom size</SelectItem>
          </SelectContent>
        </Select>
        {choice === "custom" && <Input aria-label="Custom chunk size" aria-invalid={!validCustom} type="number" min={50} max={1000} step={1} value={custom} onChange={(event) => {
          const value = event.target.value;
          setCustom(value);
          const size = Number(value);
          onChange(/^\d+$/.test(value) && size >= 50 && size <= 1000 ? size : null);
        }} placeholder="50–1,000" className="w-36" />}
      </div>
      {choice === "custom" && !validCustom && <p className="text-xs text-destructive">Choose a whole number from 50 to 1,000.</p>}
    </div>
  );
}

export default function RegistrationImport({
  role,
  batches,
  batchesLoading,
  batchError,
  onUploadStarted,
}: {
  role: "student" | "trainer";
  batches: Batch[];
  batchesLoading: boolean;
  batchError: string;
  onUploadStarted: () => void;
}) {
  const kind = role === "student" ? "students" : "trainers";
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [chunkSize, setChunkSize] = useState<number | null>(500);
  const start = useRegistrationImports((state) => state.start);
  const downloadTemplate = async () => {
    setDownloading(true);
    setError("");
    try {
      const template = await api.registrationTemplate(kind);
      const bytes = Uint8Array.from(atob(template.contentBase64), (c) => c.charCodeAt(0));
      download(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", template.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download the template.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload .xlsx, .xls or .csv. Maximum 5 MB and 5,000 records. Preview
        validates records without creating accounts.
      </p>
      <Button
        variant="outline"
        disabled={downloading}
        onClick={() => void downloadTemplate()}
      >
        {downloading ? "Downloading template…" : "Download Excel Template"}
      </Button>
      {role === "student" && (
        <div className="space-y-1">
          <Label htmlFor="import-registration-batch">Academic batch *</Label>
          <Select
            disabled={batchesLoading}
            value={batchId}
            onValueChange={setBatchId}
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
      <ChunkSize initialSize={500} onChange={setChunkSize} />
      <div className="space-y-1">
        <Label htmlFor="registration-file">Excel/CSV file</Label>
        <Input
          id="registration-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={role === "student" && !batchId}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
          }}
        />
      </div>
      <Button
        disabled={
          started ||
          !file ||
          !!batchError ||
          batchesLoading ||
          !batches.length ||
          chunkSize === null ||
          (role === "student" && !batchId)
        }
        onClick={() => {
          if (started || !file || chunkSize === null) return;
          if (file.size > 5 * 1024 * 1024) {
            setError("File exceeds 5 MB.");
            return;
          }
          setStarted(true);
          start({ kind, file, batchId, chunkSize });
          onUploadStarted();
        }}
      >
        Preview and Validate
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RegistrationImportReview({ task, onConfirm }: { task: RegistrationReview; onConfirm: () => void }) {
  const { kind, result } = task;
  const [mode, setMode] = useState(task.mode);
  const [chunkSize, setChunkSize] = useState<number | null>(task.chunkSize);
  const [previewPage, setPreviewPage] = useState(0);
  const confirm = useRegistrationImports((state) => state.confirm);
  const validation = result.summary;
  const strictBlocked = mode === "strict" && validation?.valid !== validation?.total;
  const processingRows = strictBlocked ? 0 : validation?.valid ?? 0;
  const totalChunks = chunkSize === null ? null : Math.ceil(processingRows / chunkSize);
  const previewPageSize = 100;
  const previewRows = result.rows.slice(previewPage * previewPageSize, (previewPage + 1) * previewPageSize);
  const previewPageCount = Math.ceil(result.rows.length / previewPageSize);
  const keys = kind === "students"
    ? ["rollNumber", "name", "email", "mobileNumber", "section", "cgpa"]
    : ["name", "email", "mobileNumber", "assignedBatches"];
  const labels: Record<string, string> = {
    rollNumber: "Roll number", name: "Full name", email: "Email", mobileNumber: "Mobile number",
    section: "Section", cgpa: "CGPA", assignedBatches: "Assigned batches",
  };
  return (
    <div className="min-w-0 space-y-4">
      {task.error && <p role="alert" className="text-sm text-destructive">{task.error}</p>}
      {!result.confirmed && <ChunkSize initialSize={task.chunkSize} onChange={setChunkSize} />}
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
          {totalChunks !== null ? <p>{processingRows.toLocaleString()} records to process in {totalChunks} {totalChunks === 1 ? "chunk" : "chunks"} of up to {chunkSize?.toLocaleString()} records.</p> : null}
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
              !result.summary?.valid ||
              chunkSize === null ||
              strictBlocked
            }
            onClick={() => {
              if (chunkSize === null) return;
              confirm(task.id, mode, chunkSize);
              onConfirm();
            }}
          >
            Confirm Import
          </Button>
        </div>
      )}
    </div>
  );
}
