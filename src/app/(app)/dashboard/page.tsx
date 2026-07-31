"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, eachDayOfInterval, endOfDay, format, isToday, parseISO, startOfDay, subDays } from "date-fns";
import { Bed, Droplet, GlassWater, Hash, Hourglass, Milk, Moon, Sun, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { TrendlineChart, type TrendPoint } from "@/components/TrendlineChart";
import {
  collectNightWakeUps,
  computeDayStats,
  formatDuration,
  nightAttributionDay,
} from "@/lib/time";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;
type PumpingSession = Tables<"pumping_sessions">;

function toInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

const formatCount = (v: number) => v.toFixed(1);

export default function DashboardPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(toInputValue(subDays(new Date(), 13)));
  const [to, setTo] = useState(toInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [isMom, setIsMom] = useState(false);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [nightSessions, setNightSessions] = useState<SleepSession[]>([]);
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [pumping, setPumping] = useState<PumpingSession[]>([]);
  const [nightWakings, setNightWakings] = useState<Tables<"night_wakings">[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_mom")
        .eq("id", user.id)
        .single();
      setIsMom(profile?.is_mom ?? false);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const rangeStart = startOfDay(parseISO(from));
    const rangeEnd = endOfDay(parseISO(to));
    const bufferedStart = addDays(rangeStart, -1).toISOString();
    const bufferedEnd = addDays(rangeEnd, 1).toISOString();

    const [{ data: s }, { data: nights }, { data: f }, { data: p }, { data: wakings }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .lte("started_at", bufferedEnd)
        .or(`ended_at.gte.${bufferedStart},ended_at.is.null`),
      // Fetched unscoped so wake-up chains aren't cut off at the range edges.
      supabase.from("sleep_sessions").select("*").eq("is_night_sleep", true),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", rangeStart.toISOString())
        .lte("occurred_at", rangeEnd.toISOString()),
      supabase
        .from("pumping_sessions")
        .select("*")
        .gte("occurred_at", rangeStart.toISOString())
        .lte("occurred_at", rangeEnd.toISOString()),
      supabase
        .from("night_wakings")
        .select("*")
        .gte("started_at", bufferedStart)
        .lte("started_at", bufferedEnd),
    ]);

    setSessions(s ?? []);
    setNightSessions(nights ?? []);
    setFeedings(f ?? []);
    setPumping(p ?? []);
    setNightWakings(wakings ?? []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the date range changes
    load();
  }, [load]);

  const days = parseISO(from) <= parseISO(to) ? eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }) : [];
  const nightWakeUps = collectNightWakeUps(nightWakings);

  const nightSleepPoints: TrendPoint[] = [];
  const dayAwakePoints: TrendPoint[] = [];
  const napMinutesPoints: TrendPoint[] = [];
  const napCountPoints: TrendPoint[] = [];
  const wakeUpPoints: TrendPoint[] = [];
  const wakeUpLengthPoints: TrendPoint[] = [];
  const feedingPoints: TrendPoint[] = [];
  const feedingMlPoints: TrendPoint[] = [];
  const pumpingPoints: TrendPoint[] = [];

  for (const day of days) {
    const dayKey = format(day, "yyyy-MM-dd");
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const daySessions = sessions.filter((sess) => {
      const start = parseISO(sess.started_at);
      if (start > dayEnd) return false;
      return sess.ended_at ? parseISO(sess.ended_at) >= dayStart : true;
    });
    const asOf = isToday(day) ? new Date() : dayEnd;
    const { nightSleepMinutes, dayAwakeMinutes, napMinutes } = computeDayStats(
      dayKey,
      nightSessions,
      daySessions,
      asOf,
      nightWakings,
    );
    const napCount = daySessions.filter(
      (sess) => !sess.is_night_sleep && format(parseISO(sess.started_at), "yyyy-MM-dd") === dayKey,
    ).length;
    const dayWakeUpList = nightWakeUps.filter((w) => nightAttributionDay(w.wokeAt) === dayKey);
    const dayWakeUps = dayWakeUpList.length;
    const dayWakeUpAvgMinutes = dayWakeUps
      ? dayWakeUpList.reduce((sum, w) => sum + w.awakeMinutes, 0) / dayWakeUps
      : 0;
    const dayFeedings = feedings.filter(
      (feeding) => format(parseISO(feeding.occurred_at), "yyyy-MM-dd") === dayKey,
    );
    const dayFeedingsCount = dayFeedings.length;
    const dayFeedingMl = dayFeedings.reduce((sum, feeding) => {
      if (feeding.amount == null) return sum;
      return sum + (feeding.unit === "oz" ? feeding.amount * 29.5735 : feeding.amount);
    }, 0);
    const dayPumpingMl = pumping
      .filter((session) => format(parseISO(session.occurred_at), "yyyy-MM-dd") === dayKey)
      .reduce((sum, session) => sum + session.amount_ml, 0);

    nightSleepPoints.push({ day: dayKey, value: nightSleepMinutes });
    dayAwakePoints.push({ day: dayKey, value: dayAwakeMinutes });
    napMinutesPoints.push({ day: dayKey, value: napMinutes });
    napCountPoints.push({ day: dayKey, value: napCount });
    wakeUpPoints.push({ day: dayKey, value: dayWakeUps });
    wakeUpLengthPoints.push({ day: dayKey, value: dayWakeUpAvgMinutes });
    feedingPoints.push({ day: dayKey, value: dayFeedingsCount });
    feedingMlPoints.push({ day: dayKey, value: dayFeedingMl });
    pumpingPoints.push({ day: dayKey, value: dayPumpingMl });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {t.dashboard.title}
      </h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t.settings.from}
          </label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t.settings.to}
          </label>
          <input
            type="date"
            value={to}
            min={from}
            max={toInputValue(new Date())}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-neutral-400">{t.common.loading}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TrendlineChart
            icon={Moon}
            title={t.home.statNightSleep}
            points={nightSleepPoints}
            formatValue={formatDuration}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={Sun}
            title={t.home.statDaytimeAwake}
            points={dayAwakePoints}
            formatValue={formatDuration}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={Bed}
            title={t.home.statNapsTotal}
            points={napMinutesPoints}
            formatValue={formatDuration}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={Hash}
            title={t.dashboard.napsCount}
            points={napCountPoints}
            formatValue={formatCount}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={Timer}
            title={t.home.statNightWakeUps}
            points={wakeUpPoints}
            formatValue={formatCount}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={Hourglass}
            title={t.dashboard.wakeUpLength}
            points={wakeUpLengthPoints}
            formatValue={formatDuration}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
            averageMode="nonZero"
          />
          <TrendlineChart
            icon={Milk}
            title={t.home.statFeedings}
            points={feedingPoints}
            formatValue={formatCount}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          <TrendlineChart
            icon={GlassWater}
            title={t.dashboard.feedingsMl}
            points={feedingMlPoints}
            formatValue={(v) => `${Math.round(v)}ml`}
            averageLabel={t.dashboard.average}
            noDataLabel={t.dashboard.noData}
          />
          {isMom && (
            <TrendlineChart
              icon={Droplet}
              title={t.home.statPumping}
              points={pumpingPoints}
              formatValue={(v) => `${Math.round(v)}ml`}
              averageLabel={t.dashboard.average}
              noDataLabel={t.dashboard.noData}
            />
          )}
        </div>
      )}
    </div>
  );
}
