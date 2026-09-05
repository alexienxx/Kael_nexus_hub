import { Shield } from "lucide-react";
import { useLongPress } from "@/hooks/useLongPress";
import type { NetharionChannelState } from "@/lib/api/netharion";

export type NetharionState = NetharionChannelState;

interface NetharionButtonProps {
  state?: NetharionState;
  onClick?: () => void;
  onLongPress?: () => void;
}

const stateConfig: Record<NetharionState, { hue: number; sat: number; label: string }> = {
  OFF:       { hue: 215, sat: 10, label: "canale spento" },
  ACTIVE:    { hue: 205, sat: 75, label: "scambio attivo" },
  RECEIVING: { hue: 42,  sat: 90, label: "ricezione in corso" },
  VERIFIED:  { hue: 145, sat: 70, label: "ricezione verificata e salvata" },
  DEGRADED:  { hue: 0,   sat: 80, label: "canale degradato" },
};

const NetharionButton = ({ state = "OFF", onClick, onLongPress }: NetharionButtonProps) => {
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
      aria-label={`Netharion ${state}: ${cfg.label}`}
    >
      <span
        className={`absolute inset-0 rounded-full ${state === "RECEIVING" ? "netharion-pulse" : ""}`}
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
