import { useState } from "react";
import { ImageIcon, Film, Music } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import ImageViewer from "@/components/media/ImageViewer";
import TrackCard from "@/components/media/TrackCard";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import { useCapability } from "@/hooks/useCapability";
import * as mediaApi from "@/lib/api/media";
import * as spotifyApi from "@/lib/api/spotify";

type MediaTab = "photos" | "videos" | "music";

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
      <KaelHeader title="Media" subtitle="Foto, video e musica" showStatus={false} />

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
        {activeTab === "music" && <MusicTab />}
      </div>

      {viewerImage && (
        <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
};

// ─── Photos Tab ─────────────────────────────────────────

function PhotosTab({ onImageClick }: { onImageClick: (url: string) => void }) {
  const capability = useCapability(
    () => mediaApi.getMediaGallery("image"),
    {
      isEmpty: (data) => !data.items || data.items.length === 0,
    }
  );

  return (
    <CapabilityGuard
      state={capability.state}
      error={capability.error}
      onRetry={capability.retry}
      emptyLabel="Nessuna foto"
      emptyDescription="Le foto condivise con Kael appariranno qui"
      emptyIcon={<ImageIcon size={24} className="text-muted-foreground/60" />}
    >
      <div className="grid grid-cols-3 gap-2">
        {capability.data?.items.map((item) => (
          <button
            key={item.id}
            onClick={() => onImageClick(item.url)}
            className="aspect-square overflow-hidden rounded-xl"
          >
            <img
              src={item.thumbnail || item.url}
              alt={item.caption || ""}
              className="h-full w-full object-cover transition-transform hover:scale-105"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </CapabilityGuard>
  );
}

// ─── Videos Tab (capability-dependent) ──────────────────

function VideosTab() {
  const capability = useCapability(
    () => mediaApi.getMediaGallery("video"),
    {
      isEmpty: (data) => !data.items || data.items.length === 0,
    }
  );

  // If we got data with items, show them
  if (capability.state === "available" && capability.data?.items.length) {
    return (
      <div className="space-y-3">
        {capability.data.items.map((item) => (
          <div key={item.id} className="glass rounded-xl overflow-hidden">
            <video
              src={item.url}
              poster={item.thumbnail}
              controls
              className="w-full aspect-video"
            />
            {item.caption && (
              <p className="px-3 py-2 text-xs text-foreground/70">{item.caption}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // For all non-available states, show the video request UI with capability state
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Film size={40} className="text-muted-foreground/40" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/70">Video di Kael</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {capability.state === "unavailable"
            ? "Connetti il backend per richiedere video avatar"
            : capability.state === "error"
            ? "Impossibile verificare la disponibilità video"
            : capability.state === "loading"
            ? "Verifica disponibilità..."
            : "Richiedi un video avatar a Kael"}
        </p>
      </div>
      <button
        disabled={capability.state === "unavailable" || capability.state === "loading"}
        onClick={() => {
          mediaApi.requestAvatarVideo().catch(() => {
            // Handled by capability system on next refresh
          });
        }}
        className="glass rounded-full px-5 py-2 text-xs font-medium text-neon-purple transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
      >
        {capability.state === "loading" ? "Verifica..." : "Richiedi video"}
      </button>
      {capability.state === "error" && capability.error && (
        <button
          onClick={capability.retry}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Riprova
        </button>
      )}
    </div>
  );
}

// ─── Music / Spotify Tab ────────────────────────────────

function MusicTab() {
  const contextCapability = useCapability(
    () => spotifyApi.getSpotifyContext(),
    {
      isEmpty: (data) => !data.nowPlaying && (!data.suggestions || data.suggestions.length === 0),
    }
  );

  const stateCapability = useCapability(
    () => spotifyApi.getSpotifyState(),
    { autoFetch: true }
  );

  // Spotify not available at all
  if (contextCapability.state === "unavailable") {
    return (
      <CapabilityGuard
        state="unavailable"
        error={contextCapability.error}
        onRetry={contextCapability.retry}
        unavailableLabel="Spotify non disponibile"
        unavailableDescription="Configura il backend per accedere alla musica"
      >
        <div />
      </CapabilityGuard>
    );
  }

  if (contextCapability.state === "pending") {
    return (
      <CapabilityGuard
        state="pending"
        pendingLabel="Integrazione Spotify"
        pendingDescription="L'integrazione Spotify sarà disponibile a breve"
      >
        <div />
      </CapabilityGuard>
    );
  }

  if (contextCapability.state === "loading") {
    return (
      <CapabilityGuard state="loading" loadingLabel="Caricamento musica...">
        <div />
      </CapabilityGuard>
    );
  }

  if (contextCapability.state === "error") {
    return (
      <CapabilityGuard
        state="error"
        error={contextCapability.error}
        onRetry={contextCapability.retry}
        errorLabel="Errore Spotify"
      >
        <div />
      </CapabilityGuard>
    );
  }

  if (contextCapability.state === "empty") {
    return (
      <CapabilityGuard
        state="empty"
        emptyLabel="Nessun brano"
        emptyDescription="Kael non sta riproducendo musica al momento"
        emptyIcon={<Music size={24} className="text-muted-foreground/60" />}
      >
        <div />
      </CapabilityGuard>
    );
  }

  // Available — render real data
  const ctx = contextCapability.data!;

  return (
    <div className="space-y-3">
      {/* Connection badge */}
      {stateCapability.state === "available" && stateCapability.data && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              stateCapability.data.connected ? "bg-online" : "bg-muted-foreground"
            }`}
          />
          <span>{stateCapability.data.connected ? "Spotify connesso" : "Spotify non connesso"}</span>
        </div>
      )}

      {/* Now playing */}
      {ctx.nowPlaying && (
        <div className="glass rounded-xl p-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">🎵 In ascolto</p>
          <TrackCard
            title={ctx.nowPlaying.title}
            artist={ctx.nowPlaying.artist}
            albumArt={ctx.nowPlaying.albumArt}
            spotifyUrl={ctx.nowPlaying.spotifyUrl}
          />
        </div>
      )}

      {/* Suggestions */}
      {ctx.suggestions && ctx.suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            💜 Suggeriti da Kael
          </p>
          <div className="space-y-2">
            {ctx.suggestions.map((track, i) => (
              <TrackCard
                key={i}
                title={track.title}
                artist={track.artist}
                albumArt={track.albumArt}
                spotifyUrl={track.spotifyUrl}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Media;
