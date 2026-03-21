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
import { Download, CheckCircle, AlertTriangle, Sparkles, X } from "lucide-react";
import type { UpdateManifest } from "@/lib/api/updates";
import { downloadApk } from "@/lib/api/updates";
import { APP_VERSION } from "@/lib/constants";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: UpdateManifest | null;
  forceUpdate?: boolean;
}

type DownloadState = "idle" | "downloading" | "success" | "error";

const UpdateDialog = ({ open, onOpenChange, manifest, forceUpdate }: UpdateDialogProps) => {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  if (!manifest) return null;

  const isForcedAndNotDone = (forceUpdate || manifest.force_update) && downloadState !== "success";

  const handleDownload = async () => {
    setDownloadState("downloading");
    setProgress(0);
    setError("");

    try {
      await downloadApk(manifest.apk_url, (p) => setProgress(p));
      setDownloadState("success");
    } catch (err: any) {
      setError(err?.message || "Download failed");
      setDownloadState("error");
    }
  };

  const handleClose = () => {
    setDownloadState("idle");
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={canDismiss ? onOpenChange : undefined}>
      <DialogContent
        className="glass border-border/30 max-w-sm mx-auto rounded-2xl"
        onPointerDownOutside={canDismiss ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={canDismiss ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Aggiornamento disponibile
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {manifest.app_name}
          </DialogDescription>
        </DialogHeader>

        {/* Version comparison */}
        <div className="flex items-center justify-center gap-3 py-2">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Attuale</p>
            <p className="text-sm font-mono font-medium text-foreground">{APP_VERSION}</p>
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-primary">Nuova</p>
            <p className="text-sm font-mono font-semibold text-primary">{manifest.latest_version}</p>
          </div>
        </div>

        {/* Changelog */}
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

        {/* Force update warning */}
        {manifest.force_update && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">
              Questo aggiornamento è obbligatorio per continuare a usare l'app.
            </p>
          </div>
        )}

        {/* Download progress */}
        {downloadState === "downloading" && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              Download in corso... {progress}%
            </p>
          </div>
        )}

        {/* Success state */}
        {downloadState === "success" && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-primary font-medium">Download completato!</p>
              <p className="text-[10px] text-muted-foreground">
                Apri il file scaricato per installare l'aggiornamento.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {downloadState === "error" && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {downloadState === "idle" && (
            <Button onClick={handleDownload} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Scarica e installa
            </Button>
          )}

          {downloadState === "error" && (
            <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
              <Download className="h-4 w-4" />
              Riprova
            </Button>
          )}

          {downloadState === "success" && (
            <Button onClick={handleClose} className="w-full gap-2">
              <CheckCircle className="h-4 w-4" />
              Chiudi
            </Button>
          )}

          {canDismiss && downloadState === "idle" && (
            <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground text-xs">
              Più tardi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateDialog;
