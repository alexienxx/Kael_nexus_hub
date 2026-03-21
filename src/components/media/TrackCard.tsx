import SpotifyIcon from "@/components/common/SpotifyIcon";

interface TrackCardProps {
  title: string;
  artist: string;
  albumArt?: string;
  spotifyUrl?: string;
  personalMessage?: string;
}

const TrackCard = ({ title, artist, albumArt, spotifyUrl, personalMessage }: TrackCardProps) => {
  const handleOpen = () => {
    if (!spotifyUrl) return;
    const isCapacitor = !!(window as any).Capacitor;
    if (isCapacitor) {
      const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
      if (match) {
        window.location.href = `spotify://track/${match[1]}`;
        setTimeout(() => window.open(spotifyUrl, "_blank"), 1500);
        return;
      }
    }
    window.open(spotifyUrl, "_blank");
  };

  return (
    <div className="glass overflow-hidden rounded-xl transition-all hover:scale-[1.01]">
      {personalMessage && (
        <p className="px-3 pt-2.5 text-xs italic text-muted-foreground">"{personalMessage}"</p>
      )}
      <div className="flex items-center gap-3 p-3">
        {albumArt ? (
          <img src={albumArt} alt={title} className="h-12 w-12 rounded-lg object-cover shadow-lg" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/30 to-green-600/10">
            <SpotifyIcon size={20} className="text-green-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{artist}</p>
        </div>
        {spotifyUrl && (
          <button
            onClick={handleOpen}
            className="shrink-0 flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1.5 text-[10px] font-medium text-green-400 transition-all hover:bg-green-500/25 active:scale-95"
          >
            <SpotifyIcon size={12} />
            Apri
          </button>
        )}
      </div>
    </div>
  );
};

export default TrackCard;
