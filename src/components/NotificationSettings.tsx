"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  disablePush,
  enablePush,
  getPushState,
  prefetchPushKey,
  registerServiceWorker,
  sendTestPush,
  type PushState,
} from "@/lib/push";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function NotificationSettings() {
  const { t } = useLanguage();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept alongside the friendly line: "try again" alone gives nothing to act on when the
  // failure is something like a blocked request or a push service refusing to subscribe.
  const [detail, setDetail] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    let live = true;
    // The worker has to be registered before its subscription can be looked up.
    registerServiceWorker()
      .then(getPushState)
      .then((next) => {
        if (live) setState(next);
        if (next === "off") prefetchPushKey();
      });
    return () => {
      live = false;
    };
  }, []);

  function fail(e: unknown) {
    setError(t.settings.notificationsError);
    setDetail(e instanceof Error ? e.message : String(e));
  }

  async function run(action: () => Promise<PushState>) {
    setBusy(true);
    setError(null);
    setDetail(null);
    setTestSent(false);
    try {
      setState(await action());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      const result = await sendTestPush();
      if (result?.sent) setTestSent(true);
      else {
        setError(t.settings.notificationsError);
        setDetail(result?.reason ?? null);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
        <Bell className="h-4 w-4" strokeWidth={2} /> {t.settings.notifications}
      </h2>

      {state === null ? (
        <p className="text-sm text-neutral-400">…</p>
      ) : state === "needs-install" ? (
        <p className="text-sm text-neutral-500">{t.settings.notificationsNeedsInstall}</p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-neutral-500">{t.settings.notificationsUnsupported}</p>
      ) : state === "denied" ? (
        <p className="text-sm text-neutral-500">{t.settings.notificationsDenied}</p>
      ) : state === "on" ? (
        <>
          <p className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t.settings.notificationsOn}
          </p>
          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={busy}
              className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300"
            >
              {t.settings.sendTestNotification}
            </button>
            <button
              onClick={() => run(disablePush)}
              disabled={busy}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
            >
              {t.settings.disableNotifications}
            </button>
          </div>
          {testSent && (
            <p className="mt-3 text-sm text-neutral-500">{t.settings.testNotificationSent}</p>
          )}
        </>
      ) : (
        <button
          onClick={() => run(enablePush)}
          disabled={busy}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {t.settings.enableNotifications}
        </button>
      )}

      {error && (
        <>
          <p className="mt-3 text-sm text-red-600">{error}</p>
          {detail && <p className="mt-1 text-xs break-words text-neutral-400">{detail}</p>}
        </>
      )}

      <p className="mt-4 text-xs text-neutral-400">{t.settings.notificationsHint}</p>
    </div>
  );
}
