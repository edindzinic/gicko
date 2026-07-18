"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { DayDetailPanel } from "@/components/DayDetailPanel";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { WeekView } from "@/components/WeekView";
import { findNightWakeUpEndTimes, formatDuration, sessionDurationMinutes } from "@/lib/time";
import { FEED_TYPE_ICONS } from "@/lib/feedingTypes";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const MOBILE_VISIBLE_DAYS = 3;
const DESKTOP_VISIBLE_DAYS = 7;

type DayStats = {
  sleepMinutes: number;
  feedingCount: number;
  solidCount: number;
  nightWakeUps: number;
};

export default function CalendarPage() {
  const { t } = useLanguage();
  const [view, setView] = useState<"month" | "week">("week");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // Mobile shows today as the last of the 3 visible days, so start 2 days back.
  const [daysViewStart, setDaysViewStart] = useState(() =>
    subDays(startOfDay(new Date()), MOBILE_VISIBLE_DAYS - 1),
  );
  const [sessions, setSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [feedings, setFeedings] = useState<Tables<"feedings">[]>([]);
  const [nightSessions, setNightSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<Tables<"sleep_sessions"> | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Tables<"feedings"> | null>(null);
  const [creatingSleep, setCreatingSleep] = useState<{ start: Date; end: Date | null } | null>(
    null,
  );
  const [creatingFeeding, setCreatingFeeding] = useState<{ at: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);
  // Matches Tailwind's `sm` breakpoint, used elsewhere in this app for mobile/desktop layout switches.
  const [isDesktop, setIsDesktop] = useState(false);
  const visibleDays = isDesktop ? DESKTOP_VISIBLE_DAYS : MOBILE_VISIBLE_DAYS;

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    if (mql.matches) {
      // Correct the initial default (assumed mobile, for SSR) in one shot, aligning
      // to the Monday-started week rather than leaving the "today" mobile default.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time correction of the SSR-safe default, not a later navigation reset
      setIsDesktop(true);
      setDaysViewStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    }
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
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
      const stat =
        map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, solidCount: 0, nightWakeUps: 0 };
      stat.sleepMinutes += sessionDurationMinutes(s.started_at, s.ended_at);
      map.set(key, stat);
    }
    for (const f of feedings) {
      const key = format(new Date(f.occurred_at), "yyyy-MM-dd");
      const stat =
        map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, solidCount: 0, nightWakeUps: 0 };
      if (f.feed_type === "solid") {
        stat.solidCount += 1;
      } else {
        stat.feedingCount += 1;
      }
      map.set(key, stat);
    }
    for (const wakeUpEnd of findNightWakeUpEndTimes(nightSessions)) {
      const key = format(new Date(wakeUpEnd), "yyyy-MM-dd");
      const stat =
        map.get(key) ?? { sleepMinutes: 0, feedingCount: 0, solidCount: 0, nightWakeUps: 0 };
      stat.nightWakeUps += 1;
      map.set(key, stat);
    }
    return map;
  }, [sessions, feedings, nightSessions]);

  function refreshAfterEdit() {
    setEditingSession(null);
    setEditingFeeding(null);
    setCreatingSleep(null);
    setCreatingFeeding(null);
    load();
    setWeekRefreshKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {view === "month"
            ? format(month, "MMMM yyyy")
            : `${format(daysViewStart, "MMM d")} – ${format(addDays(daysViewStart, visibleDays - 1), "MMM d")}`}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-2xl border border-neutral-200 p-0.5 text-sm dark:border-neutral-800">
            <button
              onClick={() => setView("month")}
              className={`rounded-xl px-3 py-1 ${
                view === "month" ? "bg-accent text-white" : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {t.calendar.month}
            </button>
            <button
              onClick={() => setView("week")}
              className={`rounded-xl px-3 py-1 ${
                view === "week" ? "bg-accent text-white" : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {t.calendar.week}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                view === "month"
                  ? setMonth((m) => subMonths(m, 1))
                  : setDaysViewStart((d) => subDays(d, visibleDays))
              }
              aria-label={t.common.previous}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              onClick={() =>
                view === "month"
                  ? setMonth(startOfMonth(new Date()))
                  : setDaysViewStart(
                      isDesktop
                        ? startOfWeek(new Date(), { weekStartsOn: 1 })
                        : subDays(startOfDay(new Date()), MOBILE_VISIBLE_DAYS - 1),
                    )
              }
              className="rounded-2xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
            >
              {t.common.today}
            </button>
            <button
              onClick={() =>
                view === "month"
                  ? setMonth((m) => addMonths(m, 1))
                  : setDaysViewStart((d) => addDays(d, visibleDays))
              }
              aria-label={t.common.next}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-400 sm:gap-2">
            {t.calendar.weekdayLetters.map((d, i) => (
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
                      ? "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                      : "border-transparent bg-neutral-50 text-neutral-300 dark:bg-black"
                  } ${isToday(day) ? "ring-2 ring-accent" : ""}`}
                >
                  <span className="text-xs font-medium">{format(day, "d")}</span>
                  {stat && (
                    <div className="mt-auto space-y-0.5 text-[10px] leading-tight text-neutral-500 sm:text-xs">
                      {stat.sleepMinutes > 0 && <p>😴 {formatDuration(stat.sleepMinutes)}</p>}
                      {stat.feedingCount > 0 && <p>{FEED_TYPE_ICONS.bottle} ×{stat.feedingCount}</p>}
                      {stat.solidCount > 0 && <p>{FEED_TYPE_ICONS.solid} ×{stat.solidCount}</p>}
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
          startDate={daysViewStart}
          visibleDays={visibleDays}
          onSelectDay={setSelectedDay}
          onSelectSession={setEditingSession}
          onSelectFeeding={setEditingFeeding}
          onCreateSleep={(_day, start, end) => setCreatingSleep({ start, end })}
          onCreateFeeding={(_day, at) => setCreatingFeeding({ at })}
        />
      )}

      {selectedDay && (
        <DayDetailPanel
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
          onEventsChanged={() => {
            load();
            setWeekRefreshKey((k) => k + 1);
          }}
        />
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

      {creatingSleep && (
        <SleepEditModal
          defaultStart={creatingSleep.start}
          defaultEnd={creatingSleep.end ?? undefined}
          onClose={() => setCreatingSleep(null)}
          onSaved={refreshAfterEdit}
        />
      )}

      {creatingFeeding && (
        <FeedingModal
          defaultDateTime={creatingFeeding.at}
          onClose={() => setCreatingFeeding(null)}
          onSaved={refreshAfterEdit}
        />
      )}
    </div>
  );
}
