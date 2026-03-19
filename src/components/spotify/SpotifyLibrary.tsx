import { useState, useEffect } from "react";
import { Loader2, Music, ListMusic } from "lucide-react";
import * as spotifyApi from "@/lib/spotify/api";
import SpotifyTrackItem from "./SpotifyTrackItem";

type LibraryView = "saved" | "playlists" | "recent";

interface SpotifyLibraryProps {
  onPlayTrack: (uri: string) => void;
}

const SpotifyLibrary = ({ onPlayTrack }: SpotifyLibraryProps) => {
  const [view, setView] = useState<LibraryView>("saved");
  const [loading, setLoading] = useState(false);
  const [savedTracks, setSavedTracks] = useState<spotifyApi.SpotifyTrackFull[]>([]);
  const [playlists, setPlaylists] = useState<spotifyApi.SpotifyPlaylist[]>([]);
  const [recentTracks, setRecentTracks] = useState<spotifyApi.SpotifyTrackFull[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<spotifyApi.SpotifyTrackFull[]>([]);

  const views: { id: LibraryView; label: string }[] = [
    { id: "saved", label: "Salvati" },
    { id: "playlists", label: "Playlist" },
    { id: "recent", label: "Recenti" },
  ];

  useEffect(() => {
    setLoading(true);
    setSelectedPlaylist(null);

    const load = async () => {
      try {
        if (view === "saved") {
          const res = await spotifyApi.getSavedTracks(30);
          setSavedTracks(res.items.map((i) => i.track));
        } else if (view === "playlists") {
          const res = await spotifyApi.getMyPlaylists(30);
          setPlaylists(res.items);
        } else if (view === "recent") {
          const res = await spotifyApi.getRecentlyPlayed(20);
          setRecentTracks(res.items.map((i) => i.track));
        }
      } catch (err) {
        console.error("Library fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [view]);

  const openPlaylist = async (id: string) => {
    setSelectedPlaylist(id);
    setLoading(true);
    try {
      const res = await spotifyApi.getPlaylistTracks(id, 50);
      setPlaylistTracks(res.items.map((i) => i.track));
    } catch (err) {
      console.error("Playlist tracks error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {views.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium transition-all ${
              view === id
                ? "bg-[#1DB954]/15 text-[#1DB954]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[#1DB954]/60" />
        </div>
      )}

      {!loading && view === "saved" && (
        <div className="space-y-0.5">
          {savedTracks.map((track) => (
            <SpotifyTrackItem key={track.id} track={track} onPlay={onPlayTrack} compact />
          ))}
          {savedTracks.length === 0 && (
            <EmptyState icon={<Music size={20} />} text="Nessun brano salvato" />
          )}
        </div>
      )}

      {!loading && view === "playlists" && !selectedPlaylist && (
        <div className="space-y-1">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => openPlaylist(pl.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-secondary/50"
            >
              {pl.images?.[0]?.url ? (
                <img src={pl.images[0].url} alt={pl.name} className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <ListMusic size={16} className="text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{pl.name}</p>
                <p className="text-[10px] text-muted-foreground">{pl.tracks.total} brani</p>
              </div>
            </button>
          ))}
          {playlists.length === 0 && (
            <EmptyState icon={<ListMusic size={20} />} text="Nessuna playlist" />
          )}
        </div>
      )}

      {!loading && view === "playlists" && selectedPlaylist && (
        <div className="space-y-1">
          <button
            onClick={() => setSelectedPlaylist(null)}
            className="text-[10px] text-[#1DB954] hover:underline mb-1 px-1"
          >
            ← Tutte le playlist
          </button>
          {playlistTracks.map((track) => (
            <SpotifyTrackItem key={track.id} track={track} onPlay={onPlayTrack} compact />
          ))}
        </div>
      )}

      {!loading && view === "recent" && (
        <div className="space-y-0.5">
          {recentTracks.map((track, i) => (
            <SpotifyTrackItem key={`${track.id}-${i}`} track={track} onPlay={onPlayTrack} compact />
          ))}
          {recentTracks.length === 0 && (
            <EmptyState icon={<Music size={20} />} text="Nessun brano recente" />
          )}
        </div>
      )}
    </div>
  );
};

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/50">
      {icon}
      <p className="text-xs">{text}</p>
    </div>
  );
}

export default SpotifyLibrary;
