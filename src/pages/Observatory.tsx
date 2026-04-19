/**
 * Kael Cognitive Observatory
 *
 * Main page with horizontally scrollable tabs for all 10 introspection sections.
 * Each section connects to real backend endpoints via useObservatory hooks.
 */

import { useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import KaelHeader from "@/components/layout/KaelHeader";
import { useBackendConnection } from "@/context/BackendConnectionContext";
import {
  Activity, Gauge, Fingerprint, Brain, Heart,
  Database, User, Package, Zap, Code, Shield, StickyNote
} from "lucide-react";

// Lazy-loaded sections for code splitting
import OverviewSection from "@/components/observatory/OverviewSection";
import WeightsSection from "@/components/observatory/WeightsSection";
import IdentitySection from "@/components/observatory/IdentitySection";
import DecisionsSection from "@/components/observatory/DecisionsSection";
import EmotionalSection from "@/components/observatory/EmotionalSection";
import MemorySection from "@/components/observatory/MemorySection";
import PersonaSection from "@/components/observatory/PersonaSection";
import ModulesSection from "@/components/observatory/ModulesSection";
import EventsSection from "@/components/observatory/EventsSection";
import DebugSection from "@/components/observatory/DebugSection";
import AuditSection from "@/components/observatory/AuditSection";
import InnerSheetsSection from "@/components/observatory/InnerSheetsSection";

const TABS = [
  { id: "overview", label: "Overview", icon: Activity, component: OverviewSection },
  { id: "weights", label: "Weights", icon: Gauge, component: WeightsSection },
  { id: "identity", label: "Identity", icon: Fingerprint, component: IdentitySection },
  { id: "decisions", label: "Decisions", icon: Brain, component: DecisionsSection },
  { id: "emotional", label: "Emotional", icon: Heart, component: EmotionalSection },
  { id: "memory", label: "Memory", icon: Database, component: MemorySection },
  { id: "persona", label: "Persona", icon: User, component: PersonaSection },
  { id: "modules", label: "Modules", icon: Package, component: ModulesSection },
  { id: "events", label: "Events", icon: Zap, component: EventsSection },
  { id: "debug", label: "Debug", icon: Code, component: DebugSection },
  { id: "audit", label: "Audit", icon: Shield, component: AuditSection },
  { id: "inner", label: "Inner", icon: StickyNote, component: InnerSheetsSection },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Observatory() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { state: lifecycleState, message: lifecycleMessage } = useBackendConnection();

  const ActiveComponent = TABS.find((t) => t.id === activeTab)!.component;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <KaelHeader
        title="Cognitive Observatory"
        showBack
        lifecycleState={lifecycleState}
        lifecycleMessage={lifecycleMessage}
      />

      {/* Scrollable tab bar */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <ScrollArea className="w-full">
          <div className="flex gap-0.5 px-2 py-1.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  activeTab === id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
