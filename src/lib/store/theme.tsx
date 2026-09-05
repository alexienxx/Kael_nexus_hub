import React, { useState, useEffect, useCallback } from "react";
import type { ThemeSettings } from "@/types";
import kaelAvatarDefault from "@/assets/kael-avatar.jpg";
import { ThemeContext, defaultTheme } from "@/lib/store/theme-context";

const STORAGE_KEY = "kael-theme-settings";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...defaultTheme, ...JSON.parse(stored) };
    } catch (error) {
      console.warn("[Theme] Ignoring invalid stored theme state:", error);
    }
    return defaultTheme;
  });

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-hue", String(theme.accentHue));
    root.style.setProperty("--accent-sat", `${theme.accentSaturation}%`);
    root.style.setProperty("--bubble-hue", String(theme.bubbleColorHue));
    root.style.setProperty("--bg-opacity", String(theme.backgroundOpacity));
    root.style.setProperty("--blur-strength", `${theme.blurStrength}px`);
    root.style.setProperty("--bubble-radius", `${theme.bubbleRadius}px`);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  const setTheme = useCallback((t: ThemeSettings) => setThemeState(t), []);
  const updateTheme = useCallback(
    (partial: Partial<ThemeSettings>) => setThemeState((prev) => ({ ...prev, ...partial })),
    []
  );
  const resetTheme = useCallback(() => setThemeState(defaultTheme), []);

  const kaelAvatarSrc = theme.kaelAvatar || kaelAvatarDefault;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, updateTheme, resetTheme, kaelAvatarSrc }}>
      {children}
    </ThemeContext.Provider>
  );
}
