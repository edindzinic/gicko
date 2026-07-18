"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfMonth } from "date-fns";
import { Apple, Download, Globe, LogOut, Palette, Trash2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { findNightWakeUpEndTimes, formatDuration, isNightTime, sessionDurationMinutes } from "@/lib/time";

function toInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [from, setFrom] = useState(toInputValue(startOfMonth(new Date())));
  const [to, setTo] = useState(toInputValue(new Date()));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solidFoods, setSolidFoods] = useState<Tables<"solid_foods">[]>([]);
  const [newFoodName, setNewFoodName] = useState("");
  const [addingFood, setAddingFood] = useState(false);
  const [foodError, setFoodError] = useState<string | null>(null);

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

  const loadSolidFoods = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("solid_foods")
      .select("*")
      .order("name", { ascending: true });
    setSolidFoods(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial profile + solid foods fetch on mount
    loadProfile();
    loadSolidFoods();
  }, [loadProfile, loadSolidFoods]);

  async function addSolidFood() {
    const name = newFoodName.trim();
    if (!name) return;

    setAddingFood(true);
    setFoodError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("solid_foods").insert({ name });
    setAddingFood(false);

    if (insertError) {
      setFoodError(
        insertError.code === "23505" ? t.settings.foodAlreadyExists : t.settings.foodAddError,
      );
      return;
    }
    setNewFoodName("");
    loadSolidFoods();
  }

  async function deleteSolidFood(id: string) {
    const supabase = createClient();
    await supabase.from("solid_foods").delete().eq("id", id);
    loadSolidFoods();
  }

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
        setError(t.settings.exportError);
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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">{t.settings.title}</h1>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <User className="h-4 w-4" strokeWidth={2} /> {t.settings.account}
        </h2>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
          {t.settings.signedInAs(displayName ?? "…")}
        </p>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          {t.settings.signOut}
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Palette className="h-4 w-4" strokeWidth={2} /> {t.settings.appearance}
        </h2>
        <ThemeToggle />
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Globe className="h-4 w-4" strokeWidth={2} /> {t.settings.language}
        </h2>
        <LanguageToggle />
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Apple className="h-4 w-4" strokeWidth={2} /> {t.settings.solidFoods}
        </h2>

        {solidFoods.length > 0 && (
          <ul className="mb-4 space-y-2">
            {solidFoods.map((food) => (
              <li
                key={food.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span className="text-neutral-700 dark:text-neutral-300">{food.name}</span>
                <button
                  onClick={() => deleteSolidFood(food.id)}
                  aria-label={t.settings.removeFoodAria(food.name)}
                  className="text-neutral-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newFoodName}
            onChange={(e) => setNewFoodName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addSolidFood();
            }}
            placeholder={t.settings.foodPlaceholder}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
          <button
            onClick={addSolidFood}
            disabled={addingFood || !newFoodName.trim()}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {t.settings.add}
          </button>
        </div>
        {foodError && <p className="mt-2 text-sm text-red-600">{foodError}</p>}

        <p className="mt-4 text-xs text-neutral-400">{t.settings.solidFoodsHint}</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Download className="h-4 w-4" strokeWidth={2} /> {t.settings.exportData}
        </h2>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.settings.from}
        </label>
        <div className="mb-4 w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full min-w-0 px-3 py-2.5 text-base dark:bg-neutral-900"
          />
        </div>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.settings.to}
        </label>
        <div className="mb-6 w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full min-w-0 px-3 py-2.5 text-base dark:bg-neutral-900"
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-base font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          <Download className="h-4 w-4" strokeWidth={2} />
          {exporting ? t.settings.preparing : t.settings.exportToExcel}
        </button>

        <p className="mt-4 text-center text-xs text-neutral-400">{t.settings.exportHint}</p>
      </div>
    </div>
  );
}
