"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { formatDuration, formatTime, sessionDurationMinutes } from "@/lib/time";
import { FeedingModal } from "@/components/FeedingModal";
import { SleepEditModal } from "@/components/SleepEditModal";

export function DayDetailPanel({
  day,
  onClose,
}: {
  day: string; // yyyy-MM-dd
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<Tables<"sleep_sessions">[]>([]);
  const [feedings, setFeedings] = useState<Tables<"feedings">[]>([]);
  const [note, setNote] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingSession, setEditingSession] = useState<Tables<"sleep_sessions"> | null>(null);
  const [editingFeeding, setEditingFeeding] = useState<Tables<"feedings"> | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const start = `${day}T00:00:00`;
    const end = `${day}T23:59:59.999`;

    const [{ data: s }, { data: f }, { data: c }] = await Promise.all([
      supabase
        .from("sleep_sessions")
        .select("*")
        .gte("started_at", start)
        .lte("started_at", end)
        .order("started_at", { ascending: true }),
      supabase
        .from("feedings")
        .select("*")
        .gte("occurred_at", start)
        .lte("occurred_at", end)
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

  const timeline = [
    ...sessions.map((s) => ({ type: "sleep" as const, item: s, time: s.started_at })),
    ...feedings.map((f) => ({ type: "feeding" as const, item: f, time: f.occurred_at })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {format(parseISO(`${day}T00:00:00`), "EEEE, MMM d")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <ul className="mb-6 space-y-2">
              {timeline.map((entry) => (
                <li key={`${entry.type}-${entry.item.id}`}>
                  <button
                    onClick={() =>
                      entry.type === "sleep"
                        ? setEditingSession(entry.item)
                        : setEditingFeeding(entry.item)
                    }
                    className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <span className="text-xl">{entry.type === "sleep" ? "🌙" : "🍼"}</span>
                    <div className="flex-1">
                      {entry.type === "sleep" ? (
                        <>
                          <p className="text-sm font-medium">
                            {formatTime(entry.item.started_at)} –{" "}
                            {entry.item.ended_at ? formatTime(entry.item.ended_at) : "now"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDuration(
                              sessionDurationMinutes(entry.item.started_at, entry.item.ended_at),
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium capitalize">
                            {entry.item.feed_type}
                            {entry.item.amount ? ` · ${entry.item.amount}${entry.item.unit}` : ""}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatTime(entry.item.occurred_at)}
                          </p>
                        </>
                      )}
                    </div>
                    <span className="text-slate-300">✎</span>
                  </button>
                </li>
              ))}
              {timeline.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  Nothing logged this day.
                </p>
              )}
            </ul>

            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={3}
              placeholder="Anything worth remembering about this day…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
            />
            {savingNote && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
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
    </div>
  );
}
