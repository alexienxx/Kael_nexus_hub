import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ThemeSettings, BubbleStyle } from "@/types";
import kaelAvatarDefault from "@/assets/kael-avatar.jpg";

const STORAGE_KEY = "kael-theme-settings";

const defaultTheme: ThemeSettings = {
  accentHue: 270,
  accentSaturation: 100,
  bubbleColorHue: 270,
  bubbleStyle: "rounded",
  backgroundOpacity: 0.4,
  blurStrength: 20,
  backgroundImage: null,
  kaelAvatar: null,
  bubbleRadius: 16,
  audioBarStyle: "bars",
  notificationSound: "gentle",
};

interface ThemeContextValue {
  theme: ThemeSettings;
  setTheme: (t: ThemeSettings) => void;
  updateTheme: (partial: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
  kaelAvatarSrc: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...defaultTheme, ...JSON.parse(stored) };
    } catch {}
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

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export const themePresets: Array<{ id: string; name: string; settings: Partial<ThemeSettings> }> = [
  { id: "purple-dream", name: "Purple Dream", settings: { accentHue: 270, accentSaturation: 100, bubbleColorHue: 270, backgroundOpacity: 0.4 } },
  { id: "rose-glow", name: "Rose Glow", settings: { accentHue: 330, accentSaturation: 90, bubbleColorHue: 330, backgroundOpacity: 0.35 } },
  { id: "ocean-night", name: "Ocean Night", settings: { accentHue: 220, accentSaturation: 85, bubbleColorHue: 220, backgroundOpacity: 0.5 } },
  { id: "midnight-gold", name: "Midnight Gold", settings: { accentHue: 45, accentSaturation: 80, bubbleColorHue: 45, backgroundOpacity: 0.45 } },
  { id: "deep-violet", name: "Deep Violet", settings: { accentHue: 280, accentSaturation: 95, bubbleColorHue: 280, backgroundOpacity: 0.3 } },
];

export const bubbleStylePresets: Array<{ id: BubbleStyle; name: string; radius: number }> = [
  { id: "rounded", name: "Rounded", radius: 16 },
  { id: "sharp", name: "Sharp", radius: 4 },
  { id: "pill", name: "Pill", radius: 24 },
  { id: "cloud", name: "Cloud", radius: 20 },
];
