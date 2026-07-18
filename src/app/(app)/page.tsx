"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isToday, parseISO, startOfDay, subDays } from "date-fns";
import { Bed, ChevronLeft, ChevronRight, Milk, Moon, PencilLine, Sun, Timer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { DayTimeline } from "@/components/DayTimeline";
import {
  computeDayStats,
  findNightWakeUps,
  formatDuration,
  formatTime,
  isNightTime,
  sessionDurationMinutes,
} from "@/lib/time";
import { feedTypeIcon, type FeedType } from "@/lib/feedingTypes";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;

export default function HomePage() {
  const { t } = useLanguage();
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
  const [solidFoods, setSolidFoods] = useState<Tables<"solid_foods">[]>([]);
  const [showFeedingsBreakdown, setShowFeedingsBreakdown] = useState(false);
  const [showWakeUpsBreakdown, setShowWakeUpsBreakdown] = useState(false);
  const [showNapsBreakdown, setShowNapsBreakdown] = useState(false);

  const viewingToday = isToday(selectedDate);
  const dayKey = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    if (!viewingToday) return;
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [viewingToday]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("solid_foods")
      .select("*")
      .then(({ data }) => setSolidFoods(data ?? []));
  }, []);

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
  const todayNightWakeUps = findNightWakeUps(nightSessions).filter(
    (w) => format(new Date(w.wokeAt), "yyyy-MM-dd") === dayKey,
  );
  const totalMlToday = dayFeedings.reduce((sum, f) => {
    if (f.amount == null) return sum;
    return sum + (f.unit === "oz" ? f.amount * 29.5735 : f.amount);
  }, 0);
  const solidFoodNameById = new Map(solidFoods.map((f) => [f.id, f.name]));
  const sortedDayFeedings = [...dayFeedings].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  const todayNaps = daySessions
    .filter((s) => !s.is_night_sleep)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  if (loading) {
    return <div className="p-6 text-center text-neutral-400">{t.common.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          aria-label={t.home.previousDay}
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {viewingToday ? t.home.today : format(selectedDate, "EEEE, MMM d")}
        </h1>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={viewingToday}
          aria-label={t.home.nextDay}
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
          <p className="text-sm opacity-80">{openSession ? t.home.asleepSince : t.home.awakeSince}</p>
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
                  {openSession ? t.home.asleep : t.home.awake}
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
                {t.home.nightAwakening}
              </button>
            ) : (
              <button
                onClick={endSleep}
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
              >
                {t.home.wokeUp}
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
                {t.home.putBackToSleep}
              </button>
              <button
                onClick={() => setNightAwakeningPending(false)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
              >
                {t.home.wokeUpDoneForNight}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => startSleep(false)}
                className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-amber-800 shadow-sm active:scale-[0.98]"
              >
                {t.home.putDownToSleep}
              </button>
              <button
                onClick={() => startSleep(true)}
                className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
              >
                {t.home.startNightSleep}
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
          {t.home.logAFeeding}
        </button>
      )}

      {/* Day rollup */}
      <div className="mb-6 grid grid-cols-6 gap-3 text-center sm:grid-cols-5">
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Moon className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(nightSleepMinutes)}
          </p>
          <p className="text-xs text-neutral-500">{t.home.statNightSleep}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 sm:col-span-1">
          <Sun className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(dayAwakeMinutes)}
          </p>
          <p className="text-xs text-neutral-500">{t.home.statDaytimeAwake}</p>
        </div>
        <button
          onClick={() => setShowNapsBreakdown(true)}
          className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 sm:col-span-1"
        >
          <Bed className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatDuration(napMinutes)}
          </p>
          <p className="text-xs text-neutral-500">{t.home.statNapsTotal}</p>
        </button>
        <button
          onClick={() => setShowFeedingsBreakdown(true)}
          className="col-span-3 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 sm:col-span-1"
        >
          <Milk className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {dayFeedings.length}
          </p>
          <p className="text-xs text-neutral-500">{t.home.statFeedings}</p>
          {totalMlToday > 0 && (
            <p className="text-[11px] text-neutral-400">{Math.round(totalMlToday)}ml</p>
          )}
        </button>
        <button
          onClick={() => setShowWakeUpsBreakdown(true)}
          className="col-span-3 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 sm:col-span-1"
        >
          <Timer className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {todayNightWakeUps.length}
          </p>
          <p className="text-xs text-neutral-500">{t.home.statNightWakeUps}</p>
        </button>
      </div>

      {/* Timeline */}
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">{t.home.timeline}</h2>
      <DayTimeline
        day={dayKey}
        sessions={daySessions}
        feedings={dayFeedings}
        isToday={viewingToday}
        onSelectSession={setEditingSession}
        onSelectFeeding={setEditingFeeding}
        onCreateSleep={(start, end) => setCreatingSleep({ start, end })}
        onCreateFeeding={(at) => setCreatingFeeding({ at })}
        allowDragCreate={false}
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

      {showFeedingsBreakdown && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowFeedingsBreakdown(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {t.home.feedingsToday}
              </h2>
              <button
                onClick={() => setShowFeedingsBreakdown(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {sortedDayFeedings.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t.home.noFeedingsToday}</p>
            ) : (
              <ul className="space-y-2">
                {sortedDayFeedings.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        setShowFeedingsBreakdown(false);
                        setEditingFeeding(f);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-left dark:border-neutral-800"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{feedTypeIcon(f.feed_type)}</span>
                        <span>
                          <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            {formatTime(f.occurred_at)}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {t.feedTypes[f.feed_type as FeedType]}
                            {f.feed_type === "solid" && f.solid_food_id && solidFoodNameById.get(f.solid_food_id)
                              ? ` · ${solidFoodNameById.get(f.solid_food_id)}`
                              : ""}
                          </span>
                        </span>
                      </span>
                      {f.amount != null && (
                        <span className="text-sm text-neutral-600 dark:text-neutral-300">
                          {f.amount}
                          {f.unit}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showWakeUpsBreakdown && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowWakeUpsBreakdown(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {t.home.wakeUpsToday}
              </h2>
              <button
                onClick={() => setShowWakeUpsBreakdown(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {todayNightWakeUps.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t.home.noWakeUpsToday}</p>
            ) : (
              <ul className="space-y-2">
                {todayNightWakeUps.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800"
                  >
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {formatTime(w.wokeAt)} – {formatTime(w.backAsleepAt)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t.home.awakeFor(formatDuration(w.awakeMinutes))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showNapsBreakdown && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowNapsBreakdown(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {t.home.napsToday}
              </h2>
              <button
                onClick={() => setShowNapsBreakdown(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {todayNaps.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t.home.noNapsToday}</p>
            ) : (
              <ul className="space-y-2">
                {todayNaps.map((nap) => (
                  <li key={nap.id}>
                    <button
                      onClick={() => {
                        setShowNapsBreakdown(false);
                        setEditingSession(nap);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-left dark:border-neutral-800"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">🛏️</span>
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {formatTime(nap.started_at)}
                          {nap.ended_at ? ` – ${formatTime(nap.ended_at)}` : ` – ${t.home.ongoing}`}
                        </span>
                      </span>
                      <span className="text-sm text-neutral-600 dark:text-neutral-300">
                        {formatDuration(sessionDurationMinutes(nap.started_at, nap.ended_at))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {wakePrompt && (
        <div className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-xl bg-neutral-900 p-4 text-white shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <span className="text-sm">{t.home.wakePromptQuestion}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setWakePrompt(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300"
            >
              {t.common.no}
            </button>
            <button
              onClick={() => {
                setFeedingModalSleepId(wakePrompt);
                setWakePrompt(null);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              {t.home.logIt}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
