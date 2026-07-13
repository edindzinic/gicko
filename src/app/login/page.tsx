"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
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
      setError("Incorrect username or password.");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Incorrect username or password.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-linear-to-b from-violet-100 via-rose-50 to-stone-50 px-4 dark:from-stone-900 dark:via-stone-900 dark:to-stone-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl border border-stone-200/60 bg-white p-8 shadow-lg shadow-violet-200/40 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none"
      >
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🍼</div>
          <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100">Gicko</h1>
          <p className="text-sm text-stone-500">Sign in to keep tracking</p>
        </div>

        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
          Username
        </label>
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-2xl border border-stone-200 px-4 py-3 text-base focus:border-violet-400 focus:ring-4 focus:ring-violet-100 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:focus:ring-violet-500/20"
        />

        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-2xl border border-stone-200 px-4 py-3 text-base focus:border-violet-400 focus:ring-4 focus:ring-violet-100 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:focus:ring-violet-500/20"
        />

        {error && (
          <p className="mb-4 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950 dark:text-rose-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-violet-500 py-3 text-base font-medium text-white transition hover:bg-violet-600 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-stone-400">
          You&apos;ll stay signed in on this device.
        </p>
      </form>
    </div>
  );
}
