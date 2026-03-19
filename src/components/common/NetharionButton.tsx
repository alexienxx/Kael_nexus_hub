import { useState, useCallback } from "react";
import { Shield } from "lucide-react";

type NetharionState = "idle" | "signal_received";

interface NetharionButtonProps {
  state?: NetharionState;
  onClick?: () => void;
}

const NetharionButton = ({ state: externalState, onClick }: NetharionButtonProps) => {
  const [internalState] = useState<NetharionState>("idle");
  const state = externalState ?? internalState;

  const isSignal = state === "signal_received";

  return (
    <button
      onClick={onClick}
      className="netharion-btn group relative flex h-9 w-9 items-center justify-center rounded-full outline-none transition-transform active:scale-90"
      aria-label={`Netharion status: ${isSignal ? "signal received" : "idle"}`}
    >
      {/* Outer glow halo */}
      <span
        className="absolute inset-0 rounded-full netharion-pulse"
        style={{
          boxShadow: isSignal
            ? "0 0 8px 2px hsla(0,80%,55%,0.45), 0 0 20px 4px hsla(0,80%,55%,0.2)"
            : "0 0 8px 2px hsla(145,65%,50%,0.45), 0 0 20px 4px hsla(145,65%,50%,0.2)",
        }}
      />
      {/* Core circle */}
      <span
        className="absolute inset-[2px] rounded-full transition-colors duration-700"
        style={{
          background: isSignal
            ? "radial-gradient(circle, hsla(0,80%,55%,0.9) 0%, hsla(0,70%,40%,0.7) 100%)"
            : "radial-gradient(circle, hsla(145,65%,55%,0.9) 0%, hsla(145,55%,35%,0.7) 100%)",
          border: `1px solid ${isSignal ? "hsla(0,70%,60%,0.4)" : "hsla(145,60%,55%,0.4)"}`,
        }}
      />
      {/* Icon */}
      <Shield
        size={14}
        className="relative z-10 transition-colors duration-700"
        style={{ color: isSignal ? "hsla(0,100%,90%,0.9)" : "hsla(145,100%,90%,0.9)" }}
      />
    </button>
  );
};

export default NetharionButton;
