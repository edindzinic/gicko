"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: email, error: lookupError } = await supabase.rpc(
      "email_for_username",
      { uname: username.trim() },
    );

    if (lookupError || !email) {
      setError(t.login.incorrectCredentials);
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(t.login.incorrectCredentials);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-neutral-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl shadow-neutral-200/50 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-2xl dark:shadow-black"
      >
        <div className="mb-7 text-center">
          <div className="mb-3 text-4xl">🍼</div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {t.login.heading}
          </h1>
          <p className="text-sm text-neutral-500">{t.login.subheading}</p>
        </div>

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.login.username}
        </label>
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
        />

        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.login.password}
        </label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
        />

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-accent py-3 text-base font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? t.login.signingIn : t.login.signIn}
        </button>

        <p className="mt-4 text-center text-xs text-neutral-400">{t.login.staySignedIn}</p>
      </form>
    </div>
  );
}
