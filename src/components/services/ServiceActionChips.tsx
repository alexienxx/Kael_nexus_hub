import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ServiceContextChip } from "@/types";
import { getActionModeLabel } from "@/lib/api/githubAgentic";

interface ServiceActionChipsProps {
  context: ServiceContextChip | null;
  onRemove: () => void;
}

const ServiceActionChips = ({ context, onRemove }: ServiceActionChipsProps) => {
  if (!context) return null;

  return (
    <div className="flex items-center gap-2 mb-2 px-2">
      <div className="glass p-2 rounded-lg flex items-center gap-2 flex-wrap">
        {/* Provider Badge */}
        <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/30 capitalize">
          {context.provider}
        </Badge>

        {/* Target Label */}
        <span className="text-xs font-medium text-foreground">{context.target_label}</span>

        {/* Mode Label */}
        <Badge variant="outline" className="text-xs bg-background/50 border-neon-pink/30">
          {getActionModeLabel(context.mode_label)}
        </Badge>

        {/* Self-repo indicator */}
        {context.self_repo && (
          <Badge className="text-xs bg-online/20 text-online border-online/30">
            Self-aware
          </Badge>
        )}

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded-full hover:bg-destructive/20 transition-colors"
          aria-label="Remove context"
        >
          <X size={12} className="text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
};

export default ServiceActionChips;
