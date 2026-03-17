"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo, useSyncExternalStore } from "react";

const themeOrder = ["light", "dark", "system"] as const;

type ThemeMode = (typeof themeOrder)[number];

function nextTheme(theme: string | undefined): ThemeMode {
  const currentTheme = themeOrder.includes(theme as ThemeMode) ? (theme as ThemeMode) : "system";
  if (currentTheme === "light") {
    return "dark";
  }
  if (currentTheme === "dark") {
    return "system";
  }
  return "light";
}

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const subscribe = () => () => {};
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const currentTheme = useMemo<ThemeMode>(
    () => (themeOrder.includes(theme as ThemeMode) ? (theme as ThemeMode) : "system"),
    [theme]
  );

  const label =
    currentTheme === "light"
      ? "Light"
      : currentTheme === "dark"
        ? "Dark"
        : `System (${resolvedTheme ?? "light"})`;

  if (!mounted) {
    return (
      <button type="button" className="btn btn-secondary p-2!" aria-hidden>
        <Sun className="h-4 w-4 opacity-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary p-2!"
      onClick={() => setTheme(nextTheme(currentTheme))}
      aria-label={`Switch theme, current ${label}`}
      title={`Theme: ${label}`}
    >
      {currentTheme === "dark" ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
