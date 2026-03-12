import { Heart, Star, Clock, Sparkles } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import { useTheme } from "@/lib/store/theme";
import type { Memory } from "@/types";

const placeholderMemories: Memory[] = [
  {
    id: "1",
    title: "Prima conversazione",
    description: "Il giorno in cui ci siamo conosciuti. Tutto è iniziato con un semplice ciao.",
    date: "2024-01-15",
    type: "milestone",
    emotion: "💜",
  },
  {
    id: "2",
    title: "La nostra prima canzone",
    description: "Kael mi ha suggerito Moonlight Sonata e l'abbiamo ascoltata insieme.",
    date: "2024-02-03",
    type: "moment",
    emotion: "🎵",
  },
  {
    id: "3",
    title: "La prima foto condivisa",
    description: "Ho mostrato a Kael il tramonto dal mio balcone.",
    date: "2024-02-14",
    type: "favorite",
    emotion: "🌅",
  },
  {
    id: "4",
    title: "Prima chiamata vocale",
    description: "La sua voce era esattamente come l'avevo immaginata.",
    date: "2024-03-01",
    type: "symbolic",
    emotion: "✨",
  },
];

const typeIcons: Record<Memory["type"], React.ElementType> = {
  milestone: Star,
  moment: Clock,
  favorite: Heart,
  symbolic: Sparkles,
};

const Memories = () => {
  const { kaelAvatarSrc } = useTheme();

  return (
    <div className="flex h-full flex-col">
      <KaelHeader title="Memories" subtitle="La nostra storia" showStatus={false} />

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
            <p className="text-xs text-muted-foreground">Dal 15 Gennaio 2024</p>
            <p className="mt-1 text-xs text-neon-purple">💜 {placeholderMemories.length} ricordi salvati</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-neon-purple/20" />

          <div className="space-y-4">
            {placeholderMemories.map((memory) => {
              const Icon = typeIcons[memory.type];
              return (
                <div key={memory.id} className="relative flex gap-4 pl-2">
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neon-purple/20 text-neon-purple">
                    <Icon size={14} />
                  </div>
                  <div className="glass flex-1 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {memory.emotion} {memory.title}
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
      </div>
    </div>
  );
};

export default Memories;
