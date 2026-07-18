"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { combineDateAndTime, isNightTime, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function SleepEditModal({
  session,
  defaultDate,
  defaultStart,
  defaultEnd,
  onClose,
  onSaved,
}: {
  session?: Tables<"sleep_sessions">;
  defaultDate?: Date;
  /** Exact prefill start time (e.g. from tapping/dragging on the week grid), overrides defaultDate. */
  defaultStart?: Date;
  defaultEnd?: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const isEditing = !!session;
  const now = new Date();
  const initialStart =
    session?.started_at ??
    defaultStart ??
    (defaultDate
      ? new Date(
          defaultDate.getFullYear(),
          defaultDate.getMonth(),
          defaultDate.getDate(),
          now.getHours(),
          now.getMinutes(),
        )
      : now);
  const initialEnd = session?.ended_at ?? defaultEnd ?? null;

  const [startedDate, setStartedDate] = useState(() => toDateInputValue(initialStart));
  const [startedTime, setStartedTime] = useState(() => toTimeInputValue(initialStart));
  const [endedDate, setEndedDate] = useState(() => (initialEnd ? toDateInputValue(initialEnd) : ""));
  const [endedTime, setEndedTime] = useState(() => (initialEnd ? toTimeInputValue(initialEnd) : ""));
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [isNightSleep, setIsNightSleep] = useState(
    session?.is_night_sleep ??
      isNightTime(typeof initialStart === "string" ? initialStart : initialStart.toISOString()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload: TablesInsert<"sleep_sessions"> = {
      started_at: combineDateAndTime(startedDate, startedTime).toISOString(),
      ended_at:
        endedDate && endedTime
          ? combineDateAndTime(endedDate, endedTime).toISOString()
          : null,
      notes: notes || null,
      is_night_sleep: isNightSleep,
    };

    const { error: saveError } = isEditing
      ? await supabase.from("sleep_sessions").update(payload).eq("id", session.id)
      : await supabase.from("sleep_sessions").insert(payload);

    setSaving(false);
    if (saveError) {
      setError(t.sleepModal.errorSave);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!session) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("sleep_sessions")
      .delete()
      .eq("id", session.id);
    setDeleting(false);
    if (deleteError) {
      setError(t.sleepModal.errorDelete);
      return;
    }
    onSaved();
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
      >
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {isEditing ? t.sleepModal.editTitle : t.sleepModal.logTitle}
        </h2>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.sleepModal.startedAt}
        </label>
        <div className="mb-4 flex gap-2">
          <input
            type="date"
            value={startedDate}
            onChange={(e) => setStartedDate(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            type="time"
            value={startedTime}
            onChange={(e) => setStartedTime(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
        </div>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.sleepModal.endedAt}
        </label>
        <div className="mb-1 flex gap-2">
          <input
            type="date"
            value={endedDate}
            onChange={(e) => setEndedDate(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            type="time"
            value={endedTime}
            onChange={(e) => setEndedTime(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
        </div>
        <p className="mb-4 text-xs text-neutral-400">{t.sleepModal.leaveBlankHint}</p>

        <label className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={isNightSleep}
            onChange={(e) => setIsNightSleep(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-200 accent-accent"
          />
          {t.sleepModal.nightSleepCheckbox}
        </label>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.common.notesOptional}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 rounded-xl bg-accent py-3 text-base font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>

        {isEditing && (
          <div className="mt-3">
            {confirmingDelete ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-neutral-500">{t.sleepModal.deleteConfirmQuestion}</span>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg px-2 py-1 text-neutral-500"
                >
                  {t.common.no}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
                >
                  {deleting ? t.sleepModal.deleting : t.common.yesDelete}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full py-1 text-center text-sm text-red-600"
              >
                {t.sleepModal.deleteSleepSession}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
