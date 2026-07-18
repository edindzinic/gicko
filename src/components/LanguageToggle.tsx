"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LANGUAGE_OPTIONS } from "@/lib/i18n/translations";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex flex-wrap rounded-xl border border-neutral-200 p-0.5 text-sm dark:border-neutral-800">
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.code}
          onClick={() => setLanguage(option.code)}
          className={`rounded-lg px-3 py-1.5 ${
            language === option.code
              ? "bg-accent text-white"
              : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
