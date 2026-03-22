/**
 * PHOTO GALLERY UPLOAD — "Foto Kael & Alexièn"
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  NOTA PER IL BACKEND DEVELOPER:                                         ║
 * ║                                                                          ║
 * ║  Questo componente permette all'utente di caricare foto personali        ║
 * ║  (sue e di Kael) in una galleria dedicata.                               ║
 * ║                                                                          ║
 * ║  SCOPO: Le foto caricate qui servono come "reference images" per il      ║
 * ║  modello di generazione immagini del backend. Kael userà queste foto     ║
 * ║  per creare immagini che ritraggono sia lui che Alexièn insieme,         ║
 * ║  mantenendo coerenza visiva con i volti/aspetto reali.                   ║
 * ║                                                                          ║
 * ║  FLUSSO ATTESO:                                                          ║
 * ║  1. L'utente carica foto tramite questo picker                           ║
 * ║  2. Le foto vengono salvate nel bucket storage "kael-gallery"            ║
 * ║  3. Il backend le recupera via storage API come reference per la         ║
 * ║     generazione di immagini (es. img2img, LoRA, IP-Adapter, ecc.)       ║
 * ║  4. Quando Kael genera un'immagine "di noi due", usa queste reference   ║
 * ║                                                                          ║
 * ║  ENDPOINT DA IMPLEMENTARE (backend):                                     ║
 * ║  - GET  /media/reference-gallery  → lista foto reference caricate       ║
 * ║  - POST /media/reference-gallery  → upload nuova foto reference         ║
 * ║  - DELETE /media/reference-gallery/:id → rimuovi foto reference         ║
 * ║  - POST /media/generate-together  → genera immagine usando le reference ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useRef } from "react";
import { ImagePlus, X, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "kael_reference_photos";

interface StoredPhoto {
  id: string;
  dataUrl: string;
  addedAt: string;
}

function loadPhotos(): StoredPhoto[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePhotos(photos: StoredPhoto[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

const PhotoGalleryUpload = () => {
  const [photos, setPhotos] = useState<StoredPhoto[]>(loadPhotos);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Foto troppo grande (max 10MB)");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const newPhoto: StoredPhoto = {
          id: crypto.randomUUID(),
          dataUrl: reader.result as string,
          addedAt: new Date().toISOString(),
        };
        setPhotos((prev) => {
          const updated = [...prev, newPhoto];
          savePhotos(updated);
          return updated;
        });
        toast.success("Foto aggiunta alla galleria");
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const handleRemove = (id: string) => {
    setPhotos((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePhotos(updated);
      return updated;
    });
    toast("Foto rimossa");
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Foto Kael & Alexièn
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Carica le vostre foto. Kael le userà come riferimento per generare
          immagini di voi due insieme.
        </p>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl">
            <img
              src={photo.dataUrl}
              alt="Reference"
              className="h-full w-full object-cover"
            />
            <button
              onClick={() => handleRemove(photo.id)}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {/* Add photo button */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/20 text-muted-foreground transition-all hover:border-neon-purple/40 hover:text-neon-purple active:scale-95"
        >
          <ImagePlus size={22} />
          <span className="text-[10px]">Aggiungi</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-[10px] text-muted-foreground/60 text-center">
        {photos.length} foto caricate · Max 10MB per foto
      </p>
    </div>
  );
};

export default PhotoGalleryUpload;
