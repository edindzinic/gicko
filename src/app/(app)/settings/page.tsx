"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfMonth } from "date-fns";
import { Download, LogOut, Palette, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { findNightWakeUpEndTimes, formatDuration, isNightTime, sessionDurationMinutes } from "@/lib/time";

function toInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function SettingsPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [from, setFrom] = useState(toInputValue(startOfMonth(new Date())));
  const [to, setTo] = useState(toInputValue(new Date()));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    setDisplayName(profile?.display_name ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial profile fetch on mount
    loadProfile();
  }, [loadProfile]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      const supabase = createClient();
      const rangeStart = `${from}T00:00:00`;
      const rangeEnd = `${to}T23:59:59.999`;

      const [{ data: sessions, error: sErr }, { data: feedings, error: fErr }, { data: nights }] =
        await Promise.all([
          supabase
            .from("sleep_sessions")
            .select("*")
            .gte("started_at", rangeStart)
            .lte("started_at", rangeEnd)
            .order("started_at", { ascending: true }),
          supabase
            .from("feedings")
            .select("*")
            .gte("occurred_at", rangeStart)
            .lte("occurred_at", rangeEnd)
            .order("occurred_at", { ascending: true }),
          // Fetched unscoped by range so wake-up chains aren't cut off at the edges.
          supabase.from("sleep_sessions").select("*").eq("is_night_sleep", true),
        ]);

      if (sErr || fErr) {
        setError("Couldn't fetch data for export.");
        setExporting(false);
        return;
      }

      const XLSX = await import("xlsx");

      const wakeUpEndTimes = new Set(findNightWakeUpEndTimes(nights ?? []));

      const sleepRows = (sessions ?? []).map((s) => ({
        Date: format(new Date(s.started_at), "yyyy-MM-dd"),
        "Started at": format(new Date(s.started_at), "HH:mm"),
        "Ended at": s.ended_at ? format(new Date(s.ended_at), "HH:mm") : "still asleep",
        Duration: formatDuration(sessionDurationMinutes(s.started_at, s.ended_at)),
        "Night wake-up": s.ended_at && wakeUpEndTimes.has(s.ended_at) ? "Yes" : "No",
        Notes: s.notes ?? "",
      }));

      const feedingRows = (feedings ?? []).map((f) => ({
        Date: format(new Date(f.occurred_at), "yyyy-MM-dd"),
        Time: format(new Date(f.occurred_at), "HH:mm"),
        Type: f.feed_type,
        Amount: f.amount ?? "",
        Unit: f.unit ?? "",
        Night: isNightTime(f.occurred_at) ? "Yes" : "No",
        Notes: f.notes ?? "",
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(sleepRows),
        "Sleep",
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(feedingRows),
        "Feedings",
      );

      XLSX.writeFile(workbook, `gicko-${from}-to-${to}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-stone-800 dark:text-stone-100">Settings</h1>

      <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm dark:bg-stone-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-500">
          <User className="h-4 w-4" strokeWidth={2} /> Account
        </h2>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
          Signed in as <span className="font-medium">{displayName ?? "…"}</span>
        </p>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 py-3 text-base font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Sign out
        </button>
      </div>

      <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm dark:bg-stone-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-500">
          <Palette className="h-4 w-4" strokeWidth={2} /> Appearance
        </h2>
        <ThemeToggle />
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-stone-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-500">
          <Download className="h-4 w-4" strokeWidth={2} /> Export data
        </h2>

        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
          From
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mb-4 w-full rounded-2xl border border-stone-200 px-3 py-2.5 text-base dark:border-stone-700 dark:bg-stone-800"
        />

        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
          To
        </label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mb-6 w-full rounded-2xl border border-stone-200 px-3 py-2.5 text-base dark:border-stone-700 dark:bg-stone-800"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 py-3 text-base font-medium text-white hover:bg-violet-600 disabled:opacity-50"
        >
          <Download className="h-4 w-4" strokeWidth={2} />
          {exporting ? "Preparing…" : "Export to Excel"}
        </button>

        <p className="mt-4 text-center text-xs text-stone-400">
          Downloads an .xlsx with separate Sleep and Feedings sheets for the selected range.
        </p>
      </div>
    </div>
  );
}
