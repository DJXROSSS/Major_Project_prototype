"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { api, type StudentVerificationRequest } from "@/lib/placepro/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function StudentVerificationRequests() {
  const { toast } = useToast();
  const [items, setItems] = useState<StudentVerificationRequest[]>([]);
  const [selected, setSelected] = useState<StudentVerificationRequest | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setItems(await api.studentVerificationRequests()); } catch (error) { toast({ title: "Could not load verification requests", description: error instanceof Error ? error.message : "Try refreshing.", variant: "destructive" }); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const pending = items.filter((item) => item.status === "PENDING");

  async function approve() {
    if (!selected || !name.trim() || !email.trim()) return;
    setSaving(true);
    try { await api.approveStudentVerification(selected.id, { name: name.trim(), email: email.trim() }); setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); toast({ title: "Student approved", description: "The student and their retained import data were processed." }); } catch (error) { toast({ title: "Approval failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } finally { setSaving(false); }
  }
  async function reject(item: StudentVerificationRequest) {
    const reason = window.prompt(`Reject ${item.rollNumber}? Enter a reason.`); if (reason === null) return;
    try { await api.rejectStudentVerification(item.id, reason || "Rejected by administrator"); setItems((current) => current.filter((entry) => entry.id !== item.id)); toast({ title: "Request rejected" }); } catch (error) { toast({ title: "Rejection failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
  }

  if (loading || pending.length === 0) return null;
  return <Card className="border-warning/40 bg-warning-soft/30 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-base font-semibold"><ClipboardCheck className="size-4" /> Student verification requests</h2><p className="mt-1 text-sm text-muted-foreground">{pending.length} unmatched import record{pending.length === 1 ? "" : "s"} need your decision.</p></div><Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button></div><div className="mt-4 divide-y rounded-md border bg-background">{pending.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{item.rollNumber} <span className="font-normal text-muted-foreground">· {item.batchName}</span></p><p className="text-xs text-muted-foreground">{item.fileName} · {item.assessmentName} · row {item.rowNumber}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setSelected(item)}><Check className="size-4" /> Review & approve</Button><Button size="sm" variant="outline" onClick={() => void reject(item)}><X className="size-4" /> Reject</Button></div></div>)}</div><Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Verify {selected?.rollNumber}</DialogTitle><DialogDescription>Create the student or link them to their preserved import data.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label htmlFor="verification-name">Full name</Label><Input id="verification-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div><Label htmlFor="verification-email">Email</Label><Input id="verification-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><Button className="w-full" disabled={saving || !name.trim() || !email.trim()} onClick={() => void approve()}>{saving ? "Saving…" : "Approve and process data"}</Button></div></DialogContent></Dialog></Card>;
}
