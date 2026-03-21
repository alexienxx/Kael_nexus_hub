import { useState } from "react";
import { Shield } from "lucide-react";

export type NetharionState = "idle" | "warning" | "alert";

interface NetharionButtonProps {
  state?: NetharionState;
  onClick?: () => void;
}

const stateConfig: Record<NetharionState, { hue: number; sat: number; label: string }> = {
  idle:    { hue: 145, sat: 65, label: "sistema ok" },
  warning: { hue: 30,  sat: 85, label: "attenzione" },
  alert:   { hue: 0,   sat: 80, label: "allarme" },
};

const NetharionButton = ({ state: externalState, onClick }: NetharionButtonProps) => {
  const [internalState] = useState<NetharionState>("idle");
  const state = externalState ?? internalState;
  const cfg = stateConfig[state];

  return (
    <button
      onClick={onClick}
      className="netharion-btn group relative flex h-9 w-9 items-center justify-center rounded-full outline-none transition-transform active:scale-90"
      aria-label={`Netharion: ${cfg.label}`}
    >
      {/* Outer glow halo */}
      <span
        className="absolute inset-0 rounded-full netharion-pulse"
        style={{
          boxShadow: `0 0 8px 2px hsla(${cfg.hue},${cfg.sat}%,55%,0.45), 0 0 20px 4px hsla(${cfg.hue},${cfg.sat}%,55%,0.2)`,
        }}
      />
      {/* Core circle */}
      <span
        className="absolute inset-[2px] rounded-full transition-colors duration-700"
        style={{
          background: `radial-gradient(circle, hsla(${cfg.hue},${cfg.sat}%,55%,0.9) 0%, hsla(${cfg.hue},${cfg.sat - 10}%,35%,0.7) 100%)`,
          border: `1px solid hsla(${cfg.hue},${cfg.sat - 10}%,60%,0.4)`,
        }}
      />
      {/* Icon */}
      <Shield
        size={14}
        className="relative z-10 transition-colors duration-700"
        style={{ color: `hsla(${cfg.hue},100%,90%,0.9)` }}
      />
    </button>
  );
};

export default NetharionButton;
