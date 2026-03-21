import { Eye, EyeOff, Share2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { WallpaperKaelMode } from "@/types/wallpaper";

interface WallpaperKaelModeSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: WallpaperKaelMode) => void;
}

const modes: {
  value: WallpaperKaelMode;
  icon: typeof Eye;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    value: "wallpaper_only",
    icon: EyeOff,
    title: "Solo sfondo",
    description: "L'immagine è puramente visiva e locale. Kael non la riceve.",
    accent: "text-muted-foreground bg-muted/30",
  },
  {
    value: "share_once",
    icon: Share2,
    title: "Condividi una volta con Kael",
    description: "Kael può analizzare questa immagine una volta come contesto visivo, ma non viene mantenuta come contesto attivo.",
    accent: "text-neon-blue bg-neon-blue/15",
  },
  {
    value: "persistent_context",
    icon: Eye,
    title: "Mantieni come contesto visivo attivo",
    description: "L'immagine resta associata a questa conversazione come contesto visivo attivo finché non viene rimossa o sostituita.",
    accent: "text-neon-purple bg-neon-purple/15",
  },
];

const WallpaperKaelModeSheet = ({
  open,
  onClose,
  onSelect,
}: WallpaperKaelModeSheetProps) => {
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="glass-strong border-t border-border/30">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center text-sm font-semibold text-foreground/80 tracking-wide uppercase">
            Condivisione con Kael
          </DrawerTitle>
          <p className="text-center text-[11px] text-muted-foreground mt-1">
            Come vuoi che Kael utilizzi questo sfondo?
          </p>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-2">
          {modes.map(({ value, icon: Icon, title, description, accent }) => (
            <button
              key={value}
              onClick={() => { onSelect(value); onClose(); }}
              className="flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default WallpaperKaelModeSheet;
