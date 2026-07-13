"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with class set by no-flash init script
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("gicko-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
