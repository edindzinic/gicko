"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { format, isToday, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/time";
import { feedTypeIcon, type FeedType } from "@/lib/feedingTypes";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

/** How far back the feed reaches. Older than this and it isn't news any more. */
const LOOKBACK_HOURS = 24;
const PER_TABLE_LIMIT = 20;

/**
 * The feed reaches back a day, so a bare time would have yesterday's six o'clock reading
 * as this morning's. Only the ones that need a day get one.
 */
function when(iso: string) {
  const at = parseISO(iso);
  return isToday(at) ? formatTime(iso) : `${format(at, "EEE")} ${formatTime(iso)}`;
}

type Activity = {
  key: string;
  /** When it was entered — what "unread" is measured against. */
  loggedAt: string;
  /** When the thing itself happened, which is what's worth reading. */
  at: string;
  icon: string;
  label: string;
  by: string;
};

/**
 * What everyone else has been logging.
 *
 * Five people can log into this from their own phones, and nothing said what the others
 * had already done — so two people would go and make the same bottle, or one would wonder
 * whether the nap on screen was entered an hour ago or just now. There are no events
 * stored for this: it reads the rows themselves, which already carry who wrote them and
 * when, and shows the ones somebody else wrote.
 *
 * How far each person has read lives on their profile rather than in the browser, so the
 * count agrees with itself on their phone and their laptop.
 */
export function ActivityBell() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The bell lives in the nav bar, which carries backdrop-blur — and a backdrop filter
  // makes its element the containing block for any fixed descendant, so a sheet rendered
  // in place would be trapped inside the bar rather than covering the screen. It goes to
  // the body instead, which is only possible once there's a document.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portals need a client document
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

    // `neq` on created_by drops rows with no author too, which is what's wanted: a row
    // written from the SQL side is nobody's news.
    const [
      { data: me },
      { data: profiles },
      { data: sleeps },
      { data: feeds },
      { data: poops },
      { data: wakings },
    ] = await Promise.all([
      supabase.from("profiles").select("activity_seen_at").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id, display_name"),
      supabase
        .from("sleep_sessions")
        .select("id, created_at, created_by, started_at, is_night_sleep")
        .gte("created_at", since)
        .neq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(PER_TABLE_LIMIT),
      supabase
        .from("feedings")
        .select("id, created_at, created_by, occurred_at, feed_type, amount, unit")
        .gte("created_at", since)
        .neq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(PER_TABLE_LIMIT),
      supabase
        .from("poops")
        .select("id, created_at, created_by")
        .gte("created_at", since)
        .neq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(PER_TABLE_LIMIT),
      supabase
        .from("night_wakings")
        .select("id, created_at, created_by, started_at")
        .gte("created_at", since)
        .neq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(PER_TABLE_LIMIT),
    ]);

    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const by = (id: string | null) => (id && nameById.get(id)) || "—";

    const merged: Activity[] = [
      ...(sleeps ?? []).map((s) => ({
        key: `sleep-${s.id}`,
        loggedAt: s.created_at,
        at: s.started_at,
        icon: s.is_night_sleep ? "🌆" : "😴",
        label: s.is_night_sleep ? t.activity.nightSleep : t.activity.nap,
        by: by(s.created_by),
      })),
      ...(feeds ?? []).map((f) => ({
        key: `feed-${f.id}`,
        loggedAt: f.created_at,
        at: f.occurred_at,
        icon: feedTypeIcon(f.feed_type),
        label:
          t.feedTypes[f.feed_type as FeedType] +
          (f.amount != null ? ` · ${f.amount}${f.unit ?? ""}` : ""),
        by: by(f.created_by),
      })),
      ...(poops ?? []).map((p) => ({
        key: `poop-${p.id}`,
        loggedAt: p.created_at,
        // A poop carries no clock time, so the moment it was entered is the best there is.
        at: p.created_at,
        icon: "💩",
        label: t.activity.poop,
        by: by(p.created_by),
      })),
      ...(wakings ?? []).map((w) => ({
        key: `waking-${w.id}`,
        loggedAt: w.created_at,
        at: w.started_at,
        icon: "🌙",
        label: t.activity.nightWaking,
        by: by(w.created_by),
      })),
    ].sort((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt));

    setItems(merged);
    setSeenAt(me?.activity_seen_at ?? null);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load();
  }, [load]);

  useAutoRefresh(load);

  const unread = seenAt
    ? items.filter((item) => Date.parse(item.loggedAt) > Date.parse(seenAt)).length
    : items.length;

  async function openFeed() {
    setOpen(true);
    // Opening is the reading, so the mark moves now — but the sheet keeps the mark it
    // opened with, or everything would lose its highlight as it appeared.
    setOpenedWith(seenAt);
    if (unread === 0) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    await supabase.from("profiles").update({ activity_seen_at: now }).eq("id", user.id);
    setSeenAt(now);
  }

  return (
    <>
      <button
        onClick={openFeed}
        aria-label={t.activity.open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {!loading && unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-neutral-950"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                  {t.activity.title}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>

              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">{t.activity.empty}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const isNew = openedWith
                      ? Date.parse(item.loggedAt) > Date.parse(openedWith)
                      : true;
                    return (
                      <li
                        key={item.key}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                          isNew
                            ? "border-accent/40 bg-accent/5"
                            : "border-neutral-200 dark:border-neutral-800"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-lg">{item.icon}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                              {item.label}
                            </span>
                            <span className="block text-xs text-neutral-500">{item.by}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-neutral-600 dark:text-neutral-300">
                          {when(item.at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
