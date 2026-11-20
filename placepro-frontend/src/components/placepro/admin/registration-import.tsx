"use client";
import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"valid-only" | "strict">("valid-only");
  const { toast } = useToast();
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to process import.",
      );
    } finally {
      setBusy(false);
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
        Upload .xlsx, .xls or .csv. Maximum 5 MB and 200 records. Preview
        validates records without creating accounts.
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void run(async () => {
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
        <Label htmlFor="registration-file">Excel/CSV file</Label>
        <Input
          id="registration-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={busy || (role === "student" && !batchId)}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
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
          (role === "student" && !batchId)
        }
        onClick={() =>
          void run(async () => {
            if (!file) return;
            if (file.size > 5 * 1024 * 1024)
              throw new Error("File exceeds 5 MB.");
            const form = new FormData();
            form.append("file", file);
            if (role === "student") form.append("academicBatchId", batchId);
            setResult(await api.previewRegistrationImport(kind, form));
          })
        }
      >
        {busy ? "Processing..." : "Preview and Validate"}
      </Button>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Processing records. Password hashing may take a few minutes for larger
          imports. Keep this dialog open.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.confirmed ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              Imported: {result.imported} · Skipped or failed: {result.skipped}
            </p>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm">
              Total: {result.summary?.total} · Valid: {result.summary?.valid} ·
              Invalid: {result.summary?.invalid} · Already exists:{" "}
              {result.summary?.alreadyExists}
            </p>
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
                {result.rows.map((row) => (
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
                  (mode === "strict" &&
                    result.summary.valid !== result.summary.total)
                }
                onClick={() =>
                  void run(async () => {
                    const confirmed = await api.confirmRegistrationImport(
                      kind,
                      result.importId,
                      mode,
                    );
                    setResult(confirmed);
                    if (confirmed.confirmed) {
                      await useAppStore.getState().refreshData();
                      onRegistered?.("");
                      toast({
                        title: "Import completed",
                        description: `${confirmed.imported} accounts registered. ${confirmed.skipped} rows skipped or failed.`,
                      });
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
