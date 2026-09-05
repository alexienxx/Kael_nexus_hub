import { useState, useEffect } from "react";
import { RefreshCw, Download, ExternalLink, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_VERSION, APP_VERSION_CODE, APP_NAME } from "@/lib/constants";
import {
  checkForUpdates,
  getManifestUrl,
  setManifestUrl,
  type UpdateCheckResult,
} from "@/lib/api/updates";
import UpdateDialog from "@/components/updates/UpdateDialog";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

const LOVABLE_URL = "https://0a6f887f-df8f-4066-86ec-c6471cdc96bc.lovableproject.com?forceHideBadge=true";

const UpdateSettings = () => {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manifestUrl, setManifestUrlLocal] = useState(getManifestUrl());
  const [lovableOpen, setLovableOpen] = useState(false);

  // Listen for browserFinished — fires when the external browser is closed
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = Browser.addListener("browserFinished", () => {
      setLovableOpen(false);
      window.dispatchEvent(new Event("kael-content-refresh"));
    });
    return () => { listener.then(h => h.remove()); };
  }, []);

  const handleOpenLovable = async () => {
    setLovableOpen(true);
    await Browser.open({ url: LOVABLE_URL });
  };

  const handleCheck = async () => {
    setChecking(true);
    setError("");
    setResult(null);

    try {
      const res = await checkForUpdates();
      setResult(res);
      if (res.updateAvailable) {
        setShowDialog(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante il controllo");
    } finally {
      setChecking(false);
    }
  };

  const handleSaveUrl = () => {
    setManifestUrl(manifestUrl);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Current version */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Versione installata</p>
            <p className="text-base font-mono font-semibold text-foreground">
              {APP_VERSION}
              <span className="text-xs text-muted-foreground ml-2">(build {APP_VERSION_CODE})</span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Download size={18} />
          </div>
        </div>

        {/* Last check result */}
        {result && !result.updateAvailable && (
          <div className="rounded-lg bg-primary/10 px-3 py-2">
            <p className="text-xs text-primary">✓ L'app è aggiornata</p>
          </div>
        )}

        {result && result.updateAvailable && result.manifest && (
          <div className="rounded-lg bg-primary/10 px-3 py-2">
            <p className="text-xs text-primary font-medium">
              Nuova versione disponibile: {result.manifest.latest_version}
            </p>
            <button
              onClick={() => setShowDialog(true)}
              className="text-[10px] text-primary/70 underline mt-1"
            >
              Mostra dettagli
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button
          onClick={handleCheck}
          disabled={checking}
          variant="outline"
          className="w-full gap-2"
        >
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          {checking ? "Controllo in corso..." : "Controlla aggiornamenti"}
        </Button>
      </div>

      {/* Aggiorna contenuti via Lovable */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Aggiorna contenuti</p>
            <p className="text-[11px] text-muted-foreground">
              Apre Lovable per sincronizzare aggiornamenti
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon-purple/15 text-neon-purple">
            <ExternalLink size={18} />
          </div>
        </div>
        <Button
          onClick={handleOpenLovable}
          disabled={lovableOpen}
          variant="outline"
          className="w-full gap-2"
        >
          <ExternalLink size={14} />
          {lovableOpen ? "Lovable aperto..." : "Apri Lovable"}
        </Button>
      </div>

      {/* Advanced: manifest URL config */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-between px-1 text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 size={12} />
          Configurazione avanzata
        </span>
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showAdvanced && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              URL Manifest aggiornamenti
            </label>
            <Input
              value={manifestUrl}
              onChange={(e) => setManifestUrlLocal(e.target.value)}
              placeholder="https://your-host.com/update-manifest.json"
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              URL del file JSON o endpoint che contiene le informazioni sull'ultima versione.
            </p>
          </div>
          <Button onClick={handleSaveUrl} variant="secondary" size="sm" className="w-full">
            Salva URL
          </Button>
        </div>
      )}

      {/* Update dialog */}
      <UpdateDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        manifest={result?.manifest ?? null}
      />
    </div>
  );
};

export default UpdateSettings;
