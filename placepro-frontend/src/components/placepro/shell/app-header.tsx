"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  LogOut,
  Menu,
  Search,
  UserRound,
} from "lucide-react";
import { useAppStore, routeLabels } from "@/lib/placepro/store";
import { ROLE_NAV } from "@/lib/placepro/nav";
import { Breadcrumbs } from "@/components/placepro/shared/page-header";
import { Kbd, UserAvatar } from "@/components/placepro/shared/misc";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* AppHeader — aligned with content, never overlaps the sidebar        */
/* ------------------------------------------------------------------ */

export function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const user = useAppStore((s) => s.user);
  const route = useAppStore((s) => s.route);
  const logout = useAppStore((s) => s.logout);
  const navigate = useAppStore((s) => s.navigate);
  const openDialog = useAppStore((s) => s.openDialog);

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!user) return null;
  const crumbs = routeLabels(route, user.role);

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-muted-foreground md:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>

        <Breadcrumbs items={crumbs} />

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:text-foreground sm:flex"
          >
            <Search className="size-3.5" />
            <span>Search</span>
            <Kbd>⌘K</Kbd>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground sm:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="size-4" />
          </Button>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pp-focus ml-0.5 rounded-full" aria-label="Account menu">
                <UserAvatar name={user.name} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-1 inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                  {user.title}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user.role === "student" ? (
                <DropdownMenuItem onClick={() => navigate("my-profile")} className="text-[13px]">
                  <UserRound className="size-4" /> My profile
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => openDialog("help")} className="text-[13px]">
                <CircleHelp className="size-4" /> Help &amp; support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-[13px] text-danger focus:text-danger">
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationBell() {
  const [read, setRead] = useState(false);
  const unread = 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 text-muted-foreground" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-danger ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setRead(true)}
          >
            Mark all as read
          </button>
        </div>
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Notifications are not available yet.</p>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Global search — role aware                                          */
/* ------------------------------------------------------------------ */

function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const users = useAppStore((s) => s.users);
  const students = useAppStore((s) => s.students);

  const navItems = useMemo(() => (user ? ROLE_NAV[user.role] : []), [user]);
  if (!user) return null;

  const isTrainer = user.role === "trainer";
  const isAdmin = user.role === "admin";
  const searchPool = isTrainer ? students : isAdmin ? users : [];

  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={isTrainer ? "Search students by name, roll number, or batch…" : isAdmin ? "Search users or jump to a page…" : "Jump to a page…"}
      />
      <CommandList className="pp-scrollbar">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem key={item.page} onSelect={() => run(() => navigate(item.page))} className="text-[13px]">
              <item.icon className="size-4" />
              {item.label}
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground/50" />
            </CommandItem>
          ))}
        </CommandGroup>

        {isTrainer ? (
          <CommandGroup heading="Students">
            {students.slice(0, 50).map((s) => (
              <CommandItem
                key={s.id}
                value={`${s.name} ${s.rollNumber} ${s.batch}`}
                onSelect={() => run(() => navigate("student-profile", { studentId: s.id }))}
                className="text-[13px]"
              >
                <UserAvatar name={s.name} size="sm" />
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="ml-1 text-xs text-muted-foreground">{s.rollNumber}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{s.batch}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {isAdmin ? (
          <CommandGroup heading="Users">
            {searchPool.map((u) => (
              <CommandItem key={u.id} value={`${u.name} ${u.email} ${u.role}`} onSelect={() => run(() => navigate("users"))} className="text-[13px]">
                <UserAvatar name={u.name} size="sm" />
                <span>{u.name}</span>
                <span className="ml-1 text-xs capitalize text-muted-foreground">{u.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
