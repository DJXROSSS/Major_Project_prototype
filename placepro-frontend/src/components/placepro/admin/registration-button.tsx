"use client";
import { useEffect, useState } from "react";
import RegistrationImport from "./registration-import";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserPlus } from "lucide-react";
import type { Batch } from "@/types";
import { api } from "@/lib/placepro/api";
import { useAppStore } from "@/lib/placepro/store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RegistrationButton({
  role,
  onRegistered,
  allowImport = true,
}: {
  role: "student" | "trainer";
  onRegistered?: (email: string) => void;
  allowImport?: boolean;
}) {
  const [tab, setTab] = useState("manual");
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [search, setSearch] = useState("");
  const empty = {
    name: "",
    email: "",
    mobileNumber: "",
    rollNumber: "",
    academicBatchId: "",
    section: "",
    cgpa: "",
    assignedBatchIds: [] as string[],
  };
  const [form, setForm] = useState(empty);
  const { toast } = useToast();
  const selectedBatch = batches.find((b) => b.id === form.academicBatchId);
  const title = role === "student" ? "Add Student" : "Add Trainer";
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setBatchError("");
    api
      .batches()
      .then((items) => {
        if (active) setBatches(items.filter((b) => b.status === "active"));
      })
      .catch((err) => {
        if (active)
          setBatchError(
            err instanceof Error ? err.message : "Unable to load batches",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setTab("manual");
          setForm(empty);
          setError("");
          setSearch("");
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" /> {title}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${tab === "import" ? "sm:max-w-5xl" : "sm:max-w-lg"}`}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              The initial password is this user&apos;s registered 10-digit
              mobile number. They must change it on first login.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="manual" disabled={busy}>
                Add Manually
              </TabsTrigger>
              {allowImport ? <TabsTrigger value="import" disabled={busy}>
                Import Excel
              </TabsTrigger> : null}
            </TabsList>
            <TabsContent value="manual">
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError("");
                  if (!form.name.trim()) {
                    setError("Full name is required.");
                    return;
                  }
                  if (
                    role === "student"
                      ? !form.academicBatchId
                      : !form.assignedBatchIds.length
                  ) {
                    setError("Select at least one academic batch.");
                    return;
                  }
                  if (
                    selectedBatch?.sections.length &&
                    !selectedBatch.sections.includes(form.section)
                  ) {
                    setError("Select a section.");
                    return;
                  }
                  setBusy(true);
                  try {
                    if (role === "student")
                      await api.registerStudent({
                        ...form,
                        ...(form.cgpa === ""
                          ? { cgpa: undefined }
                          : { cgpa: Number(form.cgpa) }),
                      });
                    else await api.registerTrainer(form);
                    setOpen(false);
                    await useAppStore.getState().refreshData();
                    onRegistered?.(form.email.trim());
                    toast({
                      title:
                        role === "student"
                          ? "Student registered"
                          : "Trainer registered",
                      description:
                        "The account is ready. First login requires a password change.",
                    });
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Unable to register account.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  {(
                    [
                      ["name", "Full name", "text"],
                      ["email", "Email address", "email"],
                      ["mobileNumber", "Mobile number", "tel"],
                    ] as const
                  ).map(([key, label, type]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`registration-${role}-${key}`}>
                        {label} *
                      </Label>
                      <Input
                        id={`registration-${role}-${key}`}
                        type={type}
                        required
                        maxLength={
                          key === "name" ? 100 : key === "email" ? 120 : 20
                        }
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                  {role === "student" && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="registration-roll">Roll number *</Label>
                        <Input
                          id="registration-roll"
                          required
                          maxLength={50}
                          value={form.rollNumber}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              rollNumber: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="registration-batch">
                          Academic batch *
                        </Label>
                        <Select
                          disabled={loading}
                          value={form.academicBatchId}
                          onValueChange={(value) =>
                            setForm((f) => ({
                              ...f,
                              academicBatchId: value,
                              section: "",
                            }))
                          }
                        >
                          <SelectTrigger id="registration-batch">
                            <SelectValue placeholder="Select batch" />
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
                      <div className="space-y-1">
                        <Label htmlFor="registration-section">
                          Section {selectedBatch?.sections.length ? "*" : ""}
                        </Label>
                        {selectedBatch?.sections.length ? (
                          <Select
                            value={form.section}
                            onValueChange={(section) =>
                              setForm((f) => ({ ...f, section }))
                            }
                          >
                            <SelectTrigger id="registration-section">
                              <SelectValue placeholder="Select section" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...new Set(selectedBatch.sections)].map((section) => (
                                <SelectItem key={section} value={section}>
                                  {section}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id="registration-section"
                            maxLength={10}
                            value={form.section}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                section: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="registration-cgpa">
                          CGPA (optional)
                        </Label>
                        <Input
                          id="registration-cgpa"
                          type="number"
                          min={0}
                          max={10}
                          step={0.01}
                          value={form.cgpa}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, cgpa: e.target.value }))
                          }
                        />
                      </div>
                    </>
                  )}
                  {role === "trainer" && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        Assigned academic batches *
                      </legend>
                      <Input
                        aria-label="Search batches"
                        placeholder="Search batches"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                        {batches
                          .filter((b) =>
                            b.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((b) => (
                            <label
                              key={b.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={form.assignedBatchIds.includes(b.id)}
                                onCheckedChange={(checked) =>
                                  setForm((f) => ({
                                    ...f,
                                    assignedBatchIds:
                                      checked === true
                                        ? [
                                            ...new Set([
                                              ...f.assignedBatchIds,
                                              b.id,
                                            ]),
                                          ]
                                        : f.assignedBatchIds.filter(
                                            (id) => id !== b.id,
                                          ),
                                  }))
                                }
                              />
                              {b.name}
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Department:{" "}
                    {role === "student"
                      ? selectedBatch?.department || "Select a batch"
                      : [
                          ...new Set(
                            batches
                              .filter((b) =>
                                form.assignedBatchIds.includes(b.id),
                              )
                              .map((b) => b.department),
                          ),
                        ].join(", ") || "Select batches"}
                  </p>
                  {loading && <p className="text-sm">Loading batches...</p>}
                  {!loading && !batchError && !batches.length && (
                    <p className="text-sm">
                      Create an active academic batch in Batch Management first.
                    </p>
                  )}
                  {(error || batchError) && (
                    <p role="alert" className="text-sm text-destructive">
                      {error || batchError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading || !!batchError || !batches.length}
                    >
                      {busy ? "Registering..." : title}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </TabsContent>
            {allowImport ? <TabsContent value="import">
              <RegistrationImport
                role={role}
                batches={batches}
                batchesLoading={loading}
                batchError={batchError}
                onBusy={setBusy}
                onRegistered={onRegistered}
              />
            </TabsContent> : null}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
