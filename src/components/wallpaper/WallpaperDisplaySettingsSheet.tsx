import { RotateCcw } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { WallpaperDisplaySettings, BubbleWallpaperStyle } from "@/types/wallpaper";

interface WallpaperDisplaySettingsSheetProps {
  open: boolean;
  onClose: () => void;
  settings: WallpaperDisplaySettings;
  onUpdate: (partial: Partial<WallpaperDisplaySettings>) => void;
  onReset: () => void;
}

const bubbleStyles: { value: BubbleWallpaperStyle; label: string; desc: string }[] = [
  { value: "solid", label: "Solido", desc: "Bolle opache standard" },
  { value: "glass", label: "Vetro", desc: "Bolle trasparenti con sfocatura" },
  { value: "gradient", label: "Gradiente", desc: "Gradiente esteso nelle bolle" },
  { value: "tinted", label: "Tinta", desc: "Tinta adattiva dallo sfondo" },
];

const WallpaperDisplaySettingsSheet = ({
  open,
  onClose,
  settings,
  onUpdate,
  onReset,
}: WallpaperDisplaySettingsSheetProps) => {
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="glass-strong border-t border-border/30 max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-center text-sm font-semibold text-foreground/80 tracking-wide uppercase">
            Impostazioni Sfondo
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 space-y-5 overflow-y-auto max-h-[55vh] pb-2">
          {/* Blur */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-foreground/70">Sfocatura sfondo</p>
              <p className="text-xs text-muted-foreground">{settings.blurAmount}px</p>
            </div>
            <Slider
              value={[settings.blurAmount]}
              onValueChange={([v]) => onUpdate({ blurAmount: v })}
              min={0} max={40} step={1}
            />
          </div>

          {/* Overlay */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-foreground/70">Overlay scuro</p>
              <p className="text-xs text-muted-foreground">{Math.round(settings.overlayStrength * 100)}%</p>
            </div>
            <Slider
              value={[settings.overlayStrength * 100]}
              onValueChange={([v]) => onUpdate({ overlayStrength: v / 100 })}
              min={0} max={100} step={5}
            />
          </div>

          {/* Dimness gradient */}
          <div>
            <div className="flex justify-between mb-2">
              <p className="text-xs font-medium text-foreground/70">Oscuramento gradiente</p>
              <p className="text-xs text-muted-foreground">{Math.round(settings.dimness * 100)}%</p>
            </div>
            <Slider
              value={[settings.dimness * 100]}
              onValueChange={([v]) => onUpdate({ dimness: v / 100 })}
              min={0} max={100} step={5}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-border/20" />

          {/* Bubble blur toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground/70">Sfocatura dietro le bolle</p>
              <p className="text-[11px] text-muted-foreground">Applica blur dello sfondo dietro i messaggi</p>
            </div>
            <Switch
              checked={settings.bubbleBlurEnabled}
              onCheckedChange={(v) => onUpdate({ bubbleBlurEnabled: v })}
            />
          </div>

          {/* Extend gradient toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground/70">Estendi gradiente alle bolle</p>
              <p className="text-[11px] text-muted-foreground">Le bolle erediteranno l'atmosfera dello sfondo</p>
            </div>
            <Switch
              checked={settings.extendGradientToBubbles}
              onCheckedChange={(v) => onUpdate({ extendGradientToBubbles: v })}
            />
          </div>

          {/* Bubble style */}
          <div>
            <p className="text-xs font-medium text-foreground/70 mb-2">Stile bolle</p>
            <div className="grid grid-cols-2 gap-2">
              {bubbleStyles.map((bs) => (
                <button
                  key={bs.value}
                  onClick={() => onUpdate({ bubbleStyle: bs.value })}
                  className={`rounded-xl px-3 py-2.5 text-left transition-all ${
                    settings.bubbleStyle === bs.value
                      ? "bg-neon-purple/15 border border-neon-purple/30"
                      : "bg-muted/20 border border-transparent"
                  }`}
                >
                  <p className={`text-xs font-medium ${
                    settings.bubbleStyle === bs.value ? "text-neon-purple" : "text-foreground/70"
                  }`}>{bs.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{bs.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DrawerFooter className="pt-2">
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 rounded-xl bg-muted/30 py-3 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/50"
          >
            <RotateCcw size={14} />
            Ripristina predefiniti
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default WallpaperDisplaySettingsSheet;
