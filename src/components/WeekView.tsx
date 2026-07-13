"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, eachDayOfInterval, format, isToday } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { minutesSinceMidnight, splitIntervalByDay } from "@/lib/time";

const HOUR_HEIGHT = 32; // px per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

function pct(minutes: number) {
  return (minutes / 1440) * DAY_HEIGHT;
}

function formatHourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function WeekView({
  weekStart,
  onSelectSession,
  onSelectFeeding,
  onSelectDay,
}: {
  weekStart: Date;
  onSelectSession: (session: SleepSession) => void;
  onSelectFeeding: (feeding: Feeding) => void;
  onSelectDay: (day: string) => void;
}) {
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [loading, setLoading] = useState(true);

  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // Buffer a day on each side so overnight sessions spanning the week's
    // edges still show up (and get clipped to this week by splitIntervalByDay).
    const rangeStart = addDays(weekStart, -1).toISOString();
    const rangeEnd = addDays(weekStart, 8).toISOString();

    const [{ data: s }, { data: f }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .lte("started_at", rangeEnd)
        .or(`ended_at.gte.${rangeStart},ended_at.is.null`)
        .order("started_at", { ascending: true }),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", rangeStart)
        .lte("occurred_at", rangeEnd),
    ]);

    setSessions(s ?? []);
    setFeedings(f ?? []);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when week changes
    load();
  }, [load]);

  const weekDayKeys = new Set(days.map((d) => format(d, "yyyy-MM-dd")));

  const segmentsByDay = new Map<
    string,
    { session: SleepSession; startMinutes: number; endMinutes: number }[]
  >();
  for (const session of sessions) {
    for (const seg of splitIntervalByDay(session.started_at, session.ended_at)) {
      if (!weekDayKeys.has(seg.day)) continue;
      const list = segmentsByDay.get(seg.day) ?? [];
      list.push({ session, startMinutes: seg.startMinutes, endMinutes: seg.endMinutes });
      segmentsByDay.set(seg.day, list);
    }
  }

  const feedingsByDay = new Map<string, Feeding[]>();
  for (const feeding of feedings) {
    const key = format(new Date(feeding.occurred_at), "yyyy-MM-dd");
    if (!weekDayKeys.has(key)) continue;
    const list = feedingsByDay.get(key) ?? [];
    list.push(feeding);
    feedingsByDay.set(key, list);
  }

  return (
    <div className={loading ? "opacity-50" : ""}>
      <div className="overflow-x-auto">
        <div className="flex min-w-[720px]">
          <div className="w-14 shrink-0" />
          {days.map((day) => (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(format(day, "yyyy-MM-dd"))}
              className={`flex-1 rounded-lg py-2 text-center text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${
                isToday(day) ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500"
              }`}
            >
              <div>{format(day, "EEE")}</div>
              <div className="text-base">{format(day, "d")}</div>
            </button>
          ))}
        </div>

        <div className="flex min-w-[720px]">
          <div className="relative w-14 shrink-0" style={{ height: DAY_HEIGHT }}>
            {HOUR_LABELS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400"
                style={{ top: pct(hour * 60) }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const segments = segmentsByDay.get(key) ?? [];
            const dayFeedings = feedingsByDay.get(key) ?? [];

            return (
              <div
                key={key}
                className="relative flex-1 border-l border-slate-100 dark:border-slate-800"
                style={{ height: DAY_HEIGHT }}
              >
                {HOUR_LABELS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800"
                    style={{ top: pct(hour * 60) }}
                  />
                ))}

                {segments.map(({ session, startMinutes, endMinutes }, i) => {
                  const ongoing = !session.ended_at;
                  const top = pct(startMinutes);
                  const height = Math.max(pct(endMinutes - startMinutes), 6);
                  return (
                    <button
                      key={`${session.id}-${i}`}
                      onClick={() => onSelectSession(session)}
                      title={session.is_night_sleep ? "Night sleep" : "Nap"}
                      className={`absolute inset-x-0.5 rounded-md px-1 text-left text-[10px] leading-tight text-white ${
                        session.is_night_sleep
                          ? "bg-indigo-700"
                          : "bg-violet-400"
                      } ${ongoing ? "ring-2 ring-amber-300" : ""}`}
                      style={{ top, height }}
                    >
                      {height > 16 && (session.is_night_sleep ? "🌆" : "🌙")}
                    </button>
                  );
                })}

                {dayFeedings.map((feeding) => (
                  <button
                    key={feeding.id}
                    onClick={() => onSelectFeeding(feeding)}
                    title={`${feeding.feed_type}${feeding.amount ? ` · ${feeding.amount}${feeding.unit}` : ""}`}
                    className="absolute right-0.5 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-teal-500 text-[9px] shadow ring-2 ring-white dark:ring-slate-900"
                    style={{ top: pct(minutesSinceMidnight(feeding.occurred_at)) }}
                  >
                    🍼
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-indigo-700" /> Night sleep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-violet-400" /> Nap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-teal-500" /> Feeding
        </span>
      </div>
    </div>
  );
}
