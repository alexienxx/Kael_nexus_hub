import { Play, Pause, SkipBack, SkipForward, Music } from "lucide-react";
import type { SpotifyPlaybackState } from "@/lib/spotify/api";

interface SpotifyNowPlayingProps {
  playback: SpotifyPlaybackState | null;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const SpotifyNowPlaying = ({ playback, onPlay, onPause, onNext, onPrev }: SpotifyNowPlayingProps) => {
  if (!playback?.item) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Music size={20} className="text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/60">Nessuna riproduzione</p>
          <p className="text-[10px] text-muted-foreground">Avvia un brano su Spotify</p>
        </div>
      </div>
    );
  }

  const track = playback.item;
  const albumArt = track.album.images?.[0]?.url;
  const artists = track.artists.map((a) => a.name).join(", ");
  const progress = playback.progress_ms || 0;
  const duration = track.duration_ms;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        {albumArt ? (
          <img src={albumArt} alt={track.album.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 flex items-center justify-center rounded-lg bg-muted">
            <Music size={22} className="text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{track.name}</p>
          <p className="text-xs text-muted-foreground truncate">{artists}</p>
          <p className="text-[10px] text-muted-foreground/60 truncate">{track.album.name}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #1DB954, hsl(var(--neon-purple)))",
            }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground/60 font-mono">
          <span>{formatMs(progress)}</span>
          <span>{formatMs(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={onPrev} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <SkipBack size={18} />
        </button>
        <button
          onClick={playback.is_playing ? onPause : onPlay}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954] text-black transition-transform hover:scale-105 active:scale-95"
        >
          {playback.is_playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <button onClick={onNext} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
};

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default SpotifyNowPlaying;
