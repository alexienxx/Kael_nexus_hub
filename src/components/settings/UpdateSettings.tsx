import { useState, useEffect } from "react";
import { RefreshCw, Download, ExternalLink, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkForUpdates,
  getManifestUrl,
  setManifestUrl,
  type UpdateCheckResult,
  readInstalledAppVersion,
  type InstalledAppVersion,
} from "@/lib/api/updates";
import { App as CapacitorApp } from "@capacitor/app";
import {
  checkNativeUpdatesNow, configureNativeUpdates, getNativeUpdateStatus, hasNewNativeUpdateOutcome, isNativeUpdatePlatform,
  nativeUpdateErrorCode, nativeUpdatesEnabled, nativeUpdateStateLabel, openNativeInstallSettings,
  setNativeUpdatesEnabled, type NativeUpdateStatus,
} from "@/lib/nativeUpdater";
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
  const [installed, setInstalled] = useState<InstalledAppVersion | null>(null);
  const [versionUnavailable, setVersionUnavailable] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<NativeUpdateStatus | null>(null);
  const [nativeError, setNativeError] = useState("");
  const [automaticEnabled, setAutomaticEnabled] = useState(nativeUpdatesEnabled);
  const native = isNativeUpdatePlatform();
  const [nativeCheckNotice, setNativeCheckNotice] = useState("");
  const [observingNative, setObservingNative] = useState<NativeUpdateStatus | null>(null);

  // Read the existing native owner only while this visible screen awaits a check.
  // Scheduling is not completion; no extra job, server poll or install is started.
  useEffect(() => {
    if (!observingNative) return;
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (notice: string) => {
      if (!active) return;
      active = false;
      clearTimeout(pollTimer);
      setNativeCheckNotice(notice); setObservingNative(null); setChecking(false);
    };
    const deadline = setTimeout(() => finish("Richiesta accettata da Android; nessun nuovo esito confermato in questa schermata. Android può eseguire il controllo più tardi."), 60_000);
    const poll = async () => {
      try {
        const status = await getNativeUpdateStatus();
        if (!active) return;
        setNativeStatus(status); setNativeError("");
        if (hasNewNativeUpdateOutcome(observingNative, status)) {
          finish("Nuovo stato verificato da Android, riportato sotto."); return;
        }
      } catch (e) {
        if (!active) return;
        setNativeError(nativeUpdateErrorCode(e));
        finish("Richiesta accettata da Android; il nuovo esito non è verificabile al momento."); return;
      }
      if (active) pollTimer = setTimeout(() => void poll(), 2_000);
    };
    pollTimer = setTimeout(() => void poll(), 1_000);
    const pause = () => finish("Richiesta accettata da Android. Osservazione sospesa mentre l'app non è in primo piano.");
    const visibility = () => { if (document.visibilityState === "hidden") pause(); };
    document.addEventListener("visibilitychange", visibility);
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (!isActive) pause(); });
    if (document.visibilityState === "hidden") pause();
    return () => {
      active = false; clearTimeout(deadline); clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", visibility);
      void listener.then((h) => h.remove()).catch(() => {});
    };
  }, [observingNative]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const info = await readInstalledAppVersion(); if (active) { setInstalled(info); setVersionUnavailable(false); } }
      catch { if (active) setVersionUnavailable(true); }
      if (native) {
        try { const status = await getNativeUpdateStatus(); if (active) { setNativeStatus(status); setNativeError(""); } }
        catch (e) { if (active) setNativeError(nativeUpdateErrorCode(e)); }
      }
    };
    void refresh();
    const listener = native ? CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void refresh(); }) : null;
    return () => { active = false; void listener?.then((h) => h.remove()).catch(() => {}); };
  }, [native]);

  // Listen for browserFinished — fires when the external browser is closed
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = Browser.addListener("browserFinished", () => {
      setLovableOpen(false);
      window.dispatchEvent(new Event("kael-content-refresh"));
    });
    return () => { void listener.then(h => h.remove()).catch(() => {}); };
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
    try { setManifestUrl(manifestUrl); setError(""); }
    catch { setError("UPDATE_URL_NOT_TRUSTED"); }
  };

  const handleNativeCheck = async () => {
    setChecking(true); setNativeError(""); setNativeCheckNotice("");
    let observing = false;
    try {
      const configured = await configureNativeUpdates();
      setNativeStatus(configured);
      if (!configured.enabled) {
        // An explicit manual request does not silently re-enable background work.
        await handleCheck(); return;
      }
      const scheduled = await checkNativeUpdatesNow();
      setNativeStatus(scheduled);
      setNativeCheckNotice("Richiesta accettata da Android. In attesa di un nuovo stato; la programmazione non conferma un controllo concluso.");
      if (hasNewNativeUpdateOutcome(configured, scheduled)) {
        setNativeCheckNotice("Nuovo stato verificato da Android, riportato sotto.");
      } else {
        setObservingNative(configured); observing = true;
      }
    } catch (e) { setNativeError(nativeUpdateErrorCode(e)); }
    finally { if (!observing) setChecking(false); }
  };
  const handleNativeToggle = async (enabled: boolean) => {
    setObservingNative(null); setNativeCheckNotice("");
    setAutomaticEnabled(enabled); setChecking(true); setNativeError("");
    try { setNativeStatus(await setNativeUpdatesEnabled(enabled)); }
    catch (e) { setNativeError(nativeUpdateErrorCode(e)); }
    finally { setChecking(false); }
  };
  const handleInstallPermission = async () => {
    try { await openNativeInstallSettings(); setNativeStatus(await getNativeUpdateStatus()); }
    catch (e) { setNativeError(nativeUpdateErrorCode(e)); }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Current version */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{installed?.source === "web_bundle" ? "Versione del client web" : "Versione installata"}</p>
            <p className="text-base font-mono font-semibold text-foreground">
              {installed?.version ?? (versionUnavailable ? "Non disponibile" : "Verifica in corso…")}
              {installed && <span className="text-xs text-muted-foreground ml-2">(build {installed.versionCode})</span>}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Download size={18} />
          </div>
        </div>

        {/* Last check result */}
        {result && !result.updateAvailable && (
          <div className="rounded-lg bg-primary/10 px-3 py-2">
            <p className="text-xs text-primary">Ultimo controllo: nessuna nuova versione sul server</p>
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

        {nativeCheckNotice && <p role="status" className="text-xs text-muted-foreground">{nativeCheckNotice}</p>}
        {nativeError && <p role="alert" className="text-xs text-destructive">Controllo non disponibile: {nativeError}</p>}
        <Button
          onClick={native ? handleNativeCheck : handleCheck}
          disabled={checking}
          variant="outline"
          className="w-full gap-2"
        >
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          {observingNative ? "In attesa di Android..." : checking ? "Controllo in corso..." : "Controlla aggiornamenti"}
        </Button>
      </div>

      {native && (
        <section className="glass rounded-xl p-4 space-y-3" aria-label="Aggiornamenti automatici Android">
          <label className="flex items-center justify-between gap-3 text-sm">
            Aggiornamenti in background
            <input type="checkbox" checked={automaticEnabled} disabled={checking && !observingNative}
              onChange={(e) => void handleNativeToggle(e.currentTarget.checked)} />
          </label>
          <p className="text-xs text-muted-foreground">
            Android programma i controlli periodici; servono una rete disponibile e il server raggiungibile tramite Tailscale o LAN.
          </p>
          {nativeStatus && <div role="status" className="space-y-1 text-xs">
            <p>{nativeUpdateStateLabel(nativeStatus.state)}</p>
            {nativeStatus.lastCheckedAt && <p>Ultimo controllo: {new Date(nativeStatus.lastCheckedAt).toLocaleString()}</p>}
            {nativeStatus.errorCode && <p className="font-mono">{nativeStatus.errorCode}</p>}
            <p className="text-muted-foreground">{nativeStatus.platformSupportsUnattended
              ? "Il sistema supporta il percorso senza conferma, ma Android può comunque richiedere un intervento."
              : "Questa versione di Android può richiedere una conferma per installare."}</p>
            {nativeStatus.platformSupportsUnattended && !nativeStatus.canRequestPackageInstalls && <Button variant="outline" onClick={() => void handleInstallPermission()}>
              Consenti installazioni da questa app
            </Button>}
            {nativeStatus.state === "user_action_required" && <p>Android richiede una conferma. Se compare un avviso di installazione, aprilo; altrimenti usa il download manuale.</p>}
          </div>}
          <Button variant="ghost" disabled={checking} onClick={handleCheck}>Verifica per download manuale</Button>
        </section>
      )}

      {/* Aggiorna contenuti via Lovable */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sito Lovable</p>
            <p className="text-[11px] text-muted-foreground">
              Apre il sito esterno; non aggiorna l'APK installata.
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
              placeholder="http://100.89.31.50:8002/app/update-check"
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Solo l'endpoint /app/update-check dello stesso backend configurato. Il controllo automatico Android usa le rotte note.
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
        currentVersion={result?.currentVersion}
      />
    </div>
  );
};

export default UpdateSettings;
