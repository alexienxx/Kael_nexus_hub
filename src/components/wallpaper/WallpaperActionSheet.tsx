import { ImagePlus, Trash2, SlidersHorizontal, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface WallpaperActionSheetProps {
  open: boolean;
  onClose: () => void;
  hasWallpaper: boolean;
  onChangeWallpaper: () => void;
  onRemoveWallpaper: () => void;
  onOpenDisplaySettings: () => void;
}

const WallpaperActionSheet = ({
  open,
  onClose,
  hasWallpaper,
  onChangeWallpaper,
  onRemoveWallpaper,
  onOpenDisplaySettings,
}: WallpaperActionSheetProps) => {
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="glass-strong border-t border-border/30">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center text-sm font-semibold text-foreground/80 tracking-wide uppercase">
            Sfondo Chat
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-1">
          <button
            onClick={() => { onChangeWallpaper(); onClose(); }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-purple/15">
              <ImagePlus size={18} className="text-neon-purple" />
            </div>
            <div className="text-left">
              <p>Cambia sfondo</p>
              <p className="text-[11px] text-muted-foreground">Scegli un'immagine dalla galleria</p>
            </div>
          </button>

          {hasWallpaper && (
            <button
              onClick={() => { onRemoveWallpaper(); onClose(); }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15">
                <Trash2 size={18} className="text-destructive" />
              </div>
              <div className="text-left">
                <p>Rimuovi sfondo</p>
                <p className="text-[11px] text-muted-foreground">Torna allo sfondo predefinito</p>
              </div>
            </button>
          )}

          {hasWallpaper && (
            <button
              onClick={() => { onOpenDisplaySettings(); onClose(); }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-blue/15">
                <SlidersHorizontal size={18} className="text-neon-blue" />
              </div>
              <div className="text-left">
                <p>Impostazioni visualizzazione</p>
                <p className="text-[11px] text-muted-foreground">Sfocatura, overlay, stile bolle</p>
              </div>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/30">
              <X size={18} />
            </div>
            <p>Chiudi</p>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default WallpaperActionSheet;
