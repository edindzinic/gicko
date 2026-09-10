/**
 * Sleep and feeding reminders, sent as web push.
 *
 * Four kinds: a heads-up ten minutes before the next nap, twenty before bedtime, a
 * nudge five minutes before a nap should end so he can be woken, and a feeding reminder
 * an hour and a half after the last one. pg_cron calls this once a minute (see the
 * schedule_notify_sleep_tick migration); the app calls it with { test: true } to prove a
 * device is set up.
 *
 * Deployed with the Supabase MCP tools from this file — edit here, then redeploy, so the
 * running function and the repo stay in step.
 *
 * The VAPID keypair is generated here on first use and kept in public.push_config, which
 * no browser can read. Nothing to configure by hand, and the private key never leaves
 * the project.
 */
import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  computeDue,
  DEFAULT_FEEDING_INTERVAL_HOURS,
  type Feeding,
  type Kind,
  type Session,
} from "./schedule.ts";

/** How late a tick may be and still send. Past that the moment has gone; stay quiet. */
const FIRE_WINDOW_MS = 2 * 60 * 1000;
const RECENT_SESSION_HOURS = 48;

type Language = "en" | "bs" | "de";
type Subscriber = { endpoint: string; p256dh: string; auth: string; language: Language };

const COPY: Record<Kind, Record<Language, { title: string; body: string }>> = {
  nap_due: {
    en: { title: "Nap in 10 minutes", body: "The wake window is nearly up." },
    bs: { title: "Dremka za 10 minuta", body: "Prozor budnosti je skoro pri kraju." },
    de: { title: "Nickerchen in 10 Minuten", body: "Das Wachfenster ist fast vorbei." },
  },
  bedtime_due: {
    en: { title: "Time for a bath", body: "Bedtime is about twenty minutes away." },
    bs: { title: "Vrijeme za kupanje", body: "Spavanje je za dvadesetak minuta." },
    de: { title: "Zeit für das Bad", body: "In gut zwanzig Minuten ist Schlafenszeit." },
  },
  nap_end: {
    en: { title: "Wake him in 5 minutes", body: "The nap is almost as long as it should be." },
    bs: { title: "Probudi ga za 5 minuta", body: "Dremka je skoro dostigla predviđenu dužinu." },
    de: { title: "Weck ihn in 5 Minuten", body: "Das Nickerchen hat fast seine geplante Länge." },
  },
  feeding_due: {
    en: { title: "Time for a feeding", body: "An hour and a half since the last one." },
    bs: { title: "Vrijeme za hranjenje", body: "Sat i po od zadnjeg hranjenja." },
    de: { title: "Zeit für eine Mahlzeit", body: "Eineinhalb Stunden seit der letzten." },
  },
  test: {
    en: { title: "Notifications are on", body: "This is what a Gicko reminder looks like." },
    bs: { title: "Obavještenja su uključena", body: "Ovako izgleda Gicko podsjetnik." },
    de: { title: "Benachrichtigungen sind aktiv", body: "So sieht eine Gicko-Erinnerung aus." },
  },
};

/**
 * The project's VAPID identity, minted on first use. The insert is conditional, so two
 * ticks racing on a cold project still end up with one keypair.
 */
async function vapidKeys(supabase: SupabaseClient) {
  const existing = await supabase.from("push_config").select("public_key, private_key").maybeSingle();
  if (existing.data) return existing.data;

  const generated = webpush.generateVAPIDKeys();
  await supabase
    .from("push_config")
    .insert({ id: true, public_key: generated.publicKey, private_key: generated.privateKey })
    .then(() => undefined);

  const stored = await supabase.from("push_config").select("public_key, private_key").maybeSingle();
  if (!stored.data) throw new Error("could not store the VAPID keypair");
  return stored.data;
}

// The app calls this from its own origin, so every reply needs these or the browser
// discards it — including the preflight, which must not reach the logic below.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function loadSubscribers(supabase: SupabaseClient, userId?: string) {
  const query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth, created_by");
  const { data: subs, error } = userId ? await query.eq("created_by", userId) : await query;
  if (error) throw error;
  if (!subs?.length) return [];

  // Everyone reads their own language, so a reminder goes out in each subscriber's.
  const { data: profiles } = await supabase.from("profiles").select("id, language");
  const languageById = new Map((profiles ?? []).map((p) => [p.id, p.language as Language]));

  return subs.map((s) => ({
    endpoint: s.endpoint,
    p256dh: s.p256dh,
    auth: s.auth,
    language: languageById.get(s.created_by) ?? "en",
  })) satisfies Subscriber[];
}

