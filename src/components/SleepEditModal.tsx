"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { toDatetimeLocalValue } from "@/lib/time";

export function SleepEditModal({
  session,
  onClose,
  onSaved,
}: {
  session: Tables<"sleep_sessions">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startedAt, setStartedAt] = useState(() => toDatetimeLocalValue(session.started_at));
  const [endedAt, setEndedAt] = useState(() =>
    session.ended_at ? toDatetimeLocalValue(session.ended_at) : "",
  );
  const [notes, setNotes] = useState(session.notes ?? "");
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
        started_at: new Date(startedAt).toISOString(),
        ended_at: endedAt ? new Date(endedAt).toISOString() : null,
        notes: notes || null,
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
        <input
          type="datetime-local"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Ended at
        </label>
        <input
          type="datetime-local"
          value={endedAt}
          onChange={(e) => setEndedAt(e.target.value)}
          placeholder="Still asleep"
          className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />
        <p className="mb-4 text-xs text-slate-400">Leave blank if still asleep.</p>

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
            className="flex-1 rounded-lg bg-sky-600 py-3 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
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
