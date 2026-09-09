import { createClient } from "@/lib/supabase/client";

/**
 * Web push setup for one device.
 *
 * iOS only delivers push to a web app that has been added to the home screen, so the
 * state below distinguishes "this browser can't" from "install it first" — otherwise a
 * tap on Safari's iPhone would just fail silently.
 */
export type PushState =
  | "unsupported" // no service worker or PushManager at all
  | "needs-install" // iOS Safari: works, but only once added to the home screen
  | "denied" // permission refused; only the OS settings can undo that
  | "off" // supported, not subscribed yet
  | "on";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates display-mode and still reports it this way.
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

let cachedPublicKey: string | null = null;

/**
 * The app's VAPID public key, from the notify-sleep function that owns the pair. Kept
 * server-side rather than in a build-time env var so there's nothing to configure per
 * deployment.
 */
async function vapidPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("notify-sleep", {
    body: { publicKey: true },
  });
  if (error) throw error;
  cachedPublicKey = (data as { publicKey: string }).publicKey;
  return cachedPublicKey;
}

/**
 * Warms the key cache so enabling push doesn't wait on a round trip. iOS is strict about
 * how much can happen between the tap and the subscribe call, and this is the one part
 * that needs the network.
 */
export function prefetchPushKey() {
  return vapidPublicKey().catch(() => null);
}

/** Base64url VAPID key in the byte form PushManager.subscribe expects. */
function toApplicationServerKey(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

/**
 * navigator.serviceWorker.ready never settles when no worker ever activates, which would
 * leave the settings card spinning, so give it a deadline.
 */
async function activeRegistration() {
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // iOS hides PushManager entirely until the app is installed, so say which it is.
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";

  const registration = await activeRegistration();
  if (!registration) return "unsupported";
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

function subscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  return { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" };
}

/** Asks permission, subscribes, and stores the endpoint. Must run from a user gesture. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const registration = await activeRegistration();
  if (!registration) return "unsupported";
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(await vapidPublicKey()),
    }));

  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: subscription.endpoint,
      ...subscriptionKeys(subscription),
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;

  return "on";
}

export async function disablePush(): Promise<PushState> {
  const registration = await activeRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";

  const supabase = createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
  return "off";
}

/** Sends one notification to this account's devices, to prove the chain works. */
export async function sendTestPush() {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("notify-sleep", {
    body: { test: true },
  });
  if (error) throw error;
  return data as { sent?: number; reason?: string };
}
