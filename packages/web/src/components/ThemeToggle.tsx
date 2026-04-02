"use client";

import { useCallback, useState } from "react";
import {
  THEME_ATTRIBUTE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    return stored === "dark" ? "dark" : "light";
  });

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.cookie = `${THEME_COOKIE_NAME}=${next};path=/;max-age=31536000;SameSite=Lax`;
      document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
      return next;
    });
  }, []);

  return (
    <button
      className={styles.toggle}
      onClick={toggle}
      type="button"
      aria-label="テーマ切り替え"
    >
      {theme === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
