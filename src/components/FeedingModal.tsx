"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { FEED_TYPE_ICONS, type FeedType } from "@/lib/feedingTypes";

const FEED_TYPES: { value: FeedType; label: string; icon: string }[] = [
  { value: "bottle", label: "Bottle", icon: FEED_TYPE_ICONS.bottle },
  { value: "breast", label: "Breast", icon: FEED_TYPE_ICONS.breast },
  { value: "formula", label: "Formula", icon: FEED_TYPE_ICONS.formula },
  { value: "solid", label: "Solid", icon: FEED_TYPE_ICONS.solid },
];

export function FeedingModal({
  feeding,
  defaultSleepSessionId,
  defaultDate,
  defaultDateTime,
  onClose,
  onSaved,
}: {
  feeding?: Tables<"feedings">;
  defaultSleepSessionId?: string | null;
  defaultDate?: Date;
  /** Exact prefill time (e.g. from tapping on the week grid), overrides defaultDate. */
  defaultDateTime?: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!feeding;
  const now = new Date();
  const initialDateTime =
    feeding?.occurred_at ??
    defaultDateTime ??
    (defaultDate
      ? new Date(
          defaultDate.getFullYear(),
          defaultDate.getMonth(),
          defaultDate.getDate(),
          now.getHours(),
          now.getMinutes(),
        )
      : now);

  const [feedType, setFeedType] = useState<FeedType>(
    (feeding?.feed_type as FeedType) ?? "bottle",
  );
  const [amount, setAmount] = useState(feeding?.amount != null ? String(feeding.amount) : "");
  const [unit, setUnit] = useState<"ml" | "oz">((feeding?.unit as "ml" | "oz") ?? "ml");
  const [notes, setNotes] = useState(feeding?.notes ?? "");
  const [occurredDate, setOccurredDate] = useState(() => toDateInputValue(initialDateTime));
  const [occurredTime, setOccurredTime] = useState(() => toTimeInputValue(initialDateTime));
  const [solidFoods, setSolidFoods] = useState<Tables<"solid_foods">[]>([]);
  const [solidFoodId, setSolidFoodId] = useState<string | null>(feeding?.solid_food_id ?? null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAmount = feedType === "bottle" || feedType === "formula";

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("solid_foods")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data }) => setSolidFoods(data ?? []));
  }, []);

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
      solid_food_id: feedType === "solid" ? solidFoodId : null,
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
          {isEditing ? "Edit feeding" : "Log a feeding"}
        </h2>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {FEED_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setFeedType(t.value)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition ${
                feedType === t.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Date
            </label>
            <input
              type="date"
              value={occurredDate}
              onChange={(e) => setOccurredDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Time
            </label>
            <input
              type="time"
              value={occurredTime}
              onChange={(e) => setOccurredTime(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
        </div>

        {needsAmount && (
          <div className="mb-4 flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "ml" | "oz")}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
              >
                <option value="ml">ml</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
        )}

        {feedType === "solid" && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Food
            </label>
            <select
              value={solidFoodId ?? ""}
              onChange={(e) => setSolidFoodId(e.target.value || null)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-base dark:border-neutral-800 dark:bg-neutral-900"
            >
              <option value="">None</option>
              {solidFoods.map((food) => (
                <option key={food.id} value={food.id}>
                  {food.name}
                </option>
              ))}
            </select>
            {solidFoods.length === 0 && (
              <p className="mt-1 text-xs text-neutral-400">
                No solid foods yet —{" "}
                <Link href="/settings" className="underline">
                  add some in Settings
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Notes (optional)
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 rounded-xl bg-accent py-3 text-base font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {isEditing && (
          <div className="mt-3">
            {confirmingDelete ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-neutral-500">Delete this feeding?</span>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg px-2 py-1 text-neutral-500"
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