async function send(supabase: SupabaseClient, subscribers: Subscriber[], kind: Kind, ttlSeconds: number) {
  let sent = 0;
  let dropped = 0;
  const failures: string[] = [];

  await Promise.all(
    subscribers.map(async (sub) => {
      const copy = COPY[kind][sub.language] ?? COPY[kind].en;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: copy.title, body: copy.body, tag: kind, url: "/" }),
          // A reminder that arrives after the moment it was about is worse than none, so
          // it expires with the lead time it was sent for.
          { TTL: ttlSeconds, urgency: "high" },
        );
        sent += 1;
      } catch (e) {
        const err = e as { statusCode?: number; message?: string };
        // The device uninstalled the app or the endpoint rotated; stop pushing to it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          dropped += 1;
          return;
        }
        failures.push(`${err.statusCode ?? "?"}: ${err.message ?? "unknown"}`);
      }
    }),
  );

  return { sent, dropped, failures };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const keys = await vapidKeys(supabase);
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:edin@ins-pi.com",
    keys.public_key,
    keys.private_key,
  );

  const body = (await req.json().catch(() => ({}))) as { test?: boolean; publicKey?: boolean };

  // What a browser needs to subscribe. The private half stays here.
  if (body.publicKey) return json({ publicKey: keys.public_key });

  if (body.test) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "sign in to send a test notification" }, 401);

    const subscribers = await loadSubscribers(supabase, user.id);
    if (!subscribers.length) return json({ sent: 0, reason: "no subscription for this user" });
    return json({ kind: "test", ...(await send(supabase, subscribers, "test", 60)) });
  }

  const now = new Date();
  const since = new Date(now.getTime() - RECENT_SESSION_HOURS * 3600_000).toISOString();
  const [sessions, feedings, wakeWindows, napDurations, feedingSettings] = await Promise.all([
    supabase
      .from("sleep_sessions")
      .select("id, started_at, ended_at, is_night_sleep")
      .gte("started_at", since),
    supabase.from("feedings").select("id, occurred_at").gte("occurred_at", since),
    supabase.from("wake_windows").select("hours").order("position"),
    supabase.from("nap_durations").select("hours").order("position"),
    supabase.from("feeding_settings").select("interval_hours").maybeSingle(),
  ]);

  const due = computeDue(now, (sessions.data ?? []) as Session[], (feedings.data ?? []) as Feeding[], {
    wakeWindowHours: (wakeWindows.data ?? []).map((w) => Number(w.hours)),
    napDurationHours: (napDurations.data ?? []).map((n) => Number(n.hours)),
    feedingIntervalHours:
      Number(feedingSettings.data?.interval_hours) || DEFAULT_FEEDING_INTERVAL_HOURS,
  });

  // A moment that has already passed by more than the window stays unannounced.
  const fireable = due.filter((d) => {
    const lateBy = now.getTime() - d.targetAt.getTime();
    return lateBy >= 0 && lateBy < FIRE_WINDOW_MS;
  });
  if (!fireable.length) {
    return json({
      sent: 0,
      reason: "nothing due",
      pending: due.map((d) => ({ kind: d.kind, targetAt: d.targetAt })),
    });
  }

  const subscribers = await loadSubscribers(supabase);
  if (!subscribers.length) return json({ sent: 0, reason: "no subscriptions" });

  const results = [];
  for (const item of fireable) {
    // Claiming the row is what makes this send-once: the unique key rejects every later
    // caller for the same reminder, so an overlapping or retried tick stays silent.
    const claim = await supabase
      .from("notification_deliveries")
      .insert({
        kind: item.kind,
        dedupe_key: item.dedupeKey,
        target_at: item.targetAt.toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (claim.error) {
      results.push({
        kind: item.kind,
        sent: 0,
        reason: claim.error.code === "23505" ? "already sent" : claim.error.message,
      });
      continue;
    }

    const result = await send(supabase, subscribers, item.kind, item.ttlSeconds);
    await supabase
      .from("notification_deliveries")
      .update({ sent_count: result.sent })
      .eq("id", claim.data!.id);
    results.push({ kind: item.kind, targetAt: item.targetAt, ...result });
  }

  return json({ results });
});
