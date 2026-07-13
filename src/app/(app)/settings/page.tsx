"use client";

import { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDuration, isNightTime, sessionDurationMinutes } from "@/lib/time";

function toInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function SettingsPage() {
  const [from, setFrom] = useState(toInputValue(startOfMonth(new Date())));
  const [to, setTo] = useState(toInputValue(new Date()));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      const supabase = createClient();
      const rangeStart = `${from}T00:00:00`;
      const rangeEnd = `${to}T23:59:59.999`;

      const [{ data: sessions, error: sErr }, { data: feedings, error: fErr }] =
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
        ]);

      if (sErr || fErr) {
        setError("Couldn't fetch data for export.");
        setExporting(false);
        return;
      }

      const XLSX = await import("xlsx");

      const sleepRows = (sessions ?? []).map((s) => ({
        Date: format(new Date(s.started_at), "yyyy-MM-dd"),
        "Started at": format(new Date(s.started_at), "h:mm a"),
        "Ended at": s.ended_at ? format(new Date(s.ended_at), "h:mm a") : "still asleep",
        Duration: formatDuration(sessionDurationMinutes(s.started_at, s.ended_at)),
        "Night wake-up": s.ended_at && isNightTime(s.ended_at) ? "Yes" : "No",
        Notes: s.notes ?? "",
      }));

      const feedingRows = (feedings ?? []).map((f) => ({
        Date: format(new Date(f.occurred_at), "yyyy-MM-dd"),
        Time: format(new Date(f.occurred_at), "h:mm a"),
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
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Appearance</h2>
        <ThemeToggle />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Export data</h2>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          From
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          To
        </label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full rounded-lg bg-indigo-600 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "📤 Export to Excel"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Downloads an .xlsx with separate Sleep and Feedings sheets for the selected range.
        </p>
      </div>
    </div>
  );
}
