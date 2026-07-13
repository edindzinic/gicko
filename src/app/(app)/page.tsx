"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isToday, startOfDay, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Milk, Moon, PencilLine, Sun, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { DayTimeline } from "@/components/DayTimeline";
import {
  findNightWakeUpEndTimes,
  formatDuration,
  formatTime,
  isNightTime,
  splitIntervalByDay,
} from "@/lib/time";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [openSession, setOpenSession] = useState<SleepSession | null>(null);
  const [daySessions, setDaySessions] = useState<SleepSession[]>([]);
  const [dayFeedings, setDayFeedings] = useState<Feeding[]>([]);
  const [nightSessions, setNightSessions] = useState<SleepSession[]>([]);
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

    const [{ data: open }, { data: sessions }, { data: feedings }, { data: nights }] =
      await Promise.all([
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
        // Fetched unscoped by day so wake-up chains aren't cut off at midnight.
        supabase.from("sleep_sessions").select("*").eq("is_night_sleep", true),
      ]);

    setOpenSession(open ?? null);
    setDaySessions(sessions ?? []);
    setDayFeedings(feedings ?? []);
    setNightSessions(nights ?? []);
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
  const nightWakeUps = findNightWakeUpEndTimes(nightSessions).filter(
    (t) => format(new Date(t), "yyyy-MM-dd") === dayKey,
  ).length;

  if (loading) {
    return <div className="p-6 text-center text-stone-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          aria-label="Previous day"
          className="flex h-10 w-10 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">
          {viewingToday ? "Today" : format(selectedDate, "EEEE, MMM d")}
        </h1>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={viewingToday}
          aria-label="Next day"
          className="flex h-10 w-10 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      {viewingToday && (
        <div
          className={`mb-4 rounded-3xl bg-linear-to-br p-6 text-white shadow-lg transition-colors ${
            openSession
              ? "from-violet-500 to-indigo-700 shadow-indigo-200 dark:shadow-none"
              : "from-amber-300 to-orange-400 shadow-orange-200 dark:shadow-none"
          }`}
        >
          <p className="text-sm opacity-80">{openSession ? "Asleep since" : "Awake since"}</p>
          {(() => {
            const lastEndedSession = daySessions.find((s) => s.ended_at);
            const statusSession = openSession ?? lastEndedSession ?? null;
            const statusTime = openSession
              ? openSession.started_at
              : (lastEndedSession?.ended_at ?? null);

            return statusSession && statusTime ? (
              <button
                onClick={() => setEditingSession(statusSession)}
                className="mb-4 flex items-center gap-2 text-3xl font-semibold"
              >
                {formatTime(statusTime)}
                <PencilLine className="h-4 w-4 opacity-70" strokeWidth={2} />
              </button>
            ) : (
              <p className="mb-4 text-3xl font-semibold">—</p>
            );
          })()}

          {openSession ? (
            openSession.is_night_sleep ? (
              <button
                onClick={handleNightAwakening}
                className="w-full rounded-2xl bg-white/95 py-4 text-lg font-semibold text-violet-700 shadow-sm active:scale-[0.98]"
              >
                🌙 Night awakening
              </button>
            ) : (
              <button
                onClick={endSleep}
                className="w-full rounded-2xl bg-white/95 py-4 text-lg font-semibold text-violet-700 shadow-sm active:scale-[0.98]"
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
                className="w-full rounded-2xl bg-white/95 py-4 text-lg font-semibold text-orange-600 shadow-sm active:scale-[0.98]"
              >
                🌙 Put back to sleep
              </button>
              <button
                onClick={() => setNightAwakeningPending(false)}
                className="mt-2 w-full rounded-2xl border border-white/60 bg-white/10 py-3 text-sm font-semibold text-white active:scale-[0.98]"
              >
                ☀️ Woke up (done for the night)
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => startSleep(false)}
                className="w-full rounded-2xl bg-white/95 py-4 text-lg font-semibold text-orange-600 shadow-sm active:scale-[0.98]"
              >
                🌙 Put down to sleep
              </button>
              <button
                onClick={() => startSleep(true)}
                className="mt-2 w-full rounded-2xl border border-white/60 bg-white/10 py-3 text-sm font-semibold text-white active:scale-[0.98]"
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
          className="mb-6 w-full rounded-2xl border-2 border-rose-400 py-4 text-lg font-semibold text-rose-500 active:scale-[0.98] dark:border-rose-500 dark:text-rose-400"
        >
          🍼 Log a feeding
        </button>
      )}

      {/* Day rollup */}
      <div className="mb-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div className="rounded-3xl bg-violet-50 p-4 dark:bg-violet-500/10">
          <Moon className="mx-auto mb-1 h-4 w-4 text-violet-500" strokeWidth={2} />
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100">
            {formatDuration(totalSleepMinutes)}
          </p>
          <p className="text-xs text-stone-500">Asleep</p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-4 dark:bg-amber-500/10">
          <Sun className="mx-auto mb-1 h-4 w-4 text-amber-500" strokeWidth={2} />
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100">
            {formatDuration(totalAwakeMinutes)}
          </p>
          <p className="text-xs text-stone-500">Awake</p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <Milk className="mx-auto mb-1 h-4 w-4 text-rose-500" strokeWidth={2} />
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100">
            {dayFeedings.length}
          </p>
          <p className="text-xs text-stone-500">Feedings</p>
        </div>
        <div className="rounded-3xl bg-stone-100 p-4 dark:bg-stone-800">
          <Timer className="mx-auto mb-1 h-4 w-4 text-stone-500" strokeWidth={2} />
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100">
            {nightWakeUps}
          </p>
          <p className="text-xs text-stone-500">Night wake-ups</p>
        </div>
      </div>

      {/* Timeline */}
      <h2 className="mb-2 text-sm font-semibold text-stone-500">Timeline</h2>
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
        <div className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-2xl bg-stone-800 p-4 text-white shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <span className="text-sm">Did he eat during that wake-up?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setWakePrompt(null)}
              className="rounded-xl px-3 py-1.5 text-sm text-stone-300"
            >
              No
            </button>
            <button
              onClick={() => {
                setFeedingModalSleepId(wakePrompt);
                setWakePrompt(null);
              }}
              className="rounded-xl bg-rose-500 px-3 py-1.5 text-sm font-medium"
            >
              Log it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
