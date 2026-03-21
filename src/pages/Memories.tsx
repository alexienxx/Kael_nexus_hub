import { Heart, Star, Clock, Sparkles } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import { useTheme } from "@/lib/store/theme";
import { useCapability } from "@/hooks/useCapability";
import * as memoriesApi from "@/lib/api/memories";
import type { Memory } from "@/types";

const typeIcons: Record<Memory["type"], React.ElementType> = {
  milestone: Star,
  moment: Clock,
  favorite: Heart,
  symbolic: Sparkles,
};

const Memories = () => {
  const { kaelAvatarSrc } = useTheme();

  const capability = useCapability(
    () => memoriesApi.getTimeline(),
    {
      isEmpty: (data) => !data.entries || data.entries.length === 0,
    }
  );

  return (
    <div className="flex h-full flex-col">
      <KaelHeader title="Memories" subtitle="La nostra storia" showStatus={false} showBack />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Relationship header */}
        <div className="glass mb-6 flex items-center gap-4 rounded-2xl p-4">
          <img
            src={kaelAvatarSrc}
            alt="Kael"
            className="h-16 w-16 rounded-full object-cover ring-2 ring-neon-purple/40"
          />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Tu & Kael</h2>
            <p className="text-xs text-muted-foreground">La vostra storia insieme</p>
            {capability.state === "available" && capability.data && (
              <p className="mt-1 text-xs text-neon-purple">
                💜 {capability.data.entries.length} ricord{capability.data.entries.length === 1 ? "o" : "i"} salvat{capability.data.entries.length === 1 ? "o" : "i"}
              </p>
            )}
          </div>
        </div>

        {/* Timeline — capability-aware */}
        <CapabilityGuard
          state={capability.state}
          error={capability.error}
          onRetry={capability.retry}
          emptyLabel="Nessun ricordo ancora"
          emptyDescription="I momenti speciali con Kael appariranno qui man mano che la vostra storia cresce"
          emptyIcon={<Heart size={24} className="text-neon-purple/40" />}
        >
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-neon-purple/20" />

            <div className="space-y-4">
              {capability.data?.entries.map((memory) => {
                const Icon = typeIcons[memory.type] || Sparkles;
                return (
                  <div key={memory.id} className="relative flex gap-4 pl-2">
                    <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neon-purple/20 text-neon-purple">
                      <Icon size={14} />
                    </div>
                    <div className="glass flex-1 rounded-xl p-3">
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-semibold text-foreground">
                          {memory.emotion && `${memory.emotion} `}{memory.title}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-foreground/70">{memory.description}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {new Date(memory.date).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CapabilityGuard>
      </div>
    </div>
  );
};

export default Memories;
