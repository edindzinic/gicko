"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { computeDue, DEFAULT_FEEDING_INTERVAL_HOURS, type Due } from "@/lib/schedule.ts";
import { currentReminder, reminderKey } from "@/lib/reminders";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

/** Enough history for computeDue to find this morning's wake-up and the naps since. */
const LOOKBACK_HOURS = 48;
/** The moment a reminder comes due should land within a minute of it, not a refetch later. */
const TICK_MS = 20_000;
const DISMISSED_KEY = "gicko-dismissed-reminders";

type Data = {
  sessions: { id: string; started_at: string; ended_at: string | null; is_night_sleep: boolean }[];
  feedings: { id: string; occurred_at: string }[];
  wakeWindowHours: number[];
  napDurationHours: number[];
  feedingIntervalHours: number;
};

/**
 * Anything already waved away, as `kind:dedupeKey`. Held in localStorage rather than in
 * state so a reload doesn't bring back a reminder that's been dealt with, and per device
 * because dismissing one on your phone says nothing about whether the other parent has
 * seen it on theirs.
 */
function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * The reminders, in the app itself.
 *
 * Push only reaches a device once someone has turned it on there, and on an iPhone only
 * once the app has been added to the home screen — so in practice it reaches some of the
 * people some of the time. This needs no permission and no install: if you have the app
 * open when a nap falls due, you're told.
 *
 * It reads the same rules the push reminders do, from the same file, and shows each one
 * for exactly the window that reminder is good for — the ten minutes before a nap, the
 * twenty before bedtime. Past that the moment has gone and the banner goes with it.
 */
export function ReminderBanner() {
  const { t } = useLanguage();
  const [data, setData] = useState<Data | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable once mounted
    setDismissed(readDismissed());
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

    const [{ data: sessions }, { data: feedings }, { data: windows }, { data: naps }, { data: settings }] =
      await Promise.all([
        supabase
          .from("sleep_sessions")
          .select("id, started_at, ended_at, is_night_sleep")
          .gte("started_at", since),
        supabase.from("feedings").select("id, occurred_at").gte("occurred_at", since),
        supabase.from("wake_windows").select("hours").order("position", { ascending: true }),
        supabase.from("nap_durations").select("hours").order("position", { ascending: true }),
        supabase.from("feeding_settings").select("interval_hours").maybeSingle(),
      ]);

    setData({
      sessions: sessions ?? [],
      feedings: feedings ?? [],
      wakeWindowHours: (windows ?? []).map((w) => w.hours),
      napDurationHours: (naps ?? []).map((n) => n.hours),
      feedingIntervalHours: settings?.interval_hours ?? DEFAULT_FEEDING_INTERVAL_HOURS,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load();
  }, [load]);

  useAutoRefresh(load);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  function dismiss(due: Due) {
    const next = [...dismissed, reminderKey(due)];
    // Only what's live can still be dismissed, so the list can't grow without end.
    const trimmed = next.slice(-20);
    setDismissed(trimmed);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
    } catch {
      // A browser refusing storage costs a reminder coming back on reload, nothing more.
    }
  }

  if (!data) return null;

  const showing = currentReminder(
    computeDue(now, data.sessions, data.feedings, {
      wakeWindowHours: data.wakeWindowHours,
      napDurationHours: data.napDurationHours,
      feedingIntervalHours: data.feedingIntervalHours,
    }),
    now,
    dismissed,
  );
  if (!showing) return null;

  const copy = t.reminders[showing.kind];
  return <ReminderCard title={copy.title} body={copy.body} onDismiss={() => dismiss(showing)} />;
}

/** The banner itself, with no idea what a reminder is — kept separate so it can be looked at. */
export function ReminderCard({
  title,
  body,
  onDismiss,
}: {
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="sticky top-0 z-20 border-b border-accent/30 bg-accent/10 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Bell className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{body}</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t.reminders.dismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
