"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeCtxValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  mode: "system",
  theme: "dark",
  setMode: () => {},
  toggle: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const s = localStorage.getItem("it-theme");
    if (s === "light" || s === "dark" || s === "system") return s;
  } catch {}
  return "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

function applyTheme(resolved: ResolvedTheme, mode: ThemeMode) {
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(resolved);
  html.dataset.themeMode = mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return getStoredMode();
  });

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(mode));

  function setMode(next: ThemeMode) {
    setModeState(next);
    const resolved = resolveTheme(next);
    setTheme(resolved);
    applyTheme(resolved, next);
    try { localStorage.setItem("it-theme", next); } catch {}
  }

  // Cycle: system → dark → light → system
  function toggle() {
    const next: ThemeMode = mode === "system" ? "dark" : mode === "dark" ? "light" : "system";
    setMode(next);
  }

  // Listen to OS theme changes — only apply when mode is "system"
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const storedMode = getStoredMode();
      if (storedMode === "system") {
        const resolved: ResolvedTheme = e.matches ? "dark" : "light";
        setTheme(resolved);
        applyTheme(resolved, "system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // On mount: sync state with what the inline script already applied
  useEffect(() => {
    const storedMode = getStoredMode();
    const resolved = resolveTheme(storedMode);
    setModeState(storedMode);
    setTheme(resolved);
    applyTheme(resolved, storedMode);
  }, []);

  return (
    <ThemeCtx.Provider value={{ mode, theme, setMode, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

const ICONS: Record<ThemeMode, React.ReactNode> = {
  system: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  dark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  light: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

const LABELS: Record<ThemeMode, string> = {
  system: "System theme",
  dark: "Dark mode",
  light: "Light mode",
};

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const next: ThemeMode = mode === "system" ? "dark" : mode === "dark" ? "light" : "system";
  return (
    <button
      onClick={toggle}
      aria-label={`${LABELS[mode]} — click for ${LABELS[next]}`}
      className="theme-toggle"
      title={`${LABELS[mode]} — click for ${LABELS[next]}`}
    >
      {ICONS[mode]}
    </button>
  );
}
