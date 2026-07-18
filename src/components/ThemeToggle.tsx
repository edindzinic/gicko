"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function ThemeToggle() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with class set by no-flash init script
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("gicko-theme", next);
  }

  return (
    <div className="inline-flex rounded-xl border border-neutral-200 p-0.5 text-sm dark:border-neutral-800">
      <button
        onClick={() => apply("light")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
          theme === "light"
            ? "bg-accent text-white"
            : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        <Sun className="h-4 w-4" strokeWidth={2} /> {t.settings.light}
      </button>
      <button
        onClick={() => apply("dark")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
          theme === "dark"
            ? "bg-accent text-white"
            : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        <Moon className="h-4 w-4" strokeWidth={2} /> {t.settings.dark}
      </button>
    </div>
  );
}
