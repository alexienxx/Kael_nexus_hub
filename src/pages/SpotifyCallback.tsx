import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleSpotifyCallback } from "@/lib/spotify/auth";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";

/**
 * Handles the Spotify OAuth callback redirect.
 * Extracts the authorization code from the URL and exchanges it for tokens.
 */
const SpotifyCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const err = searchParams.get("error");

    if (err) {
      setStatus("error");
      setError(err === "access_denied" ? "Accesso negato dall'utente" : err);
      return;
    }

    if (!code) {
      setStatus("error");
      setError("Nessun codice di autorizzazione ricevuto");
      return;
    }

    handleSpotifyCallback(code)
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate("/media", { replace: true }), 1200);
      })
      .catch((e) => {
        setStatus("error");
        setError(e.message || "Errore durante il login");
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6">
      {status === "processing" && (
        <>
          <Loader2 size={36} className="animate-spin text-[#1DB954]" />
          <p className="text-sm text-muted-foreground">Connessione a Spotify...</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle size={36} className="text-[#1DB954]" />
          <p className="text-sm font-medium text-foreground">Spotify connesso!</p>
          <p className="text-xs text-muted-foreground">Reindirizzamento...</p>
        </>
      )}
      {status === "error" && (
        <>
          <AlertTriangle size={36} className="text-destructive" />
          <p className="text-sm font-medium text-foreground">Errore connessione</p>
          <p className="text-xs text-muted-foreground max-w-[260px] text-center">{error}</p>
          <button
            onClick={() => navigate("/media", { replace: true })}
            className="glass mt-4 rounded-full px-5 py-2 text-xs font-medium text-neon-purple"
          >
            Torna alla Media
          </button>
        </>
      )}
    </div>
  );
};

export default SpotifyCallback;
