"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isToday, startOfDay, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { DayTimeline } from "@/components/DayTimeline";
import { formatDuration, formatTime, isNightTime, splitIntervalByDay } from "@/lib/time";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [openSession, setOpenSession] = useState<SleepSession | null>(null);
  const [daySessions, setDaySessions] = useState<SleepSession[]>([]);
  const [dayFeedings, setDayFeedings] = useState<Feeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedingModalSleepId, setFeedingModalSleepId] = useState<string | null | undefined>(
    undefined,
  );
  const [wakePrompt, setWakePrompt] = useState<string | null>(null);
  const [nightAwakeningPending, setNightAwakeningPending] = useState(false);
  const [editingSession, setEditingSession] = useState<SleepSession | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Feeding | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const viewingToday = isToday(selectedDate);
  const dayKey = format(selectedDate, "yyyy-MM-dd");

  const load = useCallback(async () => {
    const supabase = createClient();
    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd = endOfDay(selectedDate).toISOString();

    const [{ data: open }, { data: sessions }, { data: feedings }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sleep_sessions")
        .select("*")
        .lte("started_at", dayEnd)
        .or(`ended_at.gte.${dayStart},ended_at.is.null`)
        .order("started_at", { ascending: false }),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd)
        .order("occurred_at", { ascending: false }),
    ]);

    setOpenSession(open ?? null);
    setDaySessions(sessions ?? []);
    setDayFeedings(feedings ?? []);
    setElapsedMinutes(
      isToday(selectedDate)
        ? Math.max(0, differenceInMinutes(new Date(), startOfDay(selectedDate)))
        : 1440,
    );
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when selected day changes
    load();
  }, [load]);

  async function startSleep(isNightSleep: boolean) {
    const supabase = createClient();
    await supabase
      .from("sleep_sessions")
      .insert({ started_at: new Date().toISOString(), is_night_sleep: isNightSleep });
    load();
  }

  async function endSleep() {
    if (!openSession) return;
    const supabase = createClient();
    const endedAt = new Date().toISOString();
    await supabase
      .from("sleep_sessions")
      .update({ ended_at: endedAt })
      .eq("id", openSession.id);

    if (isNightTime(endedAt)) {
      setWakePrompt(openSession.id);
    }
    load();
  }

  async function handleNightAwakening() {
    await endSleep();
    setNightAwakeningPending(true);
  }

  const daySegments = daySessions.flatMap((session) =>
    splitIntervalByDay(session.started_at, session.ended_at)
      .filter((seg) => seg.day === dayKey)
      .map((seg) => ({ session, ...seg })),
  );
  const totalSleepMinutes = daySegments.reduce(
    (sum, seg) => sum + (seg.endMinutes - seg.startMinutes),
    0,
  );
  const totalAwakeMinutes = Math.max(0, elapsedMinutes - totalSleepMinutes);
  const nightWakeUps = daySessions.filter(
    (s) =>
      s.ended_at &&
      isNightTime(s.ended_at) &&
      format(new Date(s.ended_at), "yyyy-MM-dd") === dayKey,
  ).length;

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          aria-label="Previous day"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ←
        </button>
        <h1 className="text-2xl font-semibold">
          {viewingToday ? "Today" : format(selectedDate, "EEEE, MMM d")}
        </h1>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={viewingToday}
          aria-label="Next day"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800"
        >
          →
        </button>
      </div>

      {viewingToday && (
        <div
          className={`mb-4 rounded-2xl bg-linear-to-br p-6 text-white shadow-sm transition-colors ${
            openSession ? "from-indigo-700 to-slate-900" : "from-amber-400 to-orange-500"
          }`}
        >
          <p className="text-sm opacity-80">{openSession ? "Asleep since" : "Awake since"}</p>
          <p className="mb-4 text-3xl font-semibold">
            {openSession
              ? formatTime(openSession.started_at)
              : daySessions.find((s) => s.ended_at)
                ? formatTime(daySessions[0].ended_at!)
                : "—"}
          </p>

          {openSession ? (
            openSession.is_night_sleep ? (
              <button
                onClick={handleNightAwakening}
                className="w-full rounded-xl bg-white/95 py-4 text-lg font-semibold text-indigo-700 shadow-sm active:scale-[0.98]"
              >
                🌙 Night awakening
              </button>
            ) : (
              <button
                onClick={endSleep}
                className="w-full rounded-xl bg-white/95 py-4 text-lg font-semibold text-indigo-700 shadow-sm active:scale-[0.98]"
              >
                😴 Woke up
              </button>
            )
          ) : nightAwakeningPending ? (
            <>
              <button
                onClick={() => {
                  startSleep(true);
                  setNightAwakeningPending(false);
                }}
                className="w-full rounded-xl bg-white/95 py-4 text-lg font-semibold text-orange-700 shadow-sm active:scale-[0.98]"
              >
                🌙 Put back to sleep
              </button>
              <button
                onClick={() => setNightAwakeningPending(false)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-3 text-sm font-semibold text-white active:scale-[0.98]"
              >
                ☀️ Woke up (done for the night)
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => startSleep(false)}
                className="w-full rounded-xl bg-white/95 py-4 text-lg font-semibold text-orange-700 shadow-sm active:scale-[0.98]"
              >
                🌙 Put down to sleep
              </button>
              <button
                onClick={() => startSleep(true)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-3 text-sm font-semibold text-white active:scale-[0.98]"
              >
                🌆 Start night sleep
              </button>
            </>
          )}
        </div>
      )}

      {viewingToday && (
        <button
          onClick={() => setFeedingModalSleepId(null)}
          className="mb-6 w-full rounded-xl border-2 border-teal-500 py-4 text-lg font-semibold text-teal-600 active:scale-[0.98] dark:text-teal-400"
        >
          🍼 Log a feeding
        </button>
      )}

      {/* Day rollup */}
      <div className="mb-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{formatDuration(totalSleepMinutes)}</p>
          <p className="text-xs text-slate-500">Asleep</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{formatDuration(totalAwakeMinutes)}</p>
          <p className="text-xs text-slate-500">Awake</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{dayFeedings.length}</p>
          <p className="text-xs text-slate-500">Feedings</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{nightWakeUps}</p>
          <p className="text-xs text-slate-500">Night wake-ups</p>
        </div>
      </div>

      {/* Timeline */}
      <h2 className="mb-2 text-sm font-semibold text-slate-500">Timeline</h2>
      <DayTimeline
        day={dayKey}
        sessions={daySessions}
        feedings={dayFeedings}
        isToday={viewingToday}
        onSelectSession={setEditingSession}
        onSelectFeeding={setEditingFeeding}
      />

      {feedingModalSleepId !== undefined && (
        <FeedingModal
          defaultSleepSessionId={feedingModalSleepId}
          defaultDate={selectedDate}
          onClose={() => setFeedingModalSleepId(undefined)}
          onSaved={() => {
            setFeedingModalSleepId(undefined);
            load();
          }}
        />
      )}

      {editingSession && (
        <SleepEditModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            setEditingSession(null);
            load();
          }}
        />
      )}

      {editingFeeding && (
        <FeedingModal
          feeding={editingFeeding}
          onClose={() => setEditingFeeding(null)}
          onSaved={() => {
            setEditingFeeding(null);
            load();
          }}
        />
      )}

      {wakePrompt && (
        <div className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-xl bg-slate-900 p-4 text-white shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <span className="text-sm">Did he eat during that wake-up?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setWakePrompt(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-300"
            >
              No
            </button>
            <button
              onClick={() => {
                setFeedingModalSleepId(wakePrompt);
                setWakePrompt(null);
              }}
              className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium"
            >
              Log it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
