"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isToday, parseISO, startOfDay, subDays } from "date-fns";
import { Bed, ChevronLeft, ChevronRight, Milk, Moon, PencilLine, Sun, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { DayTimeline } from "@/components/DayTimeline";
import {
  computeDayStats,
  findNightWakeUpEndTimes,
  formatDuration,
  formatTime,
  isNightTime,
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
  const [creatingSleep, setCreatingSleep] = useState<{ start: Date; end: Date | null } | null>(
    null,
  );
  const [creatingFeeding, setCreatingFeeding] = useState<{ at: Date } | null>(null);
  const [now, setNow] = useState(() => new Date());

  const viewingToday = isToday(selectedDate);
  const dayKey = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    if (!viewingToday) return;
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [viewingToday]);

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

  const { nightSleepMinutes, dayAwakeMinutes, napMinutes } = computeDayStats(
    dayKey,
    nightSessions,
    daySessions,
    viewingToday ? new Date() : endOfDay(selectedDate),
  );
  const nightWakeUps = findNightWakeUpEndTimes(nightSessions).filter(
    (t) => format(new Date(t), "yyyy-MM-dd") === dayKey,
  ).length;
  const totalMlToday = dayFeedings.reduce((sum, f) => {
    if (f.amount == null) return sum;
    return sum + (f.unit === "oz" ? f.amount * 29.5735 : f.amount);
  }, 0);

  if (loading) {
    return <div className="p-6 text-center text-neutral-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          aria-label="Previous day"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {viewingToday ? "Today" : format(selectedDate, "EEEE, MMM d")}
        </h1>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={viewingToday}
          aria-label="Next day"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-neutral-900"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      {viewingToday && (
        <div
          className={`mb-4 rounded-2xl bg-linear-to-br p-6 text-center text-white shadow-xl transition-colors ${
            openSession
              ? "from-neutral-700 to-neutral-950 shadow-neutral-300 dark:shadow-black/40"
              : "from-accent-soft to-accent shadow-amber-200/60 dark:shadow-black/40"
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
              <>
                <button
                  onClick={() => setEditingSession(statusSession)}
                  className="mb-1 flex w-full items-center justify-center gap-2 text-4xl font-semibold tracking-tight"
                >
                  {formatTime(statusTime)}
                  <PencilLine className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                </button>
                <p className="mb-4 text-sm font-medium opacity-90">
                  {formatDuration(Math.max(0, differenceInMinutes(now, parseISO(statusTime))))}{" "}
                  {openSession ? "asleep" : "awake"}
                </p>
              </>
            ) : (
              <p className="mb-4 text-4xl font-semibold">—</p>
            );
          })()}

          {openSession ? (
            openSession.is_night_sleep ? (
              <button
                onClick={handleNightAwakening}
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
              >
                🌙 Night awakening
              </button>
            ) : (
              <button
                onClick={endSleep}
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
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
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-amber-800 shadow-sm active:scale-[0.98]"
              >
                🌙 Put back to sleep
              </button>
              <button
                onClick={() => setNightAwakeningPending(false)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
              >
                ☀️ Woke up (done for the night)
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => startSleep(false)}
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-amber-800 shadow-sm active:scale-[0.98]"
              >
                🌙 Put down to sleep
              </button>
              <button
                onClick={() => startSleep(true)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
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
          className="mb-6 w-full rounded-xl border-2 border-accent py-4 text-lg font-semibold text-accent active:scale-[0.98]"
        >
          🍼 Log a feeding
        </button>
      )}

      {/* Day rollup */}
      <div className="mb-6 grid grid-cols-6 gap-3 text-center sm:grid-cols-5">
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Moon className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(nightSleepMinutes)}
          </p>
          <p className="text-xs text-neutral-500">Night sleep</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Sun className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(dayAwakeMinutes)}
          </p>
          <p className="text-xs text-neutral-500">Daytime awake</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Bed className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(napMinutes)}
          </p>
          <p className="text-xs text-neutral-500">Naps total</p>
        </div>
        <div className="col-span-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Milk className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {dayFeedings.length}
          </p>
          <p className="text-xs text-neutral-500">Feedings</p>
          {totalMlToday > 0 && (
            <p className="text-[11px] text-neutral-400">{Math.round(totalMlToday)}ml</p>
          )}
        </div>
        <div className="col-span-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Timer className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {nightWakeUps}
          </p>
          <p className="text-xs text-neutral-500">Night wake-ups</p>
        </div>
      </div>

      {/* Timeline */}
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">Timeline</h2>
      <DayTimeline
        day={dayKey}
        sessions={daySessions}
        feedings={dayFeedings}
        isToday={viewingToday}
        onSelectSession={setEditingSession}
        onSelectFeeding={setEditingFeeding}
        onCreateSleep={(start, end) => setCreatingSleep({ start, end })}
        onCreateFeeding={(at) => setCreatingFeeding({ at })}
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

      {creatingSleep && (
        <SleepEditModal
          defaultStart={creatingSleep.start}
          defaultEnd={creatingSleep.end ?? undefined}
          onClose={() => setCreatingSleep(null)}
          onSaved={() => {
            setCreatingSleep(null);
            load();
          }}
        />
      )}

      {creatingFeeding && (
        <FeedingModal
          defaultDateTime={creatingFeeding.at}
          onClose={() => setCreatingFeeding(null)}
          onSaved={() => {
            setCreatingFeeding(null);
            load();
          }}
        />
      )}

      {wakePrompt && (
        <div className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-xl bg-neutral-900 p-4 text-white shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <span className="text-sm">Did he eat during that wake-up?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setWakePrompt(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300"
            >
              No
            </button>
            <button
              onClick={() => {
                setFeedingModalSleepId(wakePrompt);
                setWakePrompt(null);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              Log it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
