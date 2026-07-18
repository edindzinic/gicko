"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Home, Settings } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function Nav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const links = [
    { href: "/", label: t.nav.home, Icon: Home },
    { href: "/calendar", label: t.nav.calendar, Icon: Calendar },
    { href: "/settings", label: t.nav.settings, Icon: Settings },
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-6 sm:flex dark:border-neutral-900 dark:bg-neutral-950">
        <div className="mb-9 flex items-center gap-2 px-2">
          <span className="text-2xl">🍼</span>
          <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Gicko
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                pathname === href
                  ? "bg-accent/10 text-accent"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
              }`}
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden dark:border-neutral-900 dark:bg-neutral-950/95">
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              pathname === href
                ? "text-accent"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
