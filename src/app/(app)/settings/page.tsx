"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfMonth } from "date-fns";
import { Apple, Download, Globe, Hourglass, LogOut, Milk, Palette, Timer, Trash2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationSettings } from "@/components/NotificationSettings";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  collectNightWakeUps,
  formatDuration,
  isNightTime,
  sessionDurationMinutes,
  sleepMinutesExcludingWakings,
} from "@/lib/time";

function toInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState<string | null>(null);
  // Admins set how the day is meant to go; everyone else can read it but not change it.
  // The database enforces the same split, so hiding these controls is a courtesy, not the
  // boundary itself.
  const [isAdmin, setIsAdmin] = useState(false);
  const [from, setFrom] = useState(toInputValue(startOfMonth(new Date())));
  const [to, setTo] = useState(toInputValue(new Date()));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solidFoods, setSolidFoods] = useState<Tables<"solid_foods">[]>([]);
  const [newFoodName, setNewFoodName] = useState("");
  const [addingFood, setAddingFood] = useState(false);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [wakeWindows, setWakeWindows] = useState<Tables<"wake_windows">[]>([]);
  const [newWakeWindowHours, setNewWakeWindowHours] = useState("");
  const [addingWakeWindow, setAddingWakeWindow] = useState(false);
  const [napDurations, setNapDurations] = useState<Tables<"nap_durations">[]>([]);
  const [newNapDurationHours, setNewNapDurationHours] = useState("");
  const [addingNapDuration, setAddingNapDuration] = useState(false);
  const [feedingIntervalHours, setFeedingIntervalHours] = useState("");
  const [savingFeedingInterval, setSavingFeedingInterval] = useState(false);
  const [feedingIntervalSaved, setFeedingIntervalSaved] = useState(false);

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, is_admin")
      .eq("id", user.id)
      .single();
    setDisplayName(profile?.display_name ?? null);
    setIsAdmin(profile?.is_admin ?? false);
  }, []);

  const loadSolidFoods = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("solid_foods")
      .select("*")
      .order("name", { ascending: true });
    setSolidFoods(data ?? []);
  }, []);

  const loadWakeWindows = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("wake_windows")
      .select("*")
      .order("position", { ascending: true });
    setWakeWindows(data ?? []);
  }, []);

  const loadNapDurations = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("nap_durations")
      .select("*")
      .order("position", { ascending: true });
    setNapDurations(data ?? []);
  }, []);

  const loadFeedingInterval = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("feeding_settings").select("interval_hours").maybeSingle();
    setFeedingIntervalHours(data ? String(data.interval_hours) : "");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial profile + solid foods + sleep settings fetch on mount
    loadProfile();
    loadSolidFoods();
    loadWakeWindows();
    loadNapDurations();
    loadFeedingInterval();
  }, [loadProfile, loadSolidFoods, loadWakeWindows, loadNapDurations, loadFeedingInterval]);

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

  async function addWakeWindow() {
    const hours = Number(newWakeWindowHours.replace(",", "."));
    if (!hours || hours <= 0) return;

    setAddingWakeWindow(true);
    const supabase = createClient();
    const nextPosition =
      wakeWindows.length > 0 ? Math.max(...wakeWindows.map((w) => w.position)) + 1 : 0;
    await supabase.from("wake_windows").insert({ position: nextPosition, hours });
    setAddingWakeWindow(false);
    setNewWakeWindowHours("");
    loadWakeWindows();
  }

  async function deleteWakeWindow(id: string) {
    const supabase = createClient();
    await supabase.from("wake_windows").delete().eq("id", id);
    loadWakeWindows();
  }

  async function addNapDuration() {
    const hours = Number(newNapDurationHours.replace(",", "."));
    if (!hours || hours <= 0) return;

    setAddingNapDuration(true);
    const supabase = createClient();
    const nextPosition =
      napDurations.length > 0 ? Math.max(...napDurations.map((n) => n.position)) + 1 : 0;
    await supabase.from("nap_durations").insert({ position: nextPosition, hours });
    setAddingNapDuration(false);
    setNewNapDurationHours("");
    loadNapDurations();
  }

  async function deleteNapDuration(id: string) {
    const supabase = createClient();
    await supabase.from("nap_durations").delete().eq("id", id);
    loadNapDurations();
  }

  async function saveFeedingInterval() {
    const hours = Number(feedingIntervalHours.replace(",", "."));
    if (!hours || hours <= 0) return;

    setSavingFeedingInterval(true);
    setFeedingIntervalSaved(false);
    const supabase = createClient();
    // One shared row, so this is an update of the same id every time.
    const { error: saveError } = await supabase
      .from("feeding_settings")
      .upsert({ id: true, interval_hours: hours }, { onConflict: "id" });
    setSavingFeedingInterval(false);
    if (!saveError) setFeedingIntervalSaved(true);
    loadFeedingInterval();
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

      const [
        { data: sessions, error: sErr },
        { data: feedings, error: fErr },
        { data: wakings },
      ] = await Promise.all([
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
          supabase
            .from("night_wakings")
            .select("*")
            .gte("started_at", rangeStart)
            .lte("started_at", rangeEnd)
            .order("started_at", { ascending: true }),
        ]);

      if (sErr || fErr) {
        setError(t.settings.exportError);
        setExporting(false);
        return;
      }

      const XLSX = await import("xlsx");

      const nightWakings = wakings ?? [];

      const sleepRows = (sessions ?? []).map((s) => ({
        Date: format(new Date(s.started_at), "yyyy-MM-dd"),
        "Started at": format(new Date(s.started_at), "HH:mm"),
        "Ended at": s.ended_at ? format(new Date(s.ended_at), "HH:mm") : "still asleep",
        Duration: formatDuration(sessionDurationMinutes(s.started_at, s.ended_at)),
        "Sleep excl. wakings": formatDuration(sleepMinutesExcludingWakings(s, nightWakings)),
        "Night sleep": s.is_night_sleep ? "Yes" : "No",
        Notes: s.notes ?? "",
      }));

      const wakingRows = collectNightWakeUps(nightWakings).map((w) => ({
        Date: format(new Date(w.wokeAt), "yyyy-MM-dd"),
        "Woke at": format(new Date(w.wokeAt), "HH:mm"),
        "Back asleep at": w.backAsleepAt ? format(new Date(w.backAsleepAt), "HH:mm") : "still awake",
        "Awake for": formatDuration(w.awakeMinutes),
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
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(wakingRows),
        "Night wakings",
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
                {isAdmin && (
                  <button
                    onClick={() => deleteSolidFood(food.id)}
                    aria-label={t.settings.removeFoodAria(food.name)}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin ? (
          <>
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
          </>
        ) : (
          <p className="text-xs text-neutral-400">{t.settings.adminOnly}</p>
        )}

        <p className="mt-4 text-xs text-neutral-400">{t.settings.solidFoodsHint}</p>
      </div>

      <NotificationSettings />

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Hourglass className="h-4 w-4" strokeWidth={2} /> {t.settings.wakeWindows}
        </h2>

        {wakeWindows.length > 0 && (
          <ul className="mb-4 space-y-2">
            {wakeWindows.map((w, i) => (
              <li
                key={w.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    {i + 1}
                  </span>
                  {w.hours}h
                </span>
                {isAdmin && (
                  <button
                    onClick={() => deleteWakeWindow(w.id)}
                    aria-label={t.settings.removeWakeWindowAria(i + 1)}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin ? (
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={newWakeWindowHours}
              onChange={(e) => setNewWakeWindowHours(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addWakeWindow();
              }}
              placeholder={t.settings.wakeWindowPlaceholder}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
            <button
              onClick={addWakeWindow}
              disabled={addingWakeWindow || !newWakeWindowHours.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {t.settings.add}
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">{t.settings.adminOnly}</p>
        )}

        <p className="mt-4 text-xs text-neutral-400">{t.settings.wakeWindowsHint}</p>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Timer className="h-4 w-4" strokeWidth={2} /> {t.settings.napDurations}
        </h2>

        {napDurations.length > 0 && (
          <ul className="mb-4 space-y-2">
            {napDurations.map((n, i) => (
              <li
                key={n.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    {i + 1}
                  </span>
                  {n.hours}h
                </span>
                {isAdmin && (
                  <button
                    onClick={() => deleteNapDuration(n.id)}
                    aria-label={t.settings.removeNapDurationAria(i + 1)}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin ? (
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={newNapDurationHours}
              onChange={(e) => setNewNapDurationHours(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addNapDuration();
              }}
              placeholder={t.settings.napDurationPlaceholder}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
            <button
              onClick={addNapDuration}
              disabled={addingNapDuration || !newNapDurationHours.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {t.settings.add}
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">{t.settings.adminOnly}</p>
        )}

        <p className="mt-4 text-xs text-neutral-400">{t.settings.napDurationsHint}</p>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Milk className="h-4 w-4" strokeWidth={2} /> {t.settings.feedingInterval}
        </h2>

        {isAdmin ? (
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={feedingIntervalHours}
              onChange={(e) => {
                setFeedingIntervalHours(e.target.value);
                setFeedingIntervalSaved(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveFeedingInterval();
              }}
              placeholder={t.settings.feedingIntervalPlaceholder}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
            <button
              onClick={saveFeedingInterval}
              disabled={savingFeedingInterval || !feedingIntervalHours.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {feedingIntervalSaved ? t.settings.saved : t.settings.save}
            </button>
          </div>
        ) : (
          <>
            <p className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
              {feedingIntervalHours ? `${feedingIntervalHours}h` : "—"}
            </p>
            <p className="mt-2 text-xs text-neutral-400">{t.settings.adminOnly}</p>
          </>
        )}

        <p className="mt-4 text-xs text-neutral-400">{t.settings.feedingIntervalHint}</p>
      </div>

      {/* The whole day's log downloads here, so it's the admins' to hand out. */}
      {isAdmin && (
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
      )}
    </div>
  );
}
