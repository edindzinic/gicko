"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/time";

export function SleepEditModal({
  session,
  onClose,
  onSaved,
}: {
  session: Tables<"sleep_sessions">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startedDate, setStartedDate] = useState(() => toDateInputValue(session.started_at));
  const [startedTime, setStartedTime] = useState(() => toTimeInputValue(session.started_at));
  const [endedDate, setEndedDate] = useState(() =>
    session.ended_at ? toDateInputValue(session.ended_at) : "",
  );
  const [endedTime, setEndedTime] = useState(() =>
    session.ended_at ? toTimeInputValue(session.ended_at) : "",
  );
  const [notes, setNotes] = useState(session.notes ?? "");
  const [isNightSleep, setIsNightSleep] = useState(session.is_night_sleep);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("sleep_sessions")
      .update({
        started_at: combineDateAndTime(startedDate, startedTime).toISOString(),
        ended_at:
          endedDate && endedTime
            ? combineDateAndTime(endedDate, endedTime).toISOString()
            : null,
        notes: notes || null,
        is_night_sleep: isNightSleep,
      })
      .eq("id", session.id);

    setSaving(false);
    if (saveError) {
      setError("Couldn't save the sleep session. Try again.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("sleep_sessions")
      .delete()
      .eq("id", session.id);
    setDeleting(false);
    if (deleteError) {
      setError("Couldn't delete the sleep session. Try again.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold">Edit sleep</h2>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Started at
        </label>
        <div className="mb-4 flex gap-2">
          <input
            type="date"
            value={startedDate}
            onChange={(e) => setStartedDate(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
          />
          <input
            type="time"
            value={startedTime}
            onChange={(e) => setStartedTime(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Ended at
        </label>
        <div className="mb-1 flex gap-2">
          <input
            type="date"
            value={endedDate}
            onChange={(e) => setEndedDate(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
          />
          <input
            type="time"
            value={endedTime}
            onChange={(e) => setEndedTime(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <p className="mb-4 text-xs text-slate-400">Leave both blank if still asleep.</p>

        <label className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isNightSleep}
            onChange={(e) => setIsNightSleep(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
          />
          🌆 This was the night sleep (not a nap)
        </label>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-3 text-base font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 rounded-lg bg-indigo-600 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="mt-3">
          {confirmingDelete ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">Delete this sleep session?</span>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg px-2 py-1 text-slate-500"
              >
                No
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full py-1 text-center text-sm text-red-600"
            >
              Delete sleep session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
