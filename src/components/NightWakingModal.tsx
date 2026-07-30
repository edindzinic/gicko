"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function NightWakingModal({
  waking,
  onClose,
  onSaved,
}: {
  waking: Tables<"night_wakings">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [startedDate, setStartedDate] = useState(() => toDateInputValue(waking.started_at));
  const [startedTime, setStartedTime] = useState(() => toTimeInputValue(waking.started_at));
  const [endedDate, setEndedDate] = useState(() =>
    waking.ended_at ? toDateInputValue(waking.ended_at) : "",
  );
  const [endedTime, setEndedTime] = useState(() =>
    waking.ended_at ? toTimeInputValue(waking.ended_at) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload: TablesInsert<"night_wakings"> = {
      started_at: combineDateAndTime(startedDate, startedTime).toISOString(),
      ended_at:
        endedDate && endedTime ? combineDateAndTime(endedDate, endedTime).toISOString() : null,
    };

    const { error: saveError } = await supabase
      .from("night_wakings")
      .update(payload)
      .eq("id", waking.id);

    setSaving(false);
    if (saveError) {
      setError(t.nightWakingModal.errorSave);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("night_wakings")
      .delete()
      .eq("id", waking.id);
    setDeleting(false);
    if (deleteError) {
      setError(t.nightWakingModal.errorDelete);
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
          {t.nightWakingModal.editTitle}
        </h2>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.nightWakingModal.wokeAt}
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
          {t.nightWakingModal.backAsleepAt}
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
        <p className="mb-4 text-xs text-neutral-400">{t.nightWakingModal.leaveBlankHint}</p>

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

        <div className="mt-3">
          {confirmingDelete ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-neutral-500">{t.nightWakingModal.deleteConfirmQuestion}</span>
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
                {deleting ? t.nightWakingModal.deleting : t.common.yesDelete}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full py-1 text-center text-sm text-red-600"
            >
              {t.nightWakingModal.deleteWaking}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
