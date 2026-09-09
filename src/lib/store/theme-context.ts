import { createContext, useContext } from "react";
import type { ThemeSettings, BubbleStyle } from "@/types";

export const defaultTheme: ThemeSettings = {
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
  setTheme: (theme: ThemeSettings) => void;
  updateTheme: (partial: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
  kaelAvatarSrc: string;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

export const themePresets: Array<{
  id: string;
  name: string;
  settings: Partial<ThemeSettings>;
}> = [
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
