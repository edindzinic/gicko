"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { addMinutes, parseISO } from "date-fns";
import type { Tables } from "@/lib/database.types";
import {
  formatDuration,
  formatHourLabel,
  minutesSinceMidnight,
  sleepMinutesExcludingWakings,
  splitIntervalByDay,
} from "@/lib/time";
import { feedTypeIcon } from "@/lib/feedingTypes";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type SleepSession = Tables<"sleep_sessions">;
type Feeding = Tables<"feedings">;
type NightWaking = Tables<"night_wakings">;

const HOUR_HEIGHT = 56; // px per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const DRAG_THRESHOLD_PX = 6;
const SNAP_MINUTES = 5;
const FEEDING_MIN_GAP_PX = 24; // min vertical gap before two feeding pills would overlap
const FEEDING_COLUMN_WIDTH_PX = 92;

function topForMinutes(minutes: number) {
  return (minutes / 60) * HOUR_HEIGHT;
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

export type PredictionBand = {
  kind: "awake" | "nap";
  startMinutes: number;
  endMinutes: number;
  /** True on the stretch whose end is bedtime, which gets a marker of its own. */
  endsAtBedtime: boolean;
};

type DragState = {
  pointerId: number;
  rectTop: number;
  originMinutes: number;
  currentMinutes: number;
  moved: boolean;
};

export function DayTimeline({
  day,
  sessions,
  feedings,
  onSelectSession,
  onSelectFeeding,
  onCreateSleep,
  onCreateFeeding,
  isToday = false,
  allowDragCreate = true,
  predictionBands = [],
  nightWakings = [],
  onSelectWaking,
  onCreateWaking,
  tallOnDesktop = false,
}: {
  day: string; // yyyy-MM-dd
  sessions: SleepSession[];
  feedings: Feeding[];
  nightWakings?: NightWaking[];
  onSelectWaking?: (waking: NightWaking) => void;
  /** Provide to offer "log a night waking" in the tap-to-create prompt. */
  onCreateWaking?: (at: Date) => void;
  onSelectSession: (session: SleepSession) => void;
  onSelectFeeding: (feeding: Feeding) => void;
  onCreateSleep: (start: Date, end: Date | null) => void;
  onCreateFeeding: (at: Date) => void;
  isToday?: boolean;
  /** Set false to disable dragging to create a sleep session with a range (tap-to-choose still works). */
  allowDragCreate?: boolean;
  /**
   * The rest of the day as predicted, in order: the stretch in progress first, then every
   * nap and wake window still to come. The last one ends at bedtime.
   */
  predictionBands?: PredictionBand[];
  /**
   * Set when the panel sits beside other content on a wide screen, where it can use the
   * full window height instead of the phone-sized cap.
   */
  tallOnDesktop?: boolean;
}) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [tapPrompt, setTapPrompt] = useState<number | null>(null);

  function minutesToDate(minutes: number) {
    return addMinutes(parseISO(`${day}T00:00:00`), minutes);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = clampMinutes(((e.clientY - rect.top) / DAY_HEIGHT) * 1440);
    e.currentTarget.setPointerCapture(e.pointerId);
    setTapPrompt(null);
    setDrag({ pointerId: e.pointerId, rectTop: rect.top, originMinutes: minutes, currentMinutes: minutes, moved: false });
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const minutes = clampMinutes(((e.clientY - drag.rectTop) / DAY_HEIGHT) * 1440);
    const movedPx = Math.abs(e.clientY - (drag.rectTop + topForMinutes(drag.originMinutes)));
    setDrag({ ...drag, currentMinutes: minutes, moved: drag.moved || movedPx > DRAG_THRESHOLD_PX });
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      if (allowDragCreate) {
        const start = snapMinutes(Math.min(drag.originMinutes, drag.currentMinutes));
        const end = Math.max(snapMinutes(Math.max(drag.originMinutes, drag.currentMinutes)), start + SNAP_MINUTES);
        onCreateSleep(minutesToDate(start), minutesToDate(end));
      }
    } else {
      setTapPrompt(snapMinutes(drag.originMinutes));
    }
    setDrag(null);
  }

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

  const wakingSegments = nightWakings.flatMap((waking) =>
    splitIntervalByDay(waking.started_at, waking.ended_at)
      .filter((seg) => seg.day === day)
      .map((seg) => ({ waking, ...seg })),
  );

  const isEmpty = segments.length === 0 && feedings.length === 0;

  // A prediction can run past midnight; this column only has today to give it.
  const visibleBands = predictionBands
    .map((band) => ({
      ...band,
      start: Math.max(0, band.startMinutes),
      end: Math.min(1440, band.endMinutes),
    }))
    .filter((band) => band.end > band.start);
  const bedtime = predictionBands.find((band) => band.endsAtBedtime)?.endMinutes;
  const bedtimeMinutes = bedtime != null && bedtime <= 1440 ? bedtime : null;

  const feedingColumnBottoms: number[] = [];
  const feedingLayout = [...feedings]
    .sort((a, b) => minutesSinceMidnight(a.occurred_at) - minutesSinceMidnight(b.occurred_at))
    .map((feeding) => {
      const top = topForMinutes(minutesSinceMidnight(feeding.occurred_at));
      let column = feedingColumnBottoms.findIndex((bottom) => top >= bottom);
      if (column === -1) column = feedingColumnBottoms.length;
      feedingColumnBottoms[column] = top + FEEDING_MIN_GAP_PX;
      return { feeding, top, column };
    });

  return (
    <div
      ref={containerRef}
      className={`relative isolate overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-900 ${
        tallOnDesktop ? "max-h-[420px] lg:max-h-[calc(100vh-8rem)]" : "max-h-[420px]"
      }`}
    >
      <div className="flex">
        <div className="relative w-14 shrink-0 bg-neutral-50/50 dark:bg-neutral-950/50" style={{ height: DAY_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400"
              style={{ top: topForMinutes(hour * 60) }}
            >
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>

        <div
          className={`relative flex-1 border-l border-neutral-100 dark:border-neutral-900 ${
            allowDragCreate ? "touch-none" : ""
          }`}
          style={{ height: DAY_HEIGHT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-neutral-100 dark:border-neutral-900"
              style={{ top: topForMinutes(hour * 60) }}
            />
          ))}

          {/* Drawn under everything real: a prediction should never hide what actually
              happened, and a nap logged over a predicted one covers it exactly. */}
          {visibleBands.map((band, i) => {
            const top = topForMinutes(band.start);
            const height = topForMinutes(band.end - band.start);
            if (band.kind === "awake") {
              // Tint only: the naps either side of it draw the boundaries, and a second
              // dashed line right against theirs only made the day look busy.
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute inset-x-0 bg-accent/5"
                  style={{ top, height }}
                />
              );
            }
            return (
              <div
                key={i}
                className="pointer-events-none absolute inset-x-2 overflow-hidden rounded-lg border border-dashed border-slate-400/70 bg-slate-400/10"
                style={{ top, height }}
              >
                {height > 16 && (
                  <span className="block px-1.5 py-0.5 text-[10px] leading-tight font-medium text-slate-500 dark:text-slate-400">
                    🌙 {minuteLabel(Math.round(band.start))}–{minuteLabel(Math.round(band.end))}
                  </span>
                )}
              </div>
            );
          })}

          {bedtimeMinutes != null && (
            <div
              className="pointer-events-none absolute inset-x-0 flex items-center gap-1.5 pr-2"
              style={{ top: topForMinutes(bedtimeMinutes) }}
            >
              <div className="flex-1 border-t border-dashed border-slate-400/70" />
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                🌆 {minuteLabel(Math.round(bedtimeMinutes))}
              </span>
            </div>
          )}

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
                className={`absolute inset-x-2 rounded-lg shadow-sm transition hover:brightness-110 ${
                  session.is_night_sleep ? "bg-slate-700" : "bg-slate-400"
                } ${ongoing ? "ring-2 ring-amber-300" : ""}`}
                style={{ top, height }}
              />
            );
          })}

          {wakingSegments.map(({ waking, startMinutes, endMinutes }, i) => {
            const top = topForMinutes(startMinutes);
            const height = Math.max(topForMinutes(endMinutes - startMinutes), 4);
            const label = `🌙 ${formatDuration(endMinutes - startMinutes)}`;
            return (
              <button
                key={`${waking.id}-${i}`}
                onClick={() => onSelectWaking?.(waking)}
                disabled={!onSelectWaking}
                title={`${t.timelineView.nightWaking} · ${formatDuration(endMinutes - startMinutes)}`}
                className="absolute inset-x-2 z-[5] overflow-hidden rounded-md bg-amber-300 px-2 text-left text-[10px] font-medium whitespace-nowrap text-amber-950 ring-1 ring-amber-500/40"
                style={{ top, height }}
              >
                {height > 12 && label}
              </button>
            );
          })}

          {feedingLayout.map(({ feeding, top, column }) => (
            <button
              key={feeding.id}
              onClick={() => onSelectFeeding(feeding)}
              className="absolute z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10px] font-medium text-white shadow ring-2 ring-white dark:ring-neutral-950"
              style={{ top, right: 4 + column * FEEDING_COLUMN_WIDTH_PX }}
            >
              {feedTypeIcon(feeding.feed_type)}
              {feeding.amount ? ` ${feeding.amount}${feeding.unit}` : ""}
            </button>
          ))}

          {/* Drawn last so neither a waking nor a feeding pill can cover the duration, and
              showing the whole sleep — a night split at midnight reads the same on both days. */}
          {segments.map(({ session, startMinutes, endMinutes }, i) => {
            const height = Math.max(topForMinutes(endMinutes - startMinutes), 22);
            return (
              <div
                key={`${session.id}-label-${i}`}
                className="pointer-events-none absolute left-3 z-20 rounded bg-slate-900/85 px-1.5 py-0.5 leading-tight text-white"
                style={{ top: topForMinutes(startMinutes) + 4 }}
              >
                <span className="text-xs font-medium">
                  {session.is_night_sleep ? `🌆 ${t.timelineView.nightSleep}` : `🌙 ${t.timelineView.nap}`}
                </span>
                {height > 38 && (
                  <div className="text-[10px] opacity-90">
                    {formatDuration(sleepMinutesExcludingWakings(session, nightWakings))}
                  </div>
                )}
              </div>
            );
          })}

          {drag && drag.moved && allowDragCreate && (
            <div
              className="pointer-events-none absolute inset-x-2 z-20 rounded-lg bg-accent/40 px-2 py-1 text-[10px] leading-tight text-white ring-2 ring-accent"
              style={{
                top: topForMinutes(Math.min(drag.originMinutes, drag.currentMinutes)),
                height: Math.max(topForMinutes(Math.abs(drag.currentMinutes - drag.originMinutes)), 22),
              }}
            >
              {minuteLabel(snapMinutes(Math.min(drag.originMinutes, drag.currentMinutes)))}–
              {minuteLabel(snapMinutes(Math.max(drag.originMinutes, drag.currentMinutes)))}
            </div>
          )}

          {tapPrompt !== null && (
            <>
              <div
                className="fixed inset-0 z-30"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setTapPrompt(null);
                }}
              />
              <div
                className="absolute inset-x-2 z-40 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                style={{ top: topForMinutes(tapPrompt) }}
              >
                <p className="mb-1 text-[10px] text-neutral-400">{minuteLabel(tapPrompt)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onCreateSleep(minutesToDate(tapPrompt), null);
                      setTapPrompt(null);
                    }}
                    className="flex-1 rounded-lg bg-slate-700 px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-white"
                  >
                    {t.actions.logSleep}
                  </button>
                  <button
                    onClick={() => {
                      onCreateFeeding(minutesToDate(tapPrompt));
                      setTapPrompt(null);
                    }}
                    className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-white"
                  >
                    {t.actions.logFeeding}
                  </button>
                </div>
                {onCreateWaking && (
                  <button
                    onClick={() => {
                      onCreateWaking(minutesToDate(tapPrompt));
                      setTapPrompt(null);
                    }}
                    className="mt-2 w-full rounded-lg bg-amber-300 px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-amber-950"
                  >
                    {t.actions.logNightWaking}
                  </button>
                )}
              </div>
            </>
          )}

          {isEmpty && (
            <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-neutral-400">
              {t.timelineView.nothingLogged(isToday)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
