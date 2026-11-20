"use client";
import { useEffect, useRef, useState } from "react";
import type { Skill } from "@/types";
import { api } from "@/lib/placepro/api";

export function useSubjectColumns() {
  const [subjects, setSubjects] = useState<Skill[]>([]);
  const [columns, setColumns] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const requests = generation;
    let live = true;
    const load = async () => {
      if (busy.current) return;
      const request = ++generation.current;
      setLoading(true);
      const [skills, preferences] = await Promise.allSettled([api.skills(), api.subjectColumns()]);
      if (!live || request !== generation.current) return;
      // A failed preferences request must not erase the subject catalog.
      if (skills.status === "fulfilled") setSubjects(skills.value.filter(s => s.active));
      if (preferences.status === "fulfilled") setColumns(preferences.value.columns);
      const success = skills.status === "fulfilled" && preferences.status === "fulfilled";
      setReady(success);
      setError(success ? null : skills.status === "rejected" ? "Subjects could not be loaded. Please retry." : "Saved column preferences could not be loaded. Please retry.");
      setLoading(false);
    };
    void load();
    window.addEventListener("focus", load);
    return () => { live = false; requests.current++; window.removeEventListener("focus", load); };
  }, [reload]);
  const selected = (s: Skill) => columns?.[s.id] ?? s.defaultVisible ?? false;
  const visible = subjects.filter(selected);
  async function save(patch: Record<string, boolean> | null) {
    if (busy.current || !ready || loading) return;
    busy.current = true; setSaving(true); setError(null);
    const request = ++generation.current;
    const previous = columns;
    const defaults = Object.fromEntries(subjects.map(s => [s.id, !!s.defaultVisible]));
    setColumns(patch === null ? null : { ...defaults, ...columns, ...patch });
    try {
      const result = await api.saveSubjectColumns(patch === null ? { reset: true } : { columns: patch });
      if (request === generation.current) setColumns(result.columns);
    } catch {
      if (request === generation.current) { setColumns(previous); setError("Column changes could not be saved. Your previous selection was restored."); }
    } finally { busy.current = false; if (request === generation.current) setSaving(false); }
  }
  return { subjects, visible, selected, save, loading, ready, saving, error, retry: () => setReload(n => n + 1) };
}
