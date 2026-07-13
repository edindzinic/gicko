"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
    <div className="inline-flex rounded-2xl border border-stone-200 p-0.5 text-sm dark:border-stone-700">
      <button
        onClick={() => apply("light")}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${
          theme === "light" ? "bg-violet-500 text-white" : "text-stone-600 dark:text-stone-300"
        }`}
      >
        <Sun className="h-4 w-4" strokeWidth={2} /> Light
      </button>
      <button
        onClick={() => apply("dark")}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${
          theme === "dark" ? "bg-violet-500 text-white" : "text-stone-600 dark:text-stone-300"
        }`}
      >
        <Moon className="h-4 w-4" strokeWidth={2} /> Dark
      </button>
    </div>
  );
}
