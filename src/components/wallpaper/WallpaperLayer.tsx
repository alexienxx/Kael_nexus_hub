import type { ConversationWallpaper } from "@/types/wallpaper";

interface WallpaperLayerProps {
  wallpaper: ConversationWallpaper | null;
  fallbackBg?: string;
  themeOpacity?: number;
}

/**
 * Dedicated wallpaper rendering layer.
 * Renders behind all chat content as a separate visual subsystem.
 * Does NOT share rendering logic with message images.
 */
const WallpaperLayer = ({ wallpaper, fallbackBg, themeOpacity = 0.4 }: WallpaperLayerProps) => {
  if (!wallpaper) {
    // Fallback: use default theme background
    return (
      <>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: fallbackBg ? `url(${fallbackBg})` : undefined }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, hsl(var(--background) / ${themeOpacity * 0.5}), hsl(var(--background) / ${themeOpacity}), hsl(var(--background) / ${themeOpacity * 1.5}))`,
          }}
        />
      </>
    );
  }

  const ds = wallpaper.displaySettings;

  const objectFit: Record<string, string> = {
    cover: "cover",
    contain: "contain",
    fill: "100% 100%",
  };

  const bgPosition: Record<string, string> = {
    top: "center top",
    center: "center center",
    bottom: "center bottom",
  };

  return (
    <>
      {/* Wallpaper image */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${wallpaper.wallpaperUri})`,
          backgroundSize: ds.fitMode === "fill" ? "100% 100%" : objectFit[ds.fitMode],
          backgroundPosition: bgPosition[ds.position],
          backgroundRepeat: "no-repeat",
          filter: ds.blurAmount > 0 ? `blur(${ds.blurAmount}px)` : undefined,
          // Slightly scale up to avoid blur edge artifacts
          transform: ds.blurAmount > 0 ? "scale(1.05)" : undefined,
        }}
      />

      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `rgba(0, 0, 0, ${ds.overlayStrength * 0.7})`,
        }}
      />

      {/* Gradient dimming layer */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(0,0,0,${ds.dimness * 0.3}), rgba(0,0,0,${ds.dimness * 0.6}), rgba(0,0,0,${ds.dimness * 0.8}))`,
        }}
      />
    </>
  );
};

export default WallpaperLayer;
