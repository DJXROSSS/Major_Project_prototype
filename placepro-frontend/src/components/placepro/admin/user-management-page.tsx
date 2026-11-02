"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, UserPlus, Users } from "lucide-react";
import { useAppStore } from "@/lib/placepro/store";
import type { AppUser, Role } from "@/types";
import { PageHeader } from "@/components/placepro/shared/page-header";
import { SearchInput, FilterSelect } from "@/components/placepro/shared/controls";
import { StatusBadge } from "@/components/placepro/shared/badges";
import { EmptyState, TableSkeleton } from "@/components/placepro/shared/states";
import { TablePagination, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/* User Management                                                     */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  trainer: "Technical Trainer",
  student: "Student",
};

const ROLE_TONE: Record<Role, "info" | "success" | "neutral"> = {
  admin: "info",
  trainer: "success",
  student: "neutral",
};

interface UserForm {
  name: string;
  email: string;
  role: Role;
  batch: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: UserForm = { name: "", email: "", role: "student", batch: "", status: "active" };

function formatLastActive(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, ${d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function UserManagementPage() {
  const users = useAppStore((s) => s.users);
  const batches = useAppStore((s) => s.batches);
  const addUser = useAppStore((s) => s.addUser);
  const updateUser = useAppStore((s) => s.updateUser);
  const { toast } = useToast();

  /* filters */
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  /* dialogs */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [confirmTarget, setConfirmTarget] = useState<AppUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilters = search !== "" || roleFilter !== "all" || statusFilter !== "all";

  /* ----------------------------- dialog logic ----------------------------- */

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(u: AppUser) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      batch: u.batch ?? "",
      status: u.status,
    });
    setErrors({});
    setDialogOpen(true);
  }

  function saveUser() {
    const next: { name?: string; email?: string } = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.email.trim()) next.email = "Email is required.";
    else if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email address.";
    else if (!editing && users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase()))
      next.email = "This email is already registered.";
    if (next.name || next.email) {
      setErrors(next);
      return;
    }
    if (editing) {
      updateUser(editing.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        batch: form.role === "student" && form.batch ? form.batch : undefined,
      });
      toast({ title: "User updated", description: `${form.name.trim()}'s account was saved successfully.` });
    } else {
      addUser({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        lastActive: new Date().toISOString(),
        batch: form.role === "student" && form.batch ? form.batch : undefined,
      });
      toast({ title: "User created", description: `${form.name.trim()} was added as ${ROLE_LABEL[form.role]}.` });
    }
    setDialogOpen(false);
  }

  function toggleStatus() {
    if (!confirmTarget) return;
    const next = confirmTarget.status === "active" ? "inactive" : "active";
    updateUser(confirmTarget.id, { status: next });
    toast({
      title: next === "active" ? "User activated" : "User deactivated",
      description: `${confirmTarget.name} is now ${next}.`,
    });
    setConfirmTarget(null);
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle="Create and manage administrator, trainer and student accounts."
        actions={
          <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={openAdd}>
            <UserPlus className="size-4" /> Add user
          </Button>
        }
      />

      {/* filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email…"
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <FilterSelect
            value={roleFilter}
            onChange={setRoleFilter}
            ariaLabel="Filter by role"
            options={[
              { label: "Administrator", value: "admin" },
              { label: "Technical Trainer", value: "trainer" },
              { label: "Student", value: "student" },
            ]}
            className="w-full sm:w-44"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            options={[
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            className="w-full sm:w-32"
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2.5 text-[13px] text-muted-foreground"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          ) : null}
        </div>
      </div>

      {/* table */}
      <Card className="gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : paged.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            description={hasFilters ? "No accounts match the current filters. Try adjusting your search." : "Create your first user account to get started."}
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[13px]"
                  onClick={() => {
                    setSearch("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  <RotateCcw className="size-3.5" /> Reset filters
                </Button>
              ) : (
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={openAdd}>
                  <UserPlus className="size-3.5" /> Add user
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-2 font-medium">User</th>
                    <th className="px-2 py-2.5 font-medium">Role</th>
                    <th className="px-2 py-2.5 font-medium">Batch</th>
                    <th className="px-2 py-2.5 font-medium">Status</th>
                    <th className="px-2 py-2.5 font-medium">Last active</th>
                    <th className="py-2.5 pl-2 pr-5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60">
                      <td className="py-3 pl-5 pr-2">
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={u.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{u.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</StatusBadge>
                      </td>
                      <td className="px-2 py-3 text-[13px] text-muted-foreground">{u.role === "student" ? u.batch ?? "—" : "—"}</td>
                      <td className="px-2 py-3">
                        <StatusBadge tone={u.status === "active" ? "success" : "danger"}>
                          {u.status === "active" ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="tabular px-2 py-3 text-[13px] text-muted-foreground">{formatLastActive(u.lastActive)}</td>
                      <td className="py-3 pl-2 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] text-primary" onClick={() => openEdit(u)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[13px] text-muted-foreground hover:text-foreground"
                            onClick={() => setConfirmTarget(u)}
                          >
                            {u.status === "active" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={safePage} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* add / edit user dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the account details and save your changes." : "Create a new account and assign its role."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="user-name">Name</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kavya Iyer"
              />
              {errors.name ? <p className="text-xs text-danger">{errors.name}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@campus.edu"
              />
              {errors.email ? <p className="text-xs text-danger">{errors.email}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="trainer">Technical Trainer</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.role === "student" ? (
                <div className="grid gap-1.5">
                  <Label>Batch</Label>
                  <Select value={form.batch || "none"} onValueChange={(v) => setForm((f) => ({ ...f, batch: v === "none" ? "" : v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.name}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="user-status" className="text-[13px]">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive accounts cannot sign in.</p>
              </div>
              <Switch
                id="user-status"
                checked={form.status === "active"}
                onCheckedChange={(c) => setForm((f) => ({ ...f, status: c ? "active" : "inactive" }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-9 bg-primary hover:bg-primary-hover" onClick={saveUser}>
              {editing ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* activate / deactivate confirm */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.status === "active" ? "Deactivate this user?" : "Activate this user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.status === "active"
                ? `${confirmTarget?.name} will no longer be able to sign in. Historical records are preserved.`
                : `${confirmTarget?.name} will regain access to the platform.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary-hover"
              onClick={toggleStatus}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
