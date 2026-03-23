/**
 * PHOTO GALLERY UPLOAD — "Foto Kael & Alexièn"
 *
 * ⚠️  AUTHORIZED USE ONLY ⚠️
 * This picker feeds ONLY the authorized local reference-images store for
 * the two registered identities: Alexièn (the user) and Kael (the AI).
 *
 * DO NOT generalize this component to generic photo galleries, third-party
 * face upload, face recognition, or reproduction of unauthorized individuals.
 *
 * Backend enforcement: _ALLOWED_IDENTITIES = {"kael", "alexien"} in
 *   kael_refactor/services/multimodal/photo_container.py
 * Disk path: state/vision/photo_container/{kael|alexien}/
 *
 * ENDPOINTS USED:
 *   POST   /multimodal/photos/upload          (multipart: file, identity, filename)
 *   GET    /multimodal/photos/list?identity=  (list stored reference photos)
 *   GET    /multimodal/photos/file/{id}/{nm}  (serve photo thumbnail directly)
 *   DELETE /multimodal/photos/file/{id}/{nm}  (remove reference photo)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { ImagePlus, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listReferencePhotos,
  uploadReferencePhoto,
  deleteReferencePhoto,
  referencePhotoUrl,
  type AuthorizedIdentity,
  type ContainerPhoto,
} from "@/lib/api/referencePhotos";

// ------------------------------------------------------------------ types
type Tab = AuthorizedIdentity; // "alexien" | "kael"

const TABS: { id: Tab; label: string }[] = [
  { id: "alexien", label: "Foto di Alexièn" },
  { id: "kael",    label: "Foto di Kael" },
];

// ------------------------------------------------------------------ helpers
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ------------------------------------------------------------------ component
const PhotoGalleryUpload = () => {
  const [activeTab, setActiveTab] = useState<Tab>("alexien");
  const [photos, setPhotos]       = useState<ContainerPhoto[]>([]);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- load from backend whenever identity tab changes
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listReferencePhotos(activeTab);
      setPhotos(res.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { reload(); }, [reload]);

  // ---- upload handler — file input → backend multipart
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // reset so same file can be re-picked
    if (!files.length) return;

    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: non è un'immagine`);
        fail++;
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: troppo grande (max 20 MB)`);
        fail++;
        continue;
      }
      try {
        await uploadReferencePhoto(activeTab, file);
        ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Upload fallito: ${msg}`);
        fail++;
      }
    }
    setUploading(false);

    if (ok > 0) {
      toast.success(`${ok} foto salvata${ok > 1 ? "e" : ""} per ${activeTab}`);
      await reload();
    }
    if (fail > 0 && ok === 0) {
      setError("Upload fallito. Assicurati che il backend sia attivo.");
    }
  };

  // ---- delete handler
  const handleDelete = async (photo: ContainerPhoto) => {
    try {
      await deleteReferencePhoto(photo.identity as AuthorizedIdentity, photo.name);
      toast(`Foto "${photo.name}" rimossa`);
      setPhotos((prev) => prev.filter((p) => p.name !== photo.name));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Eliminazione fallita: ${msg}`);
    }
  };

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-4 px-4 py-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Foto di riferimento
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Carica le foto di Alexièn e Kael. Il backend le usa come reference
          per generare immagini personalizzate coerenti con i vostri volti.
        </p>
      </div>

      {/* Identity tab selector */}
      <div className="flex gap-1 rounded-xl bg-muted/40 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 rounded-lg py-1.5 text-xs font-medium transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Existing photos */}
        {photos.map((photo) => {
          const url = referencePhotoUrl(
            photo.identity as AuthorizedIdentity,
            photo.name
          );
          return (
            <div
              key={photo.name}
              className="group relative aspect-square overflow-hidden rounded-xl bg-muted/30"
              title={`${photo.name}\n${formatBytes(photo.bytes)}`}
            >
              {url ? (
                <img
                  src={url}
                  alt={photo.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  no URL
                </div>
              )}
              <button
                onClick={() => handleDelete(photo)}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
                aria-label="Elimina foto"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {/* Loading placeholders */}
        {loading &&
          [0, 1, 2].map((i) => (
            <div
              key={`skel-${i}`}
              className="aspect-square animate-pulse rounded-xl bg-muted/40"
            />
          ))}

        {/* Add photo button */}
        {!loading && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/20 text-muted-foreground transition-all hover:border-neon-purple/40 hover:text-neon-purple active:scale-95 disabled:opacity-50"
          >
            {uploading ? (
              <RefreshCw size={22} className="animate-spin" />
            ) : (
              <>
                <ImagePlus size={22} />
                <span className="text-[10px]">Aggiungi</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Hidden file input — triggers Android file picker / Google Photos */}
      {/* On Android via Capacitor WebView, this opens the native photo picker  */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/60">
          {photos.length} foto · identità: <strong>{activeTab}</strong> · max 20 MB/foto
        </p>
        <button
          onClick={reload}
          disabled={loading}
          className="text-[10px] text-muted-foreground/60 underline hover:text-muted-foreground disabled:opacity-30"
        >
          aggiorna
        </button>
      </div>
    </div>
  );
};

export default PhotoGalleryUpload;

