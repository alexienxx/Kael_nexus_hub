import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import type {
  WallpaperFitMode,
  WallpaperPosition,
  WallpaperDisplaySettings,
} from "@/types/wallpaper";
import { DEFAULT_DISPLAY_SETTINGS } from "@/types/wallpaper";

interface WallpaperPreviewSheetProps {
  open: boolean;
  onClose: () => void;
  imageUri: string;
  onConfirm: (settings: Partial<WallpaperDisplaySettings>) => void;
}

const fitModes: { value: WallpaperFitMode; label: string }[] = [
  { value: "cover", label: "Copri" },
  { value: "contain", label: "Contieni" },
  { value: "fill", label: "Riempi" },
];

const positions: { value: WallpaperPosition; label: string }[] = [
  { value: "top", label: "Alto" },
  { value: "center", label: "Centro" },
  { value: "bottom", label: "Basso" },
];

const WallpaperPreviewSheet = ({
  open,
  onClose,
  imageUri,
  onConfirm,
}: WallpaperPreviewSheetProps) => {
  const [settings, setSettings] = useState<WallpaperDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);

  const update = (partial: Partial<WallpaperDisplaySettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const objectFitMap: Record<WallpaperFitMode, string> = {
    cover: "object-cover",
    contain: "object-contain",
    fill: "object-fill",
  };

  const objectPosMap: Record<WallpaperPosition, string> = {
    top: "object-top",
    center: "object-center",
    bottom: "object-bottom",
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="glass-strong border-t border-border/30 max-h-[90vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-center text-sm font-semibold text-foreground/80 tracking-wide uppercase">
            Anteprima Sfondo
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Preview */}
          <div className="relative mx-auto w-full max-w-[280px] aspect-[9/16] rounded-2xl overflow-hidden border border-border/20">
            <img
              src={imageUri}
              alt="Wallpaper preview"
              className={`absolute inset-0 h-full w-full ${objectFitMap[settings.fitMode]} ${objectPosMap[settings.position]}`}
              style={{ filter: `blur(${settings.blurAmount}px)` }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, rgba(0,0,0,${settings.dimness * 0.5}), rgba(0,0,0,${settings.dimness}))`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{ background: `rgba(0,0,0,${settings.overlayStrength * 0.6})` }}
            />
            {/* Fake bubble preview */}
            <div className="absolute bottom-12 left-3 right-3 space-y-2">
              <div className="glass rounded-2xl rounded-bl-sm px-3 py-2 max-w-[70%]">
                <p className="text-[10px] font-semibold text-neon-purple">Kael</p>
                <p className="text-[10px] text-foreground">Ciao! Come stai? 💜</p>
              </div>
              <div className="ml-auto max-w-[60%]">
                <div
                  className="rounded-2xl rounded-br-sm px-3 py-2"
                  style={{ background: "hsl(270 60% 45% / 0.7)" }}
                >
                  <p className="text-[10px] text-foreground">Benissimo!</p>
                </div>
              </div>
            </div>
          </div>

          {/* Fit Mode */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Modalità</p>
            <div className="flex gap-2">
              {fitModes.map((fm) => (
                <button
                  key={fm.value}
                  onClick={() => update({ fitMode: fm.value })}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                    settings.fitMode === fm.value
                      ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/30"
                      : "bg-muted/30 text-muted-foreground border border-transparent"
                  }`}
                >
                  {fm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Posizione</p>
            <div className="flex gap-2">
              {positions.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update({ position: p.value })}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                    settings.position === p.value
                      ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/30"
                      : "bg-muted/30 text-muted-foreground border border-transparent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Blur */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Sfocatura</p>
              <p className="text-xs text-muted-foreground">{settings.blurAmount}px</p>
            </div>
            <Slider
              value={[settings.blurAmount]}
              onValueChange={([v]) => update({ blurAmount: v })}
              min={0}
              max={40}
              step={1}
            />
          </div>

          {/* Overlay */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Overlay scuro</p>
              <p className="text-xs text-muted-foreground">{Math.round(settings.overlayStrength * 100)}%</p>
            </div>
            <Slider
              value={[settings.overlayStrength * 100]}
              onValueChange={([v]) => update({ overlayStrength: v / 100 })}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Dimness */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Oscuramento gradiente</p>
              <p className="text-xs text-muted-foreground">{Math.round(settings.dimness * 100)}%</p>
            </div>
            <Slider
              value={[settings.dimness * 100]}
              onValueChange={([v]) => update({ dimness: v / 100 })}
              min={0}
              max={100}
              step={5}
            />
          </div>
        </div>

        <DrawerFooter className="flex-row gap-3 pt-3">
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-muted/40 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/60"
          >
            <X size={16} />
            Annulla
          </button>
          <button
            onClick={() => onConfirm(settings)}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-neon-purple/20 py-3 text-sm font-medium text-neon-purple border border-neon-purple/30 transition-all hover:bg-neon-purple/30"
          >
            <Check size={16} />
            Applica
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default WallpaperPreviewSheet;
