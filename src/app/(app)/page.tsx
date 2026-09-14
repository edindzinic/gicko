"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isToday, parseISO, startOfDay, subDays } from "date-fns";
import { Bed, ChevronLeft, ChevronRight, Milk, Moon, PencilLine, Sun, Timer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { NightWakingModal } from "@/components/NightWakingModal";
import { DayTimeline } from "@/components/DayTimeline";
import {
  collectNightWakeUps,
  computeDayStats,
  formatDuration,
  formatTime,
  nightAttributionDay,
  sessionDurationMinutes,
} from "@/lib/time";
import { completedAwakeHours, completedNapHours } from "@/lib/dayBudget";
import { forecastRestOfDay } from "@/lib/dayForecast";
import { feedTypeIcon, type FeedType } from "@/lib/feedingTypes";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;
type NightWaking = Tables<"night_wakings">;

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
  const [nightWakings, setNightWakings] = useState<NightWaking[]>([]);
  const [editingWaking, setEditingWaking] = useState<NightWaking | null>(null);
  const [creatingWaking, setCreatingWaking] = useState<{
    start: Date;
    end: Date | null;
    sleepSessionId: string | null;
  } | null>(null);
  const [editingSession, setEditingSession] = useState<SleepSession | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Feeding | null>(null);
  const [creatingSleep, setCreatingSleep] = useState<{ start: Date; end: Date | null } | null>(
    null,
  );
  const [creatingFeeding, setCreatingFeeding] = useState<{ at: Date } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [solidFoods, setSolidFoods] = useState<Tables<"solid_foods">[]>([]);
  const [wakeWindows, setWakeWindows] = useState<Tables<"wake_windows">[]>([]);
  const [napDurations, setNapDurations] = useState<Tables<"nap_durations">[]>([]);
  const [showFeedingsBreakdown, setShowFeedingsBreakdown] = useState(false);
  const [showWakeUpsBreakdown, setShowWakeUpsBreakdown] = useState(false);
  const [showNapsBreakdown, setShowNapsBreakdown] = useState(false);
  const [poops, setPoops] = useState<Tables<"poops">[]>([]);
  const [showPoopsBreakdown, setShowPoopsBreakdown] = useState(false);

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

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("wake_windows")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => setWakeWindows(data ?? []));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("nap_durations")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => setNapDurations(data ?? []));
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd = endOfDay(selectedDate).toISOString();

    // A night's wakings can sit either side of midnight, so reach back a day to cover
    // the whole night that this calendar day's stats are attributed to.
    const wakingsFrom = subDays(startOfDay(selectedDate), 1).toISOString();

    const [
      { data: open },
      { data: sessions },
      { data: feedings },
      { data: nights },
      { data: wakings },
      { data: poopRows },
    ] = await Promise.all([
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
        supabase
          .from("night_wakings")
          .select("*")
          .gte("started_at", wakingsFrom)
          .lte("started_at", dayEnd)
          .order("started_at", { ascending: false }),
        // Poops carry a day rather than a time, so this one needs no window around midnight.
        supabase
          .from("poops")
          .select("*")
          .eq("day", format(selectedDate, "yyyy-MM-dd"))
          .order("created_at", { ascending: true }),
      ]);

    setOpenSession(open ?? null);
    setDaySessions(sessions ?? []);
    setDayFeedings(feedings ?? []);
    setNightSessions(nights ?? []);
    setNightWakings(wakings ?? []);
    setPoops(poopRows ?? []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when selected day changes
    load();
  }, [load]);

  useAutoRefresh(load);

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
    await supabase
      .from("sleep_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", openSession.id);
    load();
  }

  async function logPoop() {
    const supabase = createClient();
    await supabase.from("poops").insert({ day: dayKey });
    load();
  }

  /** Undoes a mis-tap: the day holds a count, so it's the newest one that goes. */
  async function removeLastPoop() {
    const last = poops[poops.length - 1];
    if (!last) return;
    const supabase = createClient();
    await supabase.from("poops").delete().eq("id", last.id);
    load();
  }

  /** Ends the night for good. */
  async function morningWakeUp() {
    if (!openSession) return;
    const supabase = createClient();
    await supabase
      .from("sleep_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", openSession.id);
    load();
  }

  const { nightSleepMinutes, dayAwakeMinutes, napMinutes, morningWake } = computeDayStats(
    dayKey,
    nightSessions,
    daySessions,
    viewingToday ? new Date() : endOfDay(selectedDate),
    nightWakings,
  );
  const todayNightWakeUps = collectNightWakeUps(nightWakings).filter(
    (w) => nightAttributionDay(w.wokeAt) === dayKey,
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

  const lastEndedSession = daySessions.find((s) => s.ended_at);
  const statusSession = openSession ?? lastEndedSession ?? null;
  const statusTime = openSession ? openSession.started_at : (lastEndedSession?.ended_at ?? null);

  // Wake windows and nap lengths are budgets for the day rather than rows of independent
  // timers, so both are measured against how the day has actually gone so far.
  const awakeSoFarHours = morningWake
    ? completedAwakeHours(morningWake.getTime(), daySessions)
    : [];
  const napsSoFarHours = morningWake ? completedNapHours(morningWake.getTime(), daySessions) : [];
  const completedNapsSinceWake = awakeSoFarHours.length;
  const isLastWakeWindow = wakeWindows.length > 0 && completedNapsSinceWake >= wakeWindows.length - 1;

  // The whole rest of the day, projected: the stretch he's on, then each nap and window
  // still to come, through to bedtime. Night sleep is left out — there's nothing after it
  // to predict until the morning. The status card reads the first of these, so the time it
  // counts down to and the band on the timeline are always the same prediction.
  const forecast =
    statusTime && !openSession?.is_night_sleep
      ? forecastRestOfDay({
          anchorMs: parseISO(statusTime).getTime(),
          asleep: openSession != null,
          wakeWindowPlan: wakeWindows.map((w) => w.hours),
          napPlan: napDurations.map((n) => n.hours),
          awakeSoFar: awakeSoFarHours,
          napsSoFar: napsSoFarHours,
        })
      : [];

  const currentStretch = forecast[0];
  const predictedAt = currentStretch ? new Date(currentStretch.endMs) : null;
  const predictedLabel =
    currentStretch?.kind === "nap"
      ? t.home.expectedWakeUp
      : currentStretch?.endsAtBedtime
        ? t.home.nextBedtime
        : t.home.nextNap;
  const predictedTotalMinutes = currentStretch
    ? (currentStretch.endMs - currentStretch.startMs) / 60000
    : null;

  // The prediction is only ever about the day in progress, so an earlier day shows none.
  const dayStartMs = startOfDay(selectedDate).getTime();
  const predictionBands = viewingToday
    ? forecast.map((segment) => ({
        kind: segment.kind,
        endsAtBedtime: segment.endsAtBedtime,
        startMinutes: (segment.startMs - dayStartMs) / 60000,
        endMinutes: (segment.endMs - dayStartMs) / 60000,
      }))
    : [];
  const elapsedMinutes = statusTime
    ? Math.max(0, differenceInMinutes(now, parseISO(statusTime)))
    : 0;
  const progressPct = predictedTotalMinutes
    ? Math.min(100, (elapsedMinutes / predictedTotalMinutes) * 100)
    : 0;
  const overdue = predictedTotalMinutes != null && elapsedMinutes > predictedTotalMinutes;

  if (loading) {
    return <div className="p-6 text-center text-neutral-400">{t.common.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10 lg:max-w-5xl">
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div>
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
              {statusSession && statusTime && predictedAt ? (
                <>
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="text-left">
                      <p className="text-xs opacity-80">
                        {openSession ? t.home.asleepSince : t.home.awakeSince}
                      </p>
                      <button
                        onClick={() => setEditingSession(statusSession)}
                        className="flex items-center gap-1 text-4xl font-semibold tracking-tight"
                      >
                        {formatTime(statusTime)}
                        <PencilLine className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-80">{predictedLabel}</p>
                      <p className="text-4xl font-semibold tracking-tight">
                        {format(predictedAt, "HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-white/25">
                    <div
                      className={`h-full rounded-full transition-all ${overdue ? "bg-rose-500" : "bg-white"}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p
                    className={`mb-4 text-sm font-semibold ${overdue ? "text-rose-600" : "font-medium opacity-90"}`}
                  >
                    {formatDuration(elapsedMinutes)} {openSession ? t.home.asleep : t.home.awake}
                  </p>
                </>
              ) : statusSession && statusTime ? (
                <>
                  <p className="text-sm opacity-80">{openSession ? t.home.asleepSince : t.home.awakeSince}</p>
                  <button
                    onClick={() => setEditingSession(statusSession)}
                    className="mb-1 flex w-full items-center justify-center gap-2 text-4xl font-semibold tracking-tight"
                  >
                    {formatTime(statusTime)}
                    <PencilLine className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                  </button>
                  <p className="mb-4 text-sm font-medium opacity-90">
                    {formatDuration(elapsedMinutes)} {openSession ? t.home.asleep : t.home.awake}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm opacity-80">{openSession ? t.home.asleepSince : t.home.awakeSince}</p>
                  <p className="mb-4 text-4xl font-semibold">—</p>
                </>
              )}

              {openSession ? (
                openSession.is_night_sleep ? (
                  <>
                    <button
                      onClick={() =>
                        setCreatingWaking({
                          start: new Date(),
                          end: new Date(),
                          sleepSessionId: openSession.id,
                        })
                      }
                      className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
                    >
                      {t.home.nightAwakening}
                    </button>
                    <button
                      onClick={morningWakeUp}
                      className="mt-2 w-full rounded-xl border border-white/60 bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      {t.home.morningWake}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={endSleep}
                    className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-neutral-800 shadow-sm active:scale-[0.98]"
                  >
                    {t.home.wokeUp}
                  </button>
                )
              ) : (
                <button
                  onClick={() => startSleep(isLastWakeWindow)}
                  className="w-full rounded-xl bg-white/95 py-3 text-base font-semibold text-amber-800 shadow-sm active:scale-[0.98]"
                >
                  {t.home.putDownToSleep}
                </button>
              )}
            </div>
          )}

          {/* A feeding is logged at the moment it happens, so that button is today's only.
              A poop is only ever a tally against a day, so it works on whichever day is open. */}
          <div className="mb-3 flex gap-3">
            {viewingToday && (
              <button
                onClick={() => setFeedingModalSleepId(null)}
                className="flex-1 rounded-xl border-2 border-accent py-4 text-lg font-semibold text-accent active:scale-[0.98]"
              >
                {t.home.logAFeeding}
              </button>
            )}
            <button
              onClick={logPoop}
              className="flex-1 rounded-xl border-2 border-amber-700/60 py-4 text-lg font-semibold text-amber-800 active:scale-[0.98] dark:border-amber-600/60 dark:text-amber-500"
            >
              {t.home.logAPoop}
            </button>
          </div>

          {/* Day rollup */}
          {/* Two rows of three. A single row leaves each card too narrow for the values it
              has to hold — a night's sleep, or a day's millilitres. */}
          <div className="mb-6 grid grid-cols-6 gap-3 text-center">
            <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <Moon className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {formatDuration(nightSleepMinutes)}
              </p>
              <p className="text-xs text-neutral-500">{t.home.statNightSleep}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <Sun className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {formatDuration(dayAwakeMinutes)}
              </p>
              <p className="text-xs text-neutral-500">{t.home.statDaytimeAwake}</p>
            </div>
            <button
              onClick={() => setShowFeedingsBreakdown(true)}
              className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            >
              <Milk className="mx-auto mb-1 h-4 w-4 text-accent" strokeWidth={1.75} />
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {Math.round(totalMlToday)}ml
              </p>
              <p className="text-xs text-neutral-500">{t.home.statEaten}</p>
            </button>
            <button
              onClick={() => setShowWakeUpsBreakdown(true)}
              className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            >
              <Timer className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {todayNightWakeUps.length}
              </p>
              <p className="text-xs text-neutral-500">{t.home.statNightWakeUps}</p>
            </button>
            <button
              onClick={() => setShowNapsBreakdown(true)}
              className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            >
              <Bed className="mx-auto mb-1 h-4 w-4 text-neutral-400" strokeWidth={1.75} />
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {formatDuration(napMinutes)}
              </p>
              <p className="text-xs text-neutral-500">{t.home.statNapsTotal}</p>
            </button>
            <button
              onClick={() => setShowPoopsBreakdown(true)}
              className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            >
              <span className="mb-1 block h-4 text-sm leading-4">💩</span>
              <p className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {poops.length}
              </p>
              <p className="text-xs text-neutral-500">{t.home.statPoops}</p>
            </button>
          </div>
        </div>

        {/* Beside the controls on a wide screen, under them on a phone. */}
        <div className="lg:sticky lg:top-10">
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
            predictionBands={predictionBands}
            nightWakings={nightWakings}
            onSelectWaking={setEditingWaking}
            onCreateWaking={(at) => setCreatingWaking({ start: at, end: null, sleepSessionId: null })}
            tallOnDesktop
          />
        </div>
      </div>

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

      {editingWaking && (
        <NightWakingModal
          waking={editingWaking}
          onClose={() => setEditingWaking(null)}
          onSaved={() => {
            setEditingWaking(null);
            load();
          }}
        />
      )}

      {creatingWaking && (
        <NightWakingModal
          defaultStart={creatingWaking.start}
          defaultEnd={creatingWaking.end}
          sleepSessionId={creatingWaking.sleepSessionId}
          onClose={() => setCreatingWaking(null)}
          onSaved={() => {
            // Logging a waking from the night card is the moment the old "back to sleep"
            // button used to ask about a feeding, so the prompt still follows it.
            setWakePrompt(creatingWaking.sleepSessionId);
            setCreatingWaking(null);
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
                {todayNightWakeUps.map((w) => {
                  const waking = nightWakings.find((row) => row.id === w.id);
                  if (!waking) return null;
                  return (
                    <li key={w.id}>
                      <button
                        onClick={() => {
                          setShowWakeUpsBreakdown(false);
                          setEditingWaking(waking);
                        }}
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-left dark:border-neutral-800"
                      >
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {formatTime(w.wokeAt)} –{" "}
                          {w.backAsleepAt ? formatTime(w.backAsleepAt) : t.home.ongoing}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {t.home.awakeFor(formatDuration(w.awakeMinutes))}
                        </p>
                      </button>
                    </li>
                  );
                })}
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

      {showPoopsBreakdown && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowPoopsBreakdown(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {t.home.poopsToday}
              </h2>
              <button
                onClick={() => setShowPoopsBreakdown(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* Nothing is recorded about a poop but the day it fell on, so there's no list
                to show — just the tally, and the two ways to correct it. */}
            {poops.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t.home.noPoopsToday}</p>
            ) : (
              <p className="py-6 text-center text-5xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                💩 {poops.length}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={removeLastPoop}
                disabled={poops.length === 0}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600 disabled:opacity-40 dark:border-neutral-800 dark:text-neutral-300"
              >
                − {t.home.removePoop}
              </button>
              <button
                onClick={logPoop}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
              >
                + {t.home.addPoop}
              </button>
            </div>
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
