import { useTheme, themePresets, bubbleStylePresets } from "@/lib/store/theme";
import { useRef } from "react";

const ThemeCustomizer = () => {
  const { theme, updateTheme, resetTheme } = useTheme();
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateTheme({ backgroundImage: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Presets */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {themePresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => updateTheme(preset.settings)}
              className="glass rounded-xl p-3 text-left transition-all hover:scale-[1.02]"
            >
              <div
                className="mb-2 h-8 w-full rounded-lg"
                style={{
                  background: `linear-gradient(135deg, hsl(${preset.settings.accentHue} 80% 55%), hsl(${(preset.settings.accentHue || 270) + 30} 70% 45%))`,
                }}
              />
              <p className="text-xs font-medium">{preset.name}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Accent Color */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Colore Accento
        </h3>
        <div className="glass rounded-xl p-4">
          <input
            type="range"
            min={0}
            max={360}
            value={theme.accentHue}
            onChange={(e) => updateTheme({ accentHue: parseInt(e.target.value) })}
            className="w-full accent-neon-purple"
            style={{
              background: `linear-gradient(to right, hsl(0 80% 55%), hsl(60 80% 55%), hsl(120 80% 55%), hsl(180 80% 55%), hsl(240 80% 55%), hsl(300 80% 55%), hsl(360 80% 55%))`,
              height: "6px",
              borderRadius: "3px",
            }}
          />
          <div
            className="mt-2 h-6 w-full rounded-lg"
            style={{ background: `hsl(${theme.accentHue} ${theme.accentSaturation}% 60%)` }}
          />
        </div>
      </section>

      {/* Bubble Color */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Colore Bolle
        </h3>
        <div className="glass rounded-xl p-4">
          <input
            type="range"
            min={0}
            max={360}
            value={theme.bubbleColorHue}
            onChange={(e) => updateTheme({ bubbleColorHue: parseInt(e.target.value) })}
            className="w-full"
            style={{
              background: `linear-gradient(to right, hsl(0 60% 45%/0.7), hsl(60 60% 45%/0.7), hsl(120 60% 45%/0.7), hsl(180 60% 45%/0.7), hsl(240 60% 45%/0.7), hsl(300 60% 45%/0.7), hsl(360 60% 45%/0.7))`,
              height: "6px",
              borderRadius: "3px",
            }}
          />
          <div
            className="mt-2 h-8 rounded-lg"
            style={{
              background: `linear-gradient(135deg, hsl(${theme.bubbleColorHue} 60% 45% / 0.7), hsl(${theme.bubbleColorHue + 15} 50% 40% / 0.5))`,
            }}
          />
        </div>
      </section>

      {/* Bubble Shape */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Forma Bolle
        </h3>
        <div className="flex gap-2">
          {bubbleStylePresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => updateTheme({ bubbleStyle: preset.id, bubbleRadius: preset.radius })}
              className={`flex-1 py-2 text-xs font-medium transition-all ${
                theme.bubbleStyle === preset.id
                  ? "glass text-neon-purple ring-1 ring-neon-purple/30"
                  : "glass text-muted-foreground"
              }`}
              style={{ borderRadius: `${preset.radius}px` }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      {/* Transparency */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Trasparenza Sfondo
        </h3>
        <div className="glass rounded-xl p-4">
          <input
            type="range"
            min={0}
            max={100}
            value={theme.backgroundOpacity * 100}
            onChange={(e) => updateTheme({ backgroundOpacity: parseInt(e.target.value) / 100 })}
            className="w-full accent-neon-purple"
          />
          <p className="mt-1 text-[10px] text-muted-foreground text-right">
            {Math.round(theme.backgroundOpacity * 100)}%
          </p>
        </div>
      </section>

      {/* Blur */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Intensità Blur
        </h3>
        <div className="glass rounded-xl p-4">
          <input
            type="range"
            min={0}
            max={50}
            value={theme.blurStrength}
            onChange={(e) => updateTheme({ blurStrength: parseInt(e.target.value) })}
            className="w-full accent-neon-purple"
          />
          <p className="mt-1 text-[10px] text-muted-foreground text-right">
            {theme.blurStrength}px
          </p>
        </div>
      </section>

      {/* Audio bar style */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Stile Audio
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(["bars", "wave", "dots", "minimal"] as const).map((style) => (
            <button
              key={style}
              onClick={() => updateTheme({ audioBarStyle: style })}
              className={`glass rounded-xl py-2 text-xs font-medium capitalize transition-all ${
                theme.audioBarStyle === style
                  ? "text-neon-purple ring-1 ring-neon-purple/30"
                  : "text-muted-foreground"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </section>

      {/* Background image */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Sfondo Chat
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => bgInputRef.current?.click()}
            className="glass flex-1 rounded-xl py-2.5 text-xs font-medium text-neon-purple"
          >
            Carica immagine
          </button>
          {theme.backgroundImage && (
            <button
              onClick={() => updateTheme({ backgroundImage: null })}
              className="glass rounded-xl px-3 py-2.5 text-xs text-muted-foreground"
            >
              Reset
            </button>
          )}
        </div>
        <input
          ref={bgInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBgUpload}
        />
      </section>

      {/* Notification sound */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Suono Notifiche
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {["gentle", "chime", "whisper"].map((sound) => (
            <button
              key={sound}
              onClick={() => updateTheme({ notificationSound: sound })}
              className={`glass rounded-xl py-2 text-xs font-medium capitalize transition-all ${
                theme.notificationSound === sound
                  ? "text-neon-purple ring-1 ring-neon-purple/30"
                  : "text-muted-foreground"
              }`}
            >
              {sound}
            </button>
          ))}
        </div>
      </section>

      {/* Reset */}
      <button
        onClick={resetTheme}
        className="glass w-full rounded-xl py-3 text-xs font-medium text-destructive transition-all hover:bg-destructive/10"
      >
        Reset a Default
      </button>

      <div className="h-4" />
    </div>
  );
};

export default ThemeCustomizer;
