"use client";

import { useEffect, useState } from "react";

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
    <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
      <button
        onClick={() => apply("light")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
          theme === "light" ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300"
        }`}
      >
        ☀️ Light
      </button>
      <button
        onClick={() => apply("dark")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
          theme === "dark" ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300"
        }`}
      >
        🌙 Dark
      </button>
    </div>
  );
}
