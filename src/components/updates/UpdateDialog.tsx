import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, ExternalLink, AlertTriangle, Sparkles } from "lucide-react";
import type { UpdateManifest } from "@/lib/api/updates";
import { downloadApk } from "@/lib/api/updates";
import { APP_NAME } from "@/lib/constants";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: UpdateManifest | null;
  forceUpdate?: boolean;
  currentVersion?: string;
}

type DownloadState = "idle" | "downloading" | "browser_opened" | "browser_download_requested" | "error";

const UpdateDialog = ({ open, onOpenChange, manifest, forceUpdate, currentVersion }: UpdateDialogProps) => {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  if (!manifest) return null;

  const handedOff = downloadState === "browser_opened" || downloadState === "browser_download_requested";
  const isForcedAndNotDone = (forceUpdate || manifest.force_update) && !handedOff;

  const handleDownload = async () => {
    setDownloadState("downloading");
    setProgress(0);
    setError("");

    try {
      const handoff = await downloadApk(manifest.apk_url, (p) => setProgress(p), manifest);
      setDownloadState(handoff.kind);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
      setDownloadState("error");
    }
  };

  const handleClose = () => {
    setDownloadState("idle");
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={isForcedAndNotDone ? undefined : handleClose}>
      <DialogContent
        className="glass border-border/30 max-w-sm mx-auto rounded-2xl"
        onPointerDownOutside={isForcedAndNotDone ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isForcedAndNotDone ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Aggiornamento disponibile
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {APP_NAME}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-2">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Attuale</p>
            <p className="text-sm font-mono font-medium text-foreground">{currentVersion ?? "Non verificata"}</p>
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-primary">Nuova</p>
            <p className="text-sm font-mono font-semibold text-primary">{manifest.latest_version}</p>
          </div>
        </div>

        {manifest.changelog.length > 0 && (
          <div className="rounded-xl bg-secondary/50 p-3 max-h-32 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Novità</p>
            <ul className="space-y-1">
              {manifest.changelog.map((item, i) => (
                <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {manifest.force_update && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">
              Questo aggiornamento è obbligatorio per continuare a usare l'app.
            </p>
          </div>
        )}

        {downloadState === "downloading" && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              Download in corso... {progress}%
            </p>
          </div>
        )}

        {handedOff && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
            <ExternalLink className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-primary font-medium">
                {downloadState === "browser_opened" ? "Browser aperto" : "Salvataggio affidato al browser"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Il browser gestisce il file. L'installazione non è confermata dall'app.
              </p>
            </div>
          </div>
        )}

        {downloadState === "error" && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {downloadState === "idle" && (
            <>
              <Button onClick={handleDownload} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Scarica APK
              </Button>
              {!isForcedAndNotDone && (
                <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground text-xs">
                  Installa dopo
                </Button>
              )}
            </>
          )}

          {downloadState === "error" && (
            <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
              <Download className="h-4 w-4" />
              Riprova
            </Button>
          )}

          {handedOff && (
            <Button onClick={handleClose} className="w-full gap-2">
              <ExternalLink className="h-4 w-4" />
              Chiudi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateDialog;
