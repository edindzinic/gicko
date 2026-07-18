"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, format, isToday as isTodayFn, parseISO, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";
import { DayTimeline } from "@/components/DayTimeline";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function DayDetailPanel({
  day,
  onClose,
  onEventsChanged,
}: {
  day: string; // yyyy-MM-dd
  onClose: () => void;
  onEventsChanged?: () => void;
}) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [feedings, setFeedings] = useState<Tables<"feedings">[]>([]);
  const [note, setNote] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingSession, setEditingSession] = useState<Tables<"sleep_sessions"> | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Tables<"feedings"> | null>(null);
  const [addingSleep, setAddingSleep] = useState<{ start?: Date; end?: Date } | null>(null);
  const [addingFeeding, setAddingFeeding] = useState<{ at?: Date } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const dayDate = parseISO(`${day}T00:00:00`);
    const dayStart = startOfDay(dayDate).toISOString();
    const dayEnd = addDays(startOfDay(dayDate), 1).toISOString();

    const [{ data: s }, { data: f }, { data: c }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .lte("started_at", dayEnd)
        .or(`ended_at.gte.${dayStart},ended_at.is.null`)
        .order("started_at", { ascending: true }),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd)
        .order("occurred_at", { ascending: true }),
      supabase.from("day_comments").select("*").eq("day", day).maybeSingle(),
    ]);

    setSessions(s ?? []);
    setFeedings(f ?? []);
    setNote(c?.body ?? "");
    setNoteId(c?.id ?? null);
    setLoading(false);
  }, [day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/day change
    load();
  }, [load]);

  async function saveNote() {
    setSavingNote(true);
    const supabase = createClient();

    if (noteId) {
      await supabase.from("day_comments").update({ body: note }).eq("id", noteId);
    } else if (note.trim()) {
      const { data } = await supabase
        .from("day_comments")
        .insert({ day, body: note })
        .select()
        .single();
      if (data) setNoteId(data.id);
    }
    setSavingNote(false);
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {format(parseISO(`${day}T00:00:00`), "EEEE, MMM d")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">{t.common.loading}</p>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setAddingSleep({})}
                className="flex-1 rounded-xl border-2 border-accent py-2.5 text-sm font-semibold text-accent active:scale-[0.98]"
              >
                {t.actions.logSleep}
              </button>
              <button
                onClick={() => setAddingFeeding({})}
                className="flex-1 rounded-xl border-2 border-accent py-2.5 text-sm font-semibold text-accent active:scale-[0.98]"
              >
                {t.actions.logFeeding}
              </button>
            </div>

            <div className="mb-6">
              <DayTimeline
                day={day}
                sessions={sessions}
                feedings={feedings}
                isToday={isTodayFn(parseISO(`${day}T00:00:00`))}
                onSelectSession={setEditingSession}
                onSelectFeeding={setEditingFeeding}
                onCreateSleep={(start, end) => setAddingSleep({ start, end: end ?? undefined })}
                onCreateFeeding={(at) => setAddingFeeding({ at })}
              />
            </div>

            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t.dayDetail.note}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={3}
              placeholder={t.dayDetail.notePlaceholder}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
            {savingNote && <p className="mt-1 text-xs text-neutral-400">{t.common.saving}</p>}
          </>
        )}
      </div>

      {editingSession && (
        <SleepEditModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            setEditingSession(null);
            load();
            onEventsChanged?.();
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
            onEventsChanged?.();
          }}
        />
      )}

      {addingSleep && (
        <SleepEditModal
          defaultDate={parseISO(`${day}T00:00:00`)}
          defaultStart={addingSleep.start}
          defaultEnd={addingSleep.end}
          onClose={() => setAddingSleep(null)}
          onSaved={() => {
            setAddingSleep(null);
            load();
            onEventsChanged?.();
          }}
        />
      )}

      {addingFeeding && (
        <FeedingModal
          defaultDate={parseISO(`${day}T00:00:00`)}
          defaultDateTime={addingFeeding.at}
          onClose={() => setAddingFeeding(null)}
          onSaved={() => {
            setAddingFeeding(null);
            load();
            onEventsChanged?.();
          }}
        />
      )}
    </div>
  );
}
