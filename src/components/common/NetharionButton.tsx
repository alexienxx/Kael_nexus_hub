import { Shield } from "lucide-react";
import { useLongPress } from "@/hooks/useLongPress";
import type { NetharionIndicatorState } from "@/hooks/useNetharion";

export type NetharionState = NetharionIndicatorState;

interface NetharionButtonProps {
  state?: NetharionState;
  onClick?: () => void;
  onLongPress?: () => void;
}

const stateConfig: Record<NetharionState, { hue: number; sat: number; label: string }> = {
  UNAVAILABLE:    { hue: 215, sat: 10, label: "modulo non operativo" },
  CLEAR:          { hue: 145, sat: 90, label: "nessun evento multiswarm rilevato" },
  WEAK_SIGNAL:    { hue: 32,  sat: 95, label: "segnale multiswarm debole, sotto soglia" },
  ADMITTED_EVENT: { hue: 0,   sat: 90, label: "evento multiswarm rilevato sopra soglia" },
};

const NetharionButton = ({ state = "UNAVAILABLE", onClick, onLongPress }: NetharionButtonProps) => {
  const cfg = stateConfig[state];
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress?.(),
    onPress: () => onClick?.(),
    delay: 500,
  });

  return (
    <button
      {...longPressHandlers}
      className="netharion-btn group relative flex h-9 w-9 items-center justify-center rounded-full outline-none transition-transform active:scale-90"
      aria-label={`Netharion: ${cfg.label}`}
    >
      <span
        className={`absolute inset-0 rounded-full ${state === "WEAK_SIGNAL" || state === "ADMITTED_EVENT" ? "netharion-pulse" : ""}`}
        style={{
          boxShadow: `0 0 8px 2px hsla(${cfg.hue},${cfg.sat}%,55%,0.45), 0 0 20px 4px hsla(${cfg.hue},${cfg.sat}%,55%,0.2)`,
        }}
      />
      <span
        className="absolute inset-[2px] rounded-full transition-colors duration-300"
        style={{
          background: `radial-gradient(circle, hsla(${cfg.hue},${cfg.sat}%,55%,0.9) 0%, hsla(${cfg.hue},${Math.max(0, cfg.sat - 10)}%,35%,0.7) 100%)`,
          border: `1px solid hsla(${cfg.hue},${Math.max(0, cfg.sat - 10)}%,60%,0.4)`,
        }}
      />
      <Shield size={14} className="relative z-10" style={{ color: `hsla(${cfg.hue},100%,90%,0.9)` }} />
    </button>
  );
};

export default NetharionButton;
