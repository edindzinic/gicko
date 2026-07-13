"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import {
  formatDuration,
  formatTime,
  isNightTime,
  sessionDurationMinutes,
} from "@/lib/time";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function HomePage() {
  const [openSession, setOpenSession] = useState<SleepSession | null>(null);
  const [todaySessions, setTodaySessions] = useState<SleepSession[]>([]);
  const [todayFeedings, setTodayFeedings] = useState<Feeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedingModalSleepId, setFeedingModalSleepId] = useState<string | null | undefined>(
    undefined,
  );
  const [wakePrompt, setWakePrompt] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<SleepSession | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Feeding | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const todayIso = startOfToday().toISOString();

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
        .gte("started_at", todayIso)
        .order("started_at", { ascending: false }),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", todayIso)
        .order("occurred_at", { ascending: false }),
    ]);

    setOpenSession(open ?? null);
    setTodaySessions(sessions ?? []);
    setTodayFeedings(feedings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  async function handleToggleSleep() {
    const supabase = createClient();

    if (openSession) {
      const endedAt = new Date().toISOString();
      await supabase
        .from("sleep_sessions")
        .update({ ended_at: endedAt })
        .eq("id", openSession.id);

      if (isNightTime(endedAt)) {
        setWakePrompt(openSession.id);
      }
    } else {
      await supabase
        .from("sleep_sessions")
        .insert({ started_at: new Date().toISOString() });
    }

    load();
  }

  const totalSleepMinutes = todaySessions.reduce(
    (sum, s) => sum + sessionDurationMinutes(s.started_at, s.ended_at),
    0,
  );
  const nightWakeUps = todaySessions.filter(
    (s) => s.ended_at && isNightTime(s.ended_at),
  ).length;

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold">Today</h1>

      {/* Status card */}
      <div
        className={`mb-4 rounded-2xl bg-linear-to-br p-6 text-white shadow-sm transition-colors ${
          openSession
            ? "from-indigo-700 to-slate-900"
            : "from-amber-400 to-orange-500"
        }`}
      >
        <p className="text-sm opacity-80">
          {openSession ? "Asleep since" : "Awake since"}
        </p>
        <p className="mb-4 text-3xl font-semibold">
          {openSession
            ? formatTime(openSession.started_at)
            : todaySessions.find((s) => s.ended_at)
              ? formatTime(todaySessions[0].ended_at!)
              : "—"}
        </p>
        <button
          onClick={handleToggleSleep}
          className={`w-full rounded-xl bg-white/95 py-4 text-lg font-semibold shadow-sm active:scale-[0.98] ${
            openSession ? "text-indigo-700" : "text-orange-700"
          }`}
        >
          {openSession ? "😴 Woke up" : "🌙 Put down to sleep"}
        </button>
      </div>

      <button
        onClick={() => setFeedingModalSleepId(null)}
        className="mb-6 w-full rounded-xl border-2 border-sky-500 py-4 text-lg font-semibold text-sky-600 active:scale-[0.98] dark:text-sky-400"
      >
        🍼 Log a feeding
      </button>

      {/* Today's rollup */}
      <div className="mb-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{formatDuration(totalSleepMinutes)}</p>
          <p className="text-xs text-slate-500">Sleep today</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{todayFeedings.length}</p>
          <p className="text-xs text-slate-500">Feedings</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xl font-semibold">{nightWakeUps}</p>
          <p className="text-xs text-slate-500">Night wake-ups</p>
        </div>
      </div>

      {/* Timeline */}
      <h2 className="mb-2 text-sm font-semibold text-slate-500">Timeline</h2>
      <ul className="space-y-2">
        {[...todaySessions.map((s) => ({ type: "sleep" as const, item: s })), ...todayFeedings.map((f) => ({ type: "feeding" as const, item: f }))]
          .sort((a, b) => {
            const aTime = a.type === "sleep" ? a.item.started_at : a.item.occurred_at;
            const bTime = b.type === "sleep" ? b.item.started_at : b.item.occurred_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          })
          .map((entry) => (
            <li key={`${entry.type}-${entry.item.id}`}>
              <button
                onClick={() =>
                  entry.type === "sleep"
                    ? setEditingSession(entry.item)
                    : setEditingFeeding(entry.item)
                }
                className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <span className="text-xl">
                  {entry.type === "sleep" ? "🌙" : "🍼"}
                </span>
                <div className="flex-1">
                  {entry.type === "sleep" ? (
                    <>
                      <p className="text-sm font-medium">
                        {formatTime(entry.item.started_at)} –{" "}
                        {entry.item.ended_at ? formatTime(entry.item.ended_at) : "now"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDuration(
                          sessionDurationMinutes(entry.item.started_at, entry.item.ended_at),
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium capitalize">
                        {entry.item.feed_type}
                        {entry.item.amount ? ` · ${entry.item.amount}${entry.item.unit}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatTime(entry.item.occurred_at)}
                      </p>
                    </>
                  )}
                </div>
                <span className="text-slate-300">✎</span>
              </button>
            </li>
          ))}
        {todaySessions.length === 0 && todayFeedings.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Nothing logged yet today.
          </p>
        )}
      </ul>

      {feedingModalSleepId !== undefined && (
        <FeedingModal
          defaultSleepSessionId={feedingModalSleepId}
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
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium"
            >
              Log it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
