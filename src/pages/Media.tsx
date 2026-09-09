import { useState, useEffect, useCallback, useRef } from "react";
import { ImageIcon, Film, Music, Trash2, Save, RefreshCw, Loader2 } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import ImageViewer from "@/components/media/ImageViewer";
import TrackCard from "@/components/media/TrackCard";
import * as mediaApi from "@/lib/api/media";
import SpotifyMusicTab from "@/components/spotify/SpotifyMusicTab";
import type { GalleryApiItem } from "@/lib/api/media";
import { toast } from "sonner";

type MediaTab = "photos" | "videos" | "music";

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; message?: unknown };
  return candidate.status === 404 || (
    typeof candidate.message === "string" && candidate.message.includes("404")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Errore caricamento";
}

const Media = () => {
  const [activeTab, setActiveTab] = useState<MediaTab>("photos");
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const tabs: { id: MediaTab; label: string; icon: React.ElementType }[] = [
    { id: "photos", label: "Foto", icon: ImageIcon },
    { id: "videos", label: "Video", icon: Film },
    { id: "music", label: "Musica", icon: Music },
  ];

  return (
    <div className="flex h-full flex-col">
      <KaelHeader title="Media" subtitle="Foto, video e musica di Kael" showStatus={false} showBack />

      {/* Tabs */}
      <div className="relative z-10 flex gap-1 px-4 py-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all ${
              activeTab === id
                ? "glass text-neon-purple"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "photos" && <PhotosTab onImageClick={setViewerImage} />}
        {activeTab === "videos" && <VideosTab />}
        {activeTab === "music" && <SpotifyMusicTab />}
      </div>

      {viewerImage && (
        <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
};

// ─── Photos Tab — Kael-generated image gallery ─────────

function PhotosTab({ onImageClick }: { onImageClick: (url: string) => void }) {
  const [items, setItems] = useState<GalleryApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<GalleryApiItem | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mediaApi.getMediaGallery("image");
      setItems(res.items || []);
    } catch (e: unknown) {
      // 404 = gallery empty or not yet created → treat as empty, not error
      if (isNotFoundError(e)) {
        setItems([]);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLongPress = (item: GalleryApiItem, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let x: number, y: number;
    if ("touches" in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = (e as React.MouseEvent).clientX;
      y = (e as React.MouseEvent).clientY;
    }
    setContextPos({ x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 100) });
    setContextItem(item);
  };

  const handleDelete = async () => {
    if (!contextItem) return;
    try {
      await mediaApi.deleteGalleryItem(contextItem.id);
      setItems((prev) => prev.filter((i) => i.id !== contextItem.id));
      toast.success("Foto eliminata");
    } catch {
      toast.error("Errore eliminazione");
    }
    setContextItem(null);
  };

  const handleSaveToDevice = async () => {
    if (!contextItem) return;
    try {
      const url = await mediaApi.getGalleryFileUrl(contextItem.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kael-foto-${contextItem.id}.png`;
      a.click();
      toast.success("Download avviato");
      setContextItem(null);
    } catch {
      toast.error("Download non disponibile");
    }
  };

  const handleImageClick = async (item: GalleryApiItem) => {
    try {
      onImageClick(await mediaApi.getGalleryFileUrl(item.id));
    } catch {
      toast.error("Immagine non disponibile");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={24} className="animate-spin text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">Caricamento galleria...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-xs text-destructive">{error}</p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-neon-purple hover:underline">
          <RefreshCw size={12} /> Riprova
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <ImageIcon size={40} className="text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground/70">No photo storaged</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <GalleryThumbnail
            key={item.id}
            item={item}
            onClick={() => void handleImageClick(item)}
            onLongPress={(e) => handleLongPress(item, e)}
          />
        ))}
      </div>

      {/* Context menu */}
      {contextItem && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextItem(null)} onTouchStart={() => setContextItem(null)} />
          <div
            className="fixed z-[101] min-w-[180px] rounded-xl border border-border/50 bg-background/95 p-1 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95"
            style={{ left: contextPos.x, top: contextPos.y }}
          >
            <button
              onClick={handleSaveToDevice}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Save size={15} className="text-neon-purple" />
              Salva in galleria
            </button>
            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-accent"
            >
              <Trash2 size={15} />
              Elimina
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ─── Gallery Thumbnail with long-press ──────────────────

function GalleryThumbnail({
  item,
  onClick,
  onLongPress,
}: {
  item: GalleryApiItem;
  onClick: () => void;
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const timer = setTimeout(() => onLongPress(e), 500);
    timerRef.current = timer;
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const src = item.thumbnail
    ? item.thumbnail
    : item.url;

  return (
    <button
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(e); }}
      className="aspect-square overflow-hidden rounded-xl"
    >
      <img
        src={src}
        alt={item.caption || item.prompt || "Kael image"}
        className="h-full w-full object-cover transition-transform hover:scale-105"
        loading="lazy"
      />
    </button>
  );
}

// ─── Videos Tab — Kael-generated video gallery ──────────

function VideosTab() {
  const [items, setItems] = useState<GalleryApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<GalleryApiItem | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const longPressTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mediaApi.getMediaGallery("video");
      setItems(res.items || []);
    } catch (e: unknown) {
      // 404 = gallery empty or not yet created → treat as empty, not error
      if (isNotFoundError(e)) {
        setItems([]);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLongPress = (item: GalleryApiItem, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let x: number, y: number;
    if ("touches" in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = (e as React.MouseEvent).clientX;
      y = (e as React.MouseEvent).clientY;
    }
    setContextPos({ x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 100) });
    setContextItem(item);
  };

  const handleDelete = async () => {
    if (!contextItem) return;
    try {
      await mediaApi.deleteGalleryItem(contextItem.id);
      setItems((prev) => prev.filter((i) => i.id !== contextItem.id));
      toast.success("Video eliminato");
    } catch {
      toast.error("Errore eliminazione");
    }
    setContextItem(null);
  };

  const handleSaveToDevice = async () => {
    if (!contextItem) return;
    try {
      const url = await mediaApi.getGalleryFileUrl(contextItem.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kael-video-${contextItem.id}.mp4`;
      a.click();
      toast.success("Download avviato");
      setContextItem(null);
    } catch {
      toast.error("Download non disponibile");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={24} className="animate-spin text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">Caricamento video...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-xs text-destructive">{error}</p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-neon-purple hover:underline">
          <RefreshCw size={12} /> Riprova
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Film size={40} className="text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground/70">No video storaged</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="glass rounded-xl overflow-hidden"
            onContextMenu={(e) => { e.preventDefault(); handleLongPress(item, e); }}
            onTouchStart={(e) => {
              const timer = setTimeout(() => handleLongPress(item, e), 500);
              longPressTimersRef.current.set(item.id, timer);
            }}
            onTouchEnd={() => {
              const timer = longPressTimersRef.current.get(item.id);
              if (timer) clearTimeout(timer);
              longPressTimersRef.current.delete(item.id);
            }}
            onTouchCancel={() => {
              const timer = longPressTimersRef.current.get(item.id);
              if (timer) clearTimeout(timer);
              longPressTimersRef.current.delete(item.id);
            }}
          >
            <video
              src={item.url}
              controls
              className="w-full aspect-video"
              preload="metadata"
            />
            {(item.caption || item.prompt) && (
              <p className="px-3 py-2 text-xs text-foreground/70">
                {item.caption || item.prompt}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextItem && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextItem(null)} onTouchStart={() => setContextItem(null)} />
          <div
            className="fixed z-[101] min-w-[180px] rounded-xl border border-border/50 bg-background/95 p-1 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95"
            style={{ left: contextPos.x, top: contextPos.y }}
          >
            <button
              onClick={handleSaveToDevice}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Save size={15} className="text-neon-purple" />
              Salva in galleria
            </button>
            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-accent"
            >
              <Trash2 size={15} />
              Elimina
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default Media;
