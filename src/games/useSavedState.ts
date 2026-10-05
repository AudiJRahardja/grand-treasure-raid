"use client";

import { useEffect, useState } from "react";

/**
 * useState that survives reloads via localStorage, so a half-filled grid isn't
 * lost (the timer keeps running across reloads too). Purely a convenience:
 * if storage is unavailable or the saved value fails `isValid`, it starts fresh.
 * Only use in components that render client-side (games render after Start).
 */
export function useSavedState<T>(key: string, initial: () => T, isValid: (saved: unknown) => saved is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const saved: unknown = JSON.parse(raw);
        if (isValid(saved)) return saved;
      }
    } catch {
      // Private mode, blocked storage or bad JSON: start fresh
    }
    return initial();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore: saving progress is optional
    }
  }, [key, value]);

  return [value, setValue] as const;
}
