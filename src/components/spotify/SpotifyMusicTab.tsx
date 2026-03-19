import { useState } from "react";
import { Music, LogIn, LogOut, Settings2 } from "lucide-react";
import { useSpotify } from "@/hooks/useSpotify";
import { startSpotifyLogin, getSpotifyClientId, setSpotifyClientId } from "@/lib/spotify/auth";
import SpotifyNowPlaying from "./SpotifyNowPlaying";
import SpotifyLibrary from "./SpotifyLibrary";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import { useCapability } from "@/hooks/useCapability";
import * as kaelSpotify from "@/lib/api/spotify";
import TrackCard from "@/components/media/TrackCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Combined Spotify Music Tab:
 * - Direct Spotify OAuth for library/playback
 * - Kael backend suggestions (if backend available)
 */
const SpotifyMusicTab = () => {
  const spotify = useSpotify();
  const [showConfig, setShowConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(getSpotifyClientId());

  // Kael backend suggestions (separate from direct Spotify)
  const kaelContext = useCapability(
    () => kaelSpotify.getSpotifyContext(),
    {
      isEmpty: (data) => !data.nowPlaying && (!data.suggestions || data.suggestions.length === 0),
    }
  );

  const handleSaveClientId = () => {
    setSpotifyClientId(clientIdInput);
    toast.success("Client ID salvato");
    setShowConfig(false);
    // Force re-check connection state
    spotify.setConnectionState(clientIdInput ? "disconnected" : "not_configured");
  };

  const handleLogin = async () => {
    try {
      await startSpotifyLogin();
    } catch (e: any) {
      toast.error(e.message || "Errore login Spotify");
    }
  };

  const handlePlayTrack = async (uri: string) => {
    try {
      await spotify.play({ uris: [uri] });
      toast.success("Riproduzione avviata");
    } catch (e: any) {
      toast.error("Apri Spotify su un dispositivo per riprodurre");
    }
  };

  // ─── Not Configured ────────────────────────────────────
  if (spotify.connectionState === "not_configured" || showConfig) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/15">
              <Music size={18} className="text-[#1DB954]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Configura Spotify</p>
              <p className="text-[10px] text-muted-foreground">Inserisci il Client ID della tua Spotify App</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Spotify Client ID</label>
            <Input
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="es. 1a2b3c4d5e6f..."
              className="text-xs font-mono"
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Crea un'app su developer.spotify.com e copia il Client ID. Aggiungi{" "}
              <span className="font-mono text-foreground/60">{window.location.origin}/spotify-callback</span>{" "}
              come Redirect URI.
            </p>
          </div>

          <Button onClick={handleSaveClientId} className="w-full" size="sm">
            Salva
          </Button>
        </div>

        {/* Kael suggestions even without direct connection */}
        <KaelSuggestions kaelContext={kaelContext} />
      </div>
    );
  }

  // ─── Not Logged In ─────────────────────────────────────
  if (spotify.connectionState === "disconnected") {
    return (
      <div className="space-y-4">
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/15">
                <Music size={18} className="text-[#1DB954]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Spotify</p>
                <p className="text-[10px] text-muted-foreground">Non connesso</p>
              </div>
            </div>
            <button onClick={() => setShowConfig(true)} className="p-2 text-muted-foreground hover:text-foreground">
              <Settings2 size={14} />
            </button>
          </div>

          <Button onClick={handleLogin} className="w-full gap-2 bg-[#1DB954] hover:bg-[#1DB954]/90 text-black" size="sm">
            <LogIn size={14} />
            Accedi con Spotify
          </Button>
        </div>

        <KaelSuggestions kaelContext={kaelContext} />
      </div>
    );
  }

  // ─── Connected ─────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-[#1DB954]" />
          <span>Spotify connesso</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowConfig(true)} className="p-1.5 text-muted-foreground/50 hover:text-foreground">
            <Settings2 size={12} />
          </button>
          <button onClick={spotify.disconnect} className="p-1.5 text-muted-foreground/50 hover:text-destructive">
            <LogOut size={12} />
          </button>
        </div>
      </div>

      {/* Now Playing */}
      <SpotifyNowPlaying
        playback={spotify.playback}
        onPlay={() => spotify.play()}
        onPause={spotify.pause}
        onNext={spotify.next}
        onPrev={spotify.prev}
      />

      {/* Library */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground px-1">La tua libreria</p>
        <SpotifyLibrary onPlayTrack={handlePlayTrack} />
      </div>

      {/* Kael suggestions */}
      <KaelSuggestions kaelContext={kaelContext} />
    </div>
  );
};

// ─── Kael Backend Suggestions ───────────────────────────

function KaelSuggestions({ kaelContext }: { kaelContext: ReturnType<typeof useCapability<any>> }) {
  if (kaelContext.state !== "available" || !kaelContext.data) return null;

  const ctx = kaelContext.data;

  return (
    <div className="space-y-3">
      {ctx.nowPlaying && (
        <div className="glass rounded-xl p-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">🎵 Kael sta ascoltando</p>
          <TrackCard
            title={ctx.nowPlaying.title}
            artist={ctx.nowPlaying.artist}
            albumArt={ctx.nowPlaying.albumArt}
            spotifyUrl={ctx.nowPlaying.spotifyUrl}
          />
        </div>
      )}

      {ctx.suggestions?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">💜 Suggeriti da Kael</p>
          <div className="space-y-2">
            {ctx.suggestions.map((track: any, i: number) => (
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

export default SpotifyMusicTab;
