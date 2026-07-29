"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function PumpingModal({
  session,
  defaultDate,
  onClose,
  onSaved,
}: {
  session?: Tables<"pumping_sessions">;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const isEditing = !!session;
  const now = new Date();
  const initialDateTime = session?.occurred_at
    ? new Date(session.occurred_at)
    : defaultDate
      ? new Date(
          defaultDate.getFullYear(),
          defaultDate.getMonth(),
          defaultDate.getDate(),
          now.getHours(),
          now.getMinutes(),
        )
      : now;

  const [occurredDate, setOccurredDate] = useState(() => toDateInputValue(initialDateTime));
  const [occurredTime, setOccurredTime] = useState(() => toTimeInputValue(initialDateTime));
  const [duration, setDuration] = useState(
    session?.duration_minutes != null ? String(session.duration_minutes) : "",
  );
  const [amount, setAmount] = useState(session?.amount_ml != null ? String(session.amount_ml) : "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload: TablesInsert<"pumping_sessions"> = {
      occurred_at: combineDateAndTime(occurredDate, occurredTime).toISOString(),
      duration_minutes: Number(duration),
      amount_ml: Number(amount),
    };

    const { error: saveError } = isEditing
      ? await supabase.from("pumping_sessions").update(payload).eq("id", session.id)
      : await supabase.from("pumping_sessions").insert(payload);

    setSaving(false);
    if (saveError) {
      setError(t.pumpingModal.errorSave);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!session) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("pumping_sessions")
      .delete()
      .eq("id", session.id);
    setDeleting(false);
    if (deleteError) {
      setError(t.pumpingModal.errorDelete);
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
          {isEditing ? t.pumpingModal.editTitle : t.pumpingModal.logTitle}
        </h2>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.pumpingModal.occurredAt}
        </label>
        <div className="mb-4 flex gap-2">
          <input
            type="date"
            value={occurredDate}
            onChange={(e) => setOccurredDate(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            type="time"
            value={occurredTime}
            onChange={(e) => setOccurredTime(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
          />
        </div>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t.pumpingModal.duration}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={t.pumpingModal.durationPlaceholder}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t.pumpingModal.amount}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t.pumpingModal.amountPlaceholder}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
        </div>

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
            disabled={saving || deleting || !duration || !amount}
            className="flex-1 rounded-xl bg-accent py-3 text-base font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>

        {isEditing && (
          <div className="mt-3">
            {confirmingDelete ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-neutral-500">{t.pumpingModal.deleteConfirmQuestion}</span>
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
                  {deleting ? t.pumpingModal.deleting : t.common.yesDelete}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full py-1 text-center text-sm text-red-600"
              >
                {t.pumpingModal.deletePumping}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
