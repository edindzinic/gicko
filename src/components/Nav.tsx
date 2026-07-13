"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Home, LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/calendar", label: "Calendar", Icon: Calendar },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function Nav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200/70 bg-white px-4 py-6 sm:flex dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="text-2xl">🍼</span>
          <span className="text-lg font-semibold text-stone-800 dark:text-stone-100">Gicko</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                pathname === href
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                  : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={2} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200/70 pt-4 dark:border-stone-800">
          <p className="mb-2 px-2 text-xs text-stone-400">{displayName}</p>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200/70 bg-white/95 backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-900/95">
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              pathname === href
                ? "text-violet-600 dark:text-violet-400"
                : "text-stone-400 dark:text-stone-500"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
