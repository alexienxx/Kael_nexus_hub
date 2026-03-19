import { Music, ExternalLink } from "lucide-react";
import type { SpotifyTrackFull } from "@/lib/spotify/api";

interface SpotifyTrackItemProps {
  track: SpotifyTrackFull;
  onPlay?: (uri: string) => void;
  compact?: boolean;
}

const SpotifyTrackItem = ({ track, onPlay, compact }: SpotifyTrackItemProps) => {
  const albumArt = track.album.images?.[track.album.images.length > 1 ? 1 : 0]?.url;
  const artists = track.artists.map((a) => a.name).join(", ");

  return (
    <button
      onClick={() => onPlay?.(track.uri)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-secondary/50 active:scale-[0.98]"
    >
      {albumArt ? (
        <img
          src={albumArt}
          alt={track.album.name}
          className={`shrink-0 rounded-lg object-cover ${compact ? "h-10 w-10" : "h-12 w-12"}`}
          loading="lazy"
        />
      ) : (
        <div className={`shrink-0 flex items-center justify-center rounded-lg bg-muted ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
          <Music size={16} className="text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium text-foreground ${compact ? "text-xs" : "text-sm"}`}>
          {track.name}
        </p>
        <p className={`truncate text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
          {artists}
        </p>
      </div>
      {track.external_urls?.spotify && (
        <a
          href={track.external_urls.spotify}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1 text-muted-foreground/40 hover:text-[#1DB954]"
        >
          <ExternalLink size={12} />
        </a>
      )}
    </button>
  );
};

export default SpotifyTrackItem;
