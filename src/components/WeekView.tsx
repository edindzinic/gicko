"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { addDays, addMinutes, eachDayOfInterval, format, isToday, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { formatDuration, formatHourLabel, minutesSinceMidnight, splitIntervalByDay } from "@/lib/time";
import { feedTypeIcon } from "@/lib/feedingTypes";

const HOUR_HEIGHT = 32; // px per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
const SNAP_MINUTES = 5;
const FEEDING_MIN_GAP_PX = 16; // min vertical gap before two feeding badges would overlap
const FEEDING_COLUMN_WIDTH_PX = 18;

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

function pct(minutes: number) {
  return (minutes / 1440) * DAY_HEIGHT;
}

function clampMinutes(minutes: number) {
  return Math.min(1439, Math.max(0, minutes));
}

function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minuteLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesToDate(day: string, minutes: number) {
  return addMinutes(parseISO(`${day}T00:00:00`), minutes);
}

export function WeekView({
  startDate,
  visibleDays,
  onSelectSession,
  onSelectFeeding,
  onSelectDay,
  onCreateSleep,
  onCreateFeeding,
}: {
  startDate: Date;
  /** Number of day columns to render (e.g. 3 on mobile, 7 on desktop). */
  visibleDays: number;
  onSelectSession: (session: SleepSession) => void;
  onSelectFeeding: (feeding: Feeding) => void;
  onSelectDay: (day: string) => void;
  onCreateSleep: (day: string, start: Date, end: Date | null) => void;
  onCreateFeeding: (day: string, at: Date) => void;
}) {
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [tapPrompt, setTapPrompt] = useState<{ day: string; minutes: number } | null>(null);

  const days = eachDayOfInterval({ start: startDate, end: addDays(startDate, visibleDays - 1) });

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // Buffer a day on each side so overnight sessions spanning the window's
    // edges still show up (and get clipped to this window by splitIntervalByDay).
    const rangeStart = addDays(startDate, -1).toISOString();
    const rangeEnd = addDays(startDate, visibleDays + 1).toISOString();

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
  }, [startDate, visibleDays]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the window changes
    load();
  }, [load]);

  function handleColumnClick(e: MouseEvent<HTMLDivElement>, day: string) {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = clampMinutes(((e.clientY - rect.top) / DAY_HEIGHT) * 1440);
    setTapPrompt({ day, minutes: snapMinutes(minutes) });
  }

  const visibleDayKeys = new Set(days.map((d) => format(d, "yyyy-MM-dd")));

  const segmentsByDay = new Map<
    string,
    { session: SleepSession; startMinutes: number; endMinutes: number }[]
  >();
  for (const session of sessions) {
    for (const seg of splitIntervalByDay(session.started_at, session.ended_at)) {
      if (!visibleDayKeys.has(seg.day)) continue;
      const list = segmentsByDay.get(seg.day) ?? [];
      list.push({ session, startMinutes: seg.startMinutes, endMinutes: seg.endMinutes });
      segmentsByDay.set(seg.day, list);
    }
  }

  const feedingsByDay = new Map<string, Feeding[]>();
  for (const feeding of feedings) {
    const key = format(new Date(feeding.occurred_at), "yyyy-MM-dd");
    if (!visibleDayKeys.has(key)) continue;
    const list = feedingsByDay.get(key) ?? [];
    list.push(feeding);
    feedingsByDay.set(key, list);
  }

  return (
    <div className={`isolate ${loading ? "opacity-50" : ""}`}>
      <div className="flex">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => onSelectDay(format(day, "yyyy-MM-dd"))}
            className={`flex-1 rounded-xl py-2 text-center text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900 ${
              isToday(day) ? "text-accent" : "text-neutral-400"
            }`}
          >
            <div>{format(day, "EEE")}</div>
            <div className="text-base">{format(day, "d")}</div>
          </button>
        ))}
      </div>

      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height: DAY_HEIGHT }}>
          {HOUR_LABELS.map((hour) => (
            <div
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400"
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
          const feedingColumnBottoms: number[] = [];
          const feedingLayout = [...dayFeedings]
            .sort(
              (a, b) => minutesSinceMidnight(a.occurred_at) - minutesSinceMidnight(b.occurred_at),
            )
            .map((feeding) => {
              const top = pct(minutesSinceMidnight(feeding.occurred_at));
              let column = feedingColumnBottoms.findIndex((bottom) => top >= bottom);
              if (column === -1) column = feedingColumnBottoms.length;
              feedingColumnBottoms[column] = top + FEEDING_MIN_GAP_PX;
              return { feeding, top, column };
            });

          return (
            <div
              key={key}
              className="relative flex-1 border-l border-neutral-100 dark:border-neutral-900"
              style={{ height: DAY_HEIGHT }}
              onClick={(e) => handleColumnClick(e, key)}
            >
              {HOUR_LABELS.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-neutral-100 dark:border-neutral-900"
                  style={{ top: pct(hour * 60) }}
                />
              ))}

              {segments.map(({ session, startMinutes, endMinutes }, i) => {
                const ongoing = !session.ended_at;
                const top = pct(startMinutes);
                const duration = endMinutes - startMinutes;
                const height = Math.max(pct(duration), 6);
                return (
                  <button
                    key={`${session.id}-${i}`}
                    onClick={() => onSelectSession(session)}
                    title={`${session.is_night_sleep ? "Night sleep" : "Nap"} · ${formatDuration(duration)}`}
                    className={`absolute inset-x-0.5 overflow-hidden rounded-lg px-1 text-left text-[10px] leading-tight whitespace-nowrap text-white ${
                      session.is_night_sleep
                        ? "bg-slate-700"
                        : "bg-slate-400"
                    } ${ongoing ? "ring-2 ring-amber-300" : ""}`}
                    style={{ top, height }}
                  >
                    {height > 16 &&
                      `${session.is_night_sleep ? "🌆" : "🌙"} ${formatDuration(duration)}`}
                  </button>
                );
              })}

              {feedingLayout.map(({ feeding, top, column }) => (
                <button
                  key={feeding.id}
                  onClick={() => onSelectFeeding(feeding)}
                  title={`${feeding.feed_type}${feeding.amount ? ` · ${feeding.amount}${feeding.unit}` : ""}`}
                  className="absolute z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-[9px] shadow ring-2 ring-white dark:ring-neutral-950"
                  style={{ top, right: 2 + column * FEEDING_COLUMN_WIDTH_PX }}
                >
                  {feedTypeIcon(feeding.feed_type)}
                </button>
              ))}

              {tapPrompt && tapPrompt.day === key && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTapPrompt(null);
                    }}
                  />
                  <div
                    className="absolute inset-x-0.5 z-40 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                    style={{ top: pct(tapPrompt.minutes) }}
                  >
                    <p className="mb-1 px-0.5 text-[9px] text-neutral-400">
                      {minuteLabel(tapPrompt.minutes)}
                    </p>
                    <button
                      onClick={() => {
                        onCreateSleep(
                          tapPrompt.day,
                          minutesToDate(tapPrompt.day, tapPrompt.minutes),
                          null,
                        );
                        setTapPrompt(null);
                      }}
                      className="mb-1 block w-full rounded-lg bg-slate-700 px-1.5 py-1 text-left text-[10px] font-medium whitespace-nowrap text-white"
                    >
                      😴 Log sleep
                    </button>
                    <button
                      onClick={() => {
                        onCreateFeeding(
                          tapPrompt.day,
                          minutesToDate(tapPrompt.day, tapPrompt.minutes),
                        );
                        setTapPrompt(null);
                      }}
                      className="block w-full rounded-lg bg-accent px-1.5 py-1 text-left text-[10px] font-medium whitespace-nowrap text-white"
                    >
                      🍼 Log feeding
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-700" /> Night sleep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-400" /> Nap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-accent" /> Feeding
        </span>
      </div>
    </div>
  );
}
