"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { DayDetailPanel } from "@/components/DayDetailPanel";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { WeekView } from "@/components/WeekView";
import { findNightWakeUpEndTimes, formatDuration, sessionDurationMinutes } from "@/lib/time";

type DayStats = { sleepMinutes: number; feedingCount: number; nightWakeUps: number };

export default function CalendarPage() {
  const [view, setView] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [sessions, setSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [feedings, setFeedings] = useState<Tables<"feedings">[]>([]);
  const [nightSessions, setNightSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<Tables<"sleep_sessions"> | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Tables<"feedings"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const start = gridStart.toISOString();
    const end = gridEnd.toISOString();

    const [{ data: s }, { data: f }, { data: nights }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .gte("started_at", start)
        .lte("started_at", end),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", start)
        .lte("occurred_at", end),
      // Fetched unscoped by month so wake-up chains aren't cut off at range edges.
      supabase.from("sleep_sessions").select("*").eq("is_night_sleep", true),
    ]);

    setSessions(s ?? []);
    setFeedings(f ?? []);
    setNightSessions(nights ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (view !== "month") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when month changes
    load();
  }, [load, view]);

  const statsByDay = useMemo(() => {
    const map = new Map<string, DayStats>();
    for (const s of sessions) {
      const key = format(new Date(s.started_at), "yyyy-MM-dd");
      const stat = map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, nightWakeUps: 0 };
      stat.sleepMinutes += sessionDurationMinutes(s.started_at, s.ended_at);
      map.set(key, stat);
    }
    for (const f of feedings) {
      const key = format(new Date(f.occurred_at), "yyyy-MM-dd");
      const stat = map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, nightWakeUps: 0 };
      stat.feedingCount += 1;
      map.set(key, stat);
    }
    for (const wakeUpEnd of findNightWakeUpEndTimes(nightSessions)) {
      const key = format(new Date(wakeUpEnd), "yyyy-MM-dd");
      const stat = map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, nightWakeUps: 0 };
      stat.nightWakeUps += 1;
      map.set(key, stat);
    }
    return map;
  }, [sessions, feedings, nightSessions]);

  function refreshAfterEdit() {
    setEditingSession(null);
    setEditingFeeding(null);
    load();
    setWeekRefreshKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">
          {view === "month"
            ? format(month, "MMMM yyyy")
            : `${format(weekStart, "MMM d")} – ${format(addWeeks(weekStart, 1), "MMM d")}`}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-2xl border border-stone-200 p-0.5 text-sm dark:border-stone-700">
            <button
              onClick={() => setView("month")}
              className={`rounded-xl px-3 py-1 ${
                view === "month" ? "bg-violet-500 text-white" : "text-stone-600 dark:text-stone-300"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView("week")}
              className={`rounded-xl px-3 py-1 ${
                view === "week" ? "bg-violet-500 text-white" : "text-stone-600 dark:text-stone-300"
              }`}
            >
              Week
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                view === "month"
                  ? setMonth((m) => subMonths(m, 1))
                  : setWeekStart((w) => subWeeks(w, 1))
              }
              aria-label="Previous"
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              onClick={() =>
                view === "month"
                  ? setMonth(startOfMonth(new Date()))
                  : setWeekStart(startOfWeek(new Date()))
              }
              className="rounded-2xl border border-stone-200 px-3 py-1.5 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300"
            >
              Today
            </button>
            <button
              onClick={() =>
                view === "month"
                  ? setMonth((m) => addMonths(m, 1))
                  : setWeekStart((w) => addWeeks(w, 1))
              }
              aria-label="Next"
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-400 sm:gap-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className={`grid grid-cols-7 gap-1 sm:gap-2 ${loading ? "opacity-50" : ""}`}>
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const stat = statsByDay.get(key);
              const inMonth = isSameMonth(day, month);

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  className={`flex min-h-20 flex-col items-start rounded-2xl border p-1.5 text-left transition sm:min-h-24 sm:p-2 ${
                    inMonth
                      ? "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
                      : "border-transparent bg-stone-50 text-stone-300 dark:bg-stone-950"
                  } ${isToday(day) ? "ring-2 ring-violet-400" : ""}`}
                >
                  <span className="text-xs font-medium">{format(day, "d")}</span>
                  {stat && (
                    <div className="mt-auto space-y-0.5 text-[10px] leading-tight text-stone-500 sm:text-xs">
                      {stat.sleepMinutes > 0 && <p>😴 {formatDuration(stat.sleepMinutes)}</p>}
                      {stat.feedingCount > 0 && <p>🍼 ×{stat.feedingCount}</p>}
                      {stat.nightWakeUps > 0 && <p>🌙 ×{stat.nightWakeUps}</p>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <WeekView
          key={weekRefreshKey}
          weekStart={weekStart}
          onSelectDay={setSelectedDay}
          onSelectSession={setEditingSession}
          onSelectFeeding={setEditingFeeding}
        />
      )}

      {selectedDay && (
        <DayDetailPanel day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}

      {editingSession && (
        <SleepEditModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={refreshAfterEdit}
        />
      )}

      {editingFeeding && (
        <FeedingModal
          feeding={editingFeeding}
          onClose={() => setEditingFeeding(null)}
          onSaved={refreshAfterEdit}
        />
      )}
    </div>
  );
}
