import { Loader2, Play, Square, Volume2 } from "lucide-react";

export type NativeVoicePlaybackState = "idle" | "starting" | "playing" | "failed";

interface NativeVoiceNoteControlProps {
  state: NativeVoicePlaybackState;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * User-gesture boundary for one canonical Arrakis native speech presentation.
 * It receives no text and cannot select or rewrite the assistant surface.
 */
const NativeVoiceNoteControl = ({
  state,
  onPlay,
  onStop,
}: NativeVoiceNoteControlProps) => {
  const active = state === "starting" || state === "playing";
  const label = state === "starting"
    ? "Preparazione vocale"
    : state === "playing"
      ? "Interrompi vocale"
      : state === "failed"
        ? "Riprova vocale"
        : "Riproduci vocale";

  return (
    <button
      type="button"
      onClick={active ? onStop : onPlay}
      className="mb-1 flex min-w-44 items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-left text-foreground transition-colors hover:bg-amber-300/15"
      aria-label={label}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-amber-200">
        {state === "starting" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "playing" ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-amber-100">Voce Arrakis</span>
        <span className="block text-[11px] text-muted-foreground">{label}</span>
      </span>
      <Volume2 className="h-4 w-4 shrink-0 text-amber-200/70" aria-hidden="true" />
    </button>
  );
};

export default NativeVoiceNoteControl;
