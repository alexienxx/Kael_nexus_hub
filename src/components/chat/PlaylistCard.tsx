import SpotifyIcon from "@/components/common/SpotifyIcon";

export interface PlaylistCardData {
  name: string;
  description?: string;
  coverArt?: string;
  trackCount?: number;
  spotifyUrl?: string;
  createdByKael?: boolean;
}

interface PlaylistCardProps {
  playlist: PlaylistCardData;
}

const PlaylistCard = ({ playlist }: PlaylistCardProps) => {
  const handleOpen = () => {
    if (playlist.spotifyUrl) {
      // Try deep link first on mobile
      const isCapacitor = !!(window as any).Capacitor;
      if (isCapacitor) {
        // Convert web URL to spotify URI if possible
        const match = playlist.spotifyUrl.match(/playlist\/([a-zA-Z0-9]+)/);
        if (match) {
          window.location.href = `spotify://playlist/${match[1]}`;
          setTimeout(() => window.open(playlist.spotifyUrl!, "_blank"), 1500);
          return;
        }
      }
      window.open(playlist.spotifyUrl, "_blank");
    }
  };

  return (
    <div className="glass overflow-hidden rounded-xl transition-all hover:scale-[1.01]">
      <div className="flex items-center gap-3 p-3">
        {playlist.coverArt ? (
          <img
            src={playlist.coverArt}
            alt={playlist.name}
            className="h-14 w-14 rounded-lg object-cover shadow-lg"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/30 to-green-600/10">
            <SpotifyIcon size={24} className="text-green-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{playlist.name}</p>
          {playlist.description && (
            <p className="truncate text-xs text-muted-foreground mt-0.5">{playlist.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {playlist.trackCount != null && (
              <span className="text-[10px] text-muted-foreground/70">{playlist.trackCount} brani</span>
            )}
            {playlist.createdByKael && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-medium text-primary">
                Creata da Kael 💜
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleOpen}
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1.5 text-[10px] font-medium text-green-400 transition-all hover:bg-green-500/25 active:scale-95"
        >
          <SpotifyIcon size={12} />
          Apri
        </button>
      </div>
    </div>
  );
};

export default PlaylistCard;
