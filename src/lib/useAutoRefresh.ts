"use client";

import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 60_000;
/** focus and visibilitychange usually arrive together; one refetch covers both. */
const MIN_GAP_MS = 5_000;

/**
 * Keeps a screen's data fresh without anyone reaching for a reload. Two people log into
 * this app from different phones, so a feeding entered on one should turn up on the
 * other, and a phone that has been in a pocket since the morning shouldn't open on
 * yesterday evening.
 *
 * Refetches when the tab comes back to the foreground and on a slow interval while it's
 * there. Nothing runs while the tab is hidden, where a poll would only cost battery.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = DEFAULT_INTERVAL_MS) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    // Counts from mount, so coming straight back to a tab doesn't refetch what the page
    // has only just loaded.
    let lastRun = Date.now();

    const run = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun < MIN_GAP_MS) return;
      lastRun = Date.now();
      latest.current();
    };

    const id = setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}
