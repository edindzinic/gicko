"use client";

import { useEffect, useRef } from "react";
import type { Tables } from "@/lib/database.types";
import { formatDuration, formatHourLabel, minutesSinceMidnight, splitIntervalByDay } from "@/lib/time";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

const HOUR_HEIGHT = 56; // px per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24;

function topForMinutes(minutes: number) {
  return (minutes / 60) * HOUR_HEIGHT;
}

export function DayTimeline({
  day,
  sessions,
  feedings,
  onSelectSession,
  onSelectFeeding,
  isToday = false,
}: {
  day: string; // yyyy-MM-dd
  sessions: SleepSession[];
  feedings: Feeding[];
  onSelectSession: (session: SleepSession) => void;
  onSelectFeeding: (feeding: Feeding) => void;
  isToday?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  useEffect(() => {
    if (!containerRef.current) return;
    const targetMinutes = isToday ? nowMinutes : 7 * 60;
    containerRef.current.scrollTop = Math.max(0, topForMinutes(targetMinutes) - 140);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const segments = sessions.flatMap((session) =>
    splitIntervalByDay(session.started_at, session.ended_at)
      .filter((seg) => seg.day === day)
      .map((seg) => ({ session, ...seg })),
  );

  const isEmpty = segments.length === 0 && feedings.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative max-h-[420px] overflow-y-auto rounded-2xl border border-stone-200 dark:border-stone-800"
    >
      <div className="flex">
        <div className="relative w-14 shrink-0 bg-stone-50/50 dark:bg-stone-900/50" style={{ height: DAY_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-stone-400"
              style={{ top: topForMinutes(hour * 60) }}
            >
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>

        <div
          className="relative flex-1 border-l border-stone-100 dark:border-stone-800"
          style={{ height: DAY_HEIGHT }}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-stone-100 dark:border-stone-800"
              style={{ top: topForMinutes(hour * 60) }}
            />
          ))}

          {isToday && (
            <div
              className="absolute inset-x-0 z-10 flex items-center gap-1"
              style={{ top: topForMinutes(nowMinutes) }}
            >
              <div className="h-2 w-2 rounded-full bg-rose-500" />
              <div className="h-px flex-1 bg-rose-500" />
            </div>
          )}

          {segments.map(({ session, startMinutes, endMinutes }, i) => {
            const ongoing = !session.ended_at;
            const top = topForMinutes(startMinutes);
            const height = Math.max(topForMinutes(endMinutes - startMinutes), 22);
            return (
              <button
                key={`${session.id}-${i}`}
                onClick={() => onSelectSession(session)}
                className={`absolute inset-x-2 rounded-lg px-2 py-1 text-left text-white shadow-sm transition hover:brightness-110 ${
                  session.is_night_sleep ? "bg-indigo-700" : "bg-violet-400"
                } ${ongoing ? "ring-2 ring-amber-300" : ""}`}
                style={{ top, height }}
              >
                <span className="text-xs font-medium">
                  {session.is_night_sleep ? "🌆 Night sleep" : "🌙 Nap"}
                </span>
                {height > 38 && (
                  <div className="text-[10px] opacity-90">
                    {formatDuration(endMinutes - startMinutes)}
                  </div>
                )}
              </button>
            );
          })}

          {feedings.map((feeding) => (
            <button
              key={feeding.id}
              onClick={() => onSelectFeeding(feeding)}
              className="absolute right-1 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-rose-400 px-2 py-1 text-[10px] font-medium text-white shadow ring-2 ring-white dark:ring-stone-900"
              style={{ top: topForMinutes(minutesSinceMidnight(feeding.occurred_at)) }}
            >
              🍼{feeding.amount ? ` ${feeding.amount}${feeding.unit}` : ""}
            </button>
          ))}

          {isEmpty && (
            <p className="absolute inset-x-0 top-24 text-center text-sm text-stone-400">
              Nothing logged {isToday ? "yet today" : "this day"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
