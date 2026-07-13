"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/time";

type FeedType = "breast" | "bottle" | "formula" | "solid";

const FEED_TYPES: { value: FeedType; label: string; icon: string }[] = [
  { value: "bottle", label: "Bottle", icon: "🍼" },
  { value: "breast", label: "Breast", icon: "🤱" },
  { value: "formula", label: "Formula", icon: "🧴" },
  { value: "solid", label: "Solid", icon: "🥣" },
];

export function FeedingModal({
  feeding,
  defaultSleepSessionId,
  onClose,
  onSaved,
}: {
  feeding?: Tables<"feedings">;
  defaultSleepSessionId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!feeding;

  const [feedType, setFeedType] = useState<FeedType>(
    (feeding?.feed_type as FeedType) ?? "bottle",
  );
  const [amount, setAmount] = useState(feeding?.amount != null ? String(feeding.amount) : "");
  const [unit, setUnit] = useState<"ml" | "oz">((feeding?.unit as "ml" | "oz") ?? "ml");
  const [notes, setNotes] = useState(feeding?.notes ?? "");
  const [occurredDate, setOccurredDate] = useState(() =>
    toDateInputValue(feeding?.occurred_at ?? new Date()),
  );
  const [occurredTime, setOccurredTime] = useState(() =>
    toTimeInputValue(feeding?.occurred_at ?? new Date()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAmount = feedType === "bottle" || feedType === "formula";

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload: TablesInsert<"feedings"> = {
      feed_type: feedType,
      occurred_at: combineDateAndTime(occurredDate, occurredTime).toISOString(),
      amount: needsAmount && amount ? Number(amount) : null,
      unit: needsAmount && amount ? unit : null,
      notes: notes || null,
      sleep_session_id: feeding?.sleep_session_id ?? defaultSleepSessionId ?? null,
    };

    const { error: saveError } = isEditing
      ? await supabase.from("feedings").update(payload).eq("id", feeding.id)
      : await supabase.from("feedings").insert(payload);

    setSaving(false);
    if (saveError) {
      setError("Couldn't save the feeding. Try again.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!feeding) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("feedings")
      .delete()
      .eq("id", feeding.id);
    setDeleting(false);
    if (deleteError) {
      setError("Couldn't delete the feeding. Try again.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold">
          {isEditing ? "Edit feeding" : "Log a feeding"}
        </h2>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {FEED_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setFeedType(t.value)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition ${
                feedType === t.value
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                  : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Date
            </label>
            <input
              type="date"
              value={occurredDate}
              onChange={(e) => setOccurredDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Time
            </label>
            <input
              type="time"
              value={occurredTime}
              onChange={(e) => setOccurredTime(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {needsAmount && (
          <div className="mb-4 flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Amount
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 120"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "ml" | "oz")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="ml">ml</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
        )}

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

        {isEditing && (
          <div className="mt-3">
            {confirmingDelete ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-slate-500">Delete this feeding?</span>
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
                Delete feeding
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
