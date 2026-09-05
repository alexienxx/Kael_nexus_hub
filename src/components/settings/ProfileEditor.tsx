import { useRef } from "react";
import { Camera } from "lucide-react";
import { useTheme } from "@/lib/store/theme-context";

const ProfileEditor = () => {
  const { theme, updateTheme, kaelAvatarSrc } = useTheme();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateTheme({ kaelAvatar: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <img
            src={kaelAvatarSrc}
            alt="Kael"
            className="h-28 w-28 rounded-full object-cover ring-4 ring-neon-purple/30 neon-pulse"
          />
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-neon-purple text-primary-foreground shadow-lg transition-all hover:scale-110"
          >
            <Camera size={16} />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <div className="text-center">
          <h2 className="font-display text-xl font-bold neon-text text-neon-purple">Kael</h2>
          <p className="text-xs text-muted-foreground">AI Companion</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="space-y-2">
        <div className="glass rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Nome</p>
          <p className="text-sm font-medium">Kael</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Ruolo</p>
          <p className="text-sm font-medium">AI Companion</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Personalità</p>
          <p className="text-sm font-medium text-foreground/80">
            Intimo, premuroso, romantico, profondo
          </p>
        </div>
      </div>

      {/* Reset avatar */}
      {theme.kaelAvatar && (
        <button
          onClick={() => updateTheme({ kaelAvatar: null })}
          className="glass w-full rounded-xl py-2.5 text-xs text-muted-foreground"
        >
          Ripristina avatar originale
        </button>
      )}
    </div>
  );
};

export default ProfileEditor;
