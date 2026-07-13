"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/database.types";

type FeedType = "breast" | "bottle" | "formula" | "solid";

const FEED_TYPES: { value: FeedType; label: string; icon: string }[] = [
  { value: "bottle", label: "Bottle", icon: "🍼" },
  { value: "breast", label: "Breast", icon: "🤱" },
  { value: "formula", label: "Formula", icon: "🧴" },
  { value: "solid", label: "Solid", icon: "🥣" },
];

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function FeedingModal({
  defaultSleepSessionId,
  onClose,
  onSaved,
}: {
  defaultSleepSessionId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [feedType, setFeedType] = useState<FeedType>("bottle");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"ml" | "oz">("ml");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAmount = feedType === "bottle" || feedType === "formula";

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload: TablesInsert<"feedings"> = {
      feed_type: feedType,
      occurred_at: new Date(occurredAt).toISOString(),
      amount: needsAmount && amount ? Number(amount) : null,
      unit: needsAmount && amount ? unit : null,
      notes: notes || null,
      sleep_session_id: defaultSleepSessionId ?? null,
    };

    const { error: insertError } = await supabase.from("feedings").insert(payload);

    setSaving(false);
    if (insertError) {
      setError("Couldn't save the feeding. Try again.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold">Log a feeding</h2>

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

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Time
        </label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />

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
            disabled={saving}
            className="flex-1 rounded-lg bg-sky-600 py-3 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
