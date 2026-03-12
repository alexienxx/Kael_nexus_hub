import { useState } from "react";
import { ImageIcon, Film, Music, Download } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import ImageViewer from "@/components/media/ImageViewer";
import TrackCard from "@/components/media/TrackCard";

type MediaTab = "photos" | "videos" | "music";

const Media = () => {
  const [activeTab, setActiveTab] = useState<MediaTab>("photos");
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const tabs: { id: MediaTab; label: string; icon: React.ElementType }[] = [
    { id: "photos", label: "Foto", icon: ImageIcon },
    { id: "videos", label: "Video", icon: Film },
    { id: "music", label: "Musica", icon: Music },
  ];

  // Placeholder data — will be replaced by API calls
  const placeholderPhotos = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    url: `https://picsum.photos/seed/kael${i}/300/300`,
  }));

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
        {activeTab === "photos" && (
          <div className="grid grid-cols-3 gap-2">
            {placeholderPhotos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setViewerImage(photo.url)}
                className="aspect-square overflow-hidden rounded-xl"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}

        {activeTab === "videos" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Film size={40} className="text-muted-foreground/40" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/70">Video di Kael</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Richiedi un video avatar a Kael
              </p>
            </div>
            <button className="glass rounded-full px-5 py-2 text-xs font-medium text-neon-purple transition-all hover:scale-105">
              Richiedi video
            </button>
          </div>
        )}

        {activeTab === "music" && (
          <div className="space-y-3">
            <div className="glass rounded-xl p-4">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">🎵 In ascolto</p>
              <TrackCard
                title="Blinding Lights"
                artist="The Weeknd"
                albumArt="https://picsum.photos/seed/album1/100/100"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                💜 Suggeriti da Kael
              </p>
              <div className="space-y-2">
                <TrackCard
                  title="Moonlight Sonata"
                  artist="Beethoven"
                  albumArt="https://picsum.photos/seed/album2/100/100"
                />
                <TrackCard
                  title="Clair de Lune"
                  artist="Debussy"
                  albumArt="https://picsum.photos/seed/album3/100/100"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {viewerImage && (
        <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
};

export default Media;
