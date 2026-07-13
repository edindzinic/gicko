"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { DayDetailPanel } from "@/components/DayDetailPanel";
import { formatDuration, isNightTime, sessionDurationMinutes } from "@/lib/time";

type DayStats = { sleepMinutes: number; feedingCount: number; nightWakeUps: number };

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [sessions, setSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [feedings, setFeedings] = useState<Tables<"feedings">[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const start = gridStart.toISOString();
    const end = gridEnd.toISOString();

    const [{ data: s }, { data: f }] = await Promise.all([
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
    ]);

    setSessions(s ?? []);
    setFeedings(f ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when month changes
    load();
  }, [load]);

  const statsByDay = useMemo(() => {
    const map = new Map<string, DayStats>();
    for (const s of sessions) {
      const key = format(new Date(s.started_at), "yyyy-MM-dd");
      const stat = map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, nightWakeUps: 0 };
      stat.sleepMinutes += sessionDurationMinutes(s.started_at, s.ended_at);
      if (s.ended_at && isNightTime(s.ended_at)) stat.nightWakeUps += 1;
      map.set(key, stat);
    }
    for (const f of feedings) {
      const key = format(new Date(f.occurred_at), "yyyy-MM-dd");
      const stat = map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, nightWakeUps: 0 };
      stat.feedingCount += 1;
      map.set(key, stat);
    }
    return map;
  }, [sessions, feedings]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{format(month, "MMMM yyyy")}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            ←
          </button>
          <button
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Today
          </button>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 sm:gap-2">
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
              className={`flex min-h-20 flex-col items-start rounded-lg border p-1.5 text-left transition sm:min-h-24 sm:p-2 ${
                inMonth
                  ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  : "border-transparent bg-slate-50 text-slate-300 dark:bg-slate-950"
              } ${isToday(day) ? "ring-2 ring-sky-500" : ""}`}
            >
              <span className="text-xs font-medium">{format(day, "d")}</span>
              {stat && (
                <div className="mt-auto space-y-0.5 text-[10px] leading-tight text-slate-500 sm:text-xs">
                  {stat.sleepMinutes > 0 && <p>😴 {formatDuration(stat.sleepMinutes)}</p>}
                  {stat.feedingCount > 0 && <p>🍼 ×{stat.feedingCount}</p>}
                  {stat.nightWakeUps > 0 && <p>🌙 ×{stat.nightWakeUps}</p>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <DayDetailPanel day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
