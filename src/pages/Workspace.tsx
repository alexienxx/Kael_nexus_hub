import { useState } from "react";
import { FolderKanban, Target, BookOpen, Shield, HardDrive, Github, Calendar, MessageSquare, Loader2, Check, LogOut } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import { useCapability } from "@/hooks/useCapability";
import { useSession } from "@/hooks/useSession";
import * as projectsApi from "@/lib/api/projects";
import { useServices } from "@/hooks/useServices";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Service } from "@/types";

type WorkspaceTab = "services" | "projects" | "goals" | "reflections";

/* ── Provider visual config ──────────────────────────── */

const PROVIDER_CONFIG: Record<string, {
  icon: React.ElementType;
  iconClass: string;
  gradient: string;
  description: string;
}> = {
  drive: {
    icon: HardDrive,
    iconClass: "text-green-400",
    gradient: "from-green-500/20 to-green-400/5",
    description: "Autorizza Kael ad accedere a Google Drive",
  },
  github: {
    icon: Github,
    iconClass: "text-white",
    gradient: "from-gray-500/20 to-gray-400/5",
    description: "Autorizza Kael ad accedere ai tuoi repository",
  },
  calendar: {
    icon: Calendar,
    iconClass: "text-blue-400",
    gradient: "from-blue-500/20 to-blue-400/5",
    description: "Autorizza Kael a gestire il tuo calendario",
  },
  slack: {
    icon: MessageSquare,
    iconClass: "text-yellow-400",
    gradient: "from-yellow-500/20 to-yellow-400/5",
    description: "Autorizza Kael ad inviare messaggi su Slack",
  },
};

/** Fallback catalog — shown when backend is unavailable */
const FALLBACK_SERVICES: Service[] = [
  { id: "drive", provider: "drive", display_name: "Google Drive", icon: "", connection_status: "not_connected", capabilities: [] },
  { id: "github", provider: "github", display_name: "GitHub", icon: "", connection_status: "not_connected", capabilities: [] },
  { id: "calendar", provider: "calendar", display_name: "Google Calendar", icon: "", connection_status: "not_connected", capabilities: [] },
  { id: "slack", provider: "slack", display_name: "Slack", icon: "", connection_status: "not_connected", capabilities: [] },
];

/* ── Main component ──────────────────────────────────── */

const Workspace = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("services");
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);
  const { sessionId } = useSession();

  const {
    services,
    isLoading: servicesLoading,
    isBackendAvailable,
    connectService,
    disconnectService,
  } = useServices();

  const effectiveServices = services.length > 0
    ? services
    : (isBackendAvailable ? [] : FALLBACK_SERVICES);

  const handleConnect = async (provider: string) => {
    if (!isBackendAvailable) {
      toast.info("Backend non raggiungibile. Riavvia il server Kael.");
      return;
    }
    try {
      setConnectingProvider(provider);
      const response = await connectService(provider);
      if (response.error === "oauth_not_configured") {
        toast.error(`OAuth non configurato per ${provider}`);
        return;
      }
      if (response.auth_url) {
        window.open(response.auth_url, "_blank");
        toast.info("Completa il login nella nuova scheda");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connessione fallita");
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      setDisconnectingProvider(provider);
      await disconnectService(provider);
      toast.success(`Autorizzazione ${provider} revocata`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnessione fallita");
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const tabs: { id: WorkspaceTab; label: string; icon: React.ElementType }[] = [
    { id: "services", label: "Servizi", icon: Shield },
    { id: "projects", label: "Progetti", icon: FolderKanban },
    { id: "goals", label: "Obiettivi", icon: Target },
    { id: "reflections", label: "Riflessioni", icon: BookOpen },
  ];

  return (
    <div className="flex h-full flex-col">
      <KaelHeader
        title="Workspace"
        subtitle="Autorizzazioni e progetti"
        showStatus={false}
        showBack
      />

      {/* Tabs */}
      <div className="relative z-10 flex gap-1 px-4 py-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all ${
              activeTab === id
                ? "glass text-neon-purple"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "services" && (
          <AuthorizationsPanel
            loading={servicesLoading}
            backendAvailable={isBackendAvailable}
            services={effectiveServices}
            connectingProvider={connectingProvider}
            disconnectingProvider={disconnectingProvider}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        )}
        {activeTab === "projects" && <ProjectsTab sessionId={sessionId} />}
        {activeTab === "goals" && <GoalsTab sessionId={sessionId} />}
        {activeTab === "reflections" && <ReflectionsTab />}
      </div>
    </div>
  );
};

// ─── Projects Tab ───────────────────────────────────────

function ProjectsTab({ sessionId }: { sessionId: string }) {
  const capability = useCapability(
    () => projectsApi.getProjects(sessionId),
    {
      isEmpty: (data) => !data.projects || data.projects.length === 0,
    }
  );

  return (
    <CapabilityGuard
      state={capability.state}
      error={capability.error}
      onRetry={capability.retry}
      emptyLabel="Nessun progetto"
      emptyDescription="I tuoi progetti con Kael appariranno qui"
      emptyIcon={<FolderKanban size={24} className="text-muted-foreground/60" />}
    >
      <div className="space-y-3">
        {capability.data?.projects.map((project) => (
          <div key={project.id} className="glass rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {project.title}
                </h3>
                {project.description && (
                  <p className="mt-1 text-xs text-foreground/70 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
            {project.progress != null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Progresso</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-neon-purple/70 transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
            )}
            {project.tags && project.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-neon-purple/10 px-2 py-0.5 text-[10px] text-neon-purple"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </CapabilityGuard>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Attivo", className: "bg-neon-purple/15 text-neon-purple" },
    completed: { label: "Completato", className: "bg-online/15 text-online" },
    archived: { label: "Archiviato", className: "bg-muted text-muted-foreground" },
  };

  const c = config[status] || config.active;

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

// ─── Goals Tab ──────────────────────────────────────────

function GoalsTab({ sessionId }: { sessionId: string }) {
  const capability = useCapability(
    () => projectsApi.getGoals(sessionId),
    {
      isEmpty: (data) => !data.goals || data.goals.length === 0,
    }
  );

  return (
    <CapabilityGuard
      state={capability.state}
      error={capability.error}
      onRetry={capability.retry}
      emptyLabel="Nessun obiettivo"
      emptyDescription="I tuoi obiettivi con Kael appariranno qui"
      emptyIcon={<Target size={24} className="text-muted-foreground/60" />}
    >
      <div className="space-y-3">
        {capability.data?.goals.map((goal) => (
          <div key={goal.id} className="glass rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {goal.title}
                </h3>
                {goal.description && (
                  <p className="mt-1 text-xs text-foreground/70 line-clamp-2">
                    {goal.description}
                  </p>
                )}
              </div>
              <GoalStatusBadge status={goal.status} />
            </div>
            {goal.target_date && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                🎯 Scadenza: {new Date(goal.target_date).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
            {goal.milestones && goal.milestones.length > 0 && (
              <div className="mt-3 space-y-1">
                {goal.milestones.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-xs">
                    <div
                      className={`h-3 w-3 rounded-full border ${
                        m.completed
                          ? "border-online bg-online/30"
                          : "border-muted-foreground/30"
                      }`}
                    />
                    <span
                      className={
                        m.completed
                          ? "text-foreground/50 line-through"
                          : "text-foreground/80"
                      }
                    >
                      {m.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {goal.progress != null && (
              <div className="mt-3">
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-neon-purple/70 transition-all"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </CapabilityGuard>
  );
}

function GoalStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Attivo", className: "bg-neon-purple/15 text-neon-purple" },
    completed: { label: "Raggiunto", className: "bg-online/15 text-online" },
    paused: { label: "In pausa", className: "bg-muted text-muted-foreground" },
  };

  const c = config[status] || config.active;

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

// ─── Reflections Tab (PENDING BACKEND) ──────────────────

function ReflectionsTab() {
  const capability = useCapability(
    () => Promise.reject(new Error("not implemented")),
    { isPending: true }
  );

  return (
    <CapabilityGuard
      state={capability.state}
      error={capability.error}
      pendingLabel="Riflessioni"
      pendingDescription="La sezione riflessioni sarà disponibile quando il backend lo supporterà"
    >
      <div />
    </CapabilityGuard>
  );
}

// ─── Authorizations Panel (Services Tab) ────────────────
//
// Pannello autorizzazioni puro:
//   - Icona provider + nome + descrizione
//   - Stato connessione (authorized / not authorized)
//   - Bottone Autorizza / Revoca
//   - NESSUNA azione operativa — quelle le fa Kael in chat
//

interface AuthorizationsPanelProps {
  loading: boolean;
  backendAvailable: boolean;
  services: Service[];
  connectingProvider: string | null;
  disconnectingProvider: string | null;
  onConnect: (provider: string) => void;
  onDisconnect: (provider: string) => void;
}

function AuthorizationsPanel({
  loading,
  backendAvailable,
  services,
  connectingProvider,
  disconnectingProvider,
  onConnect,
  onDisconnect,
}: AuthorizationsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-1">
        <p className="text-xs text-muted-foreground">
          Autorizza Kael ad accedere ai servizi esterni. Le azioni saranno eseguite da Kael in chat.
        </p>
      </div>

      {/* Backend warning */}
      {!backendAvailable && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <p className="text-xs text-yellow-500/80">
            Backend non raggiungibile — le autorizzazioni non sono disponibili
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-neon-purple/60" />
        </div>
      )}

      {/* Service cards */}
      {!loading && services.map((svc) => {
        const config = PROVIDER_CONFIG[svc.provider];
        if (!config) return null;

        const Icon = config.icon;
        const isConnected = svc.connection_status === "connected";
        const isSlack = svc.provider === "slack";
        const isConnecting = connectingProvider === svc.provider;
        const isDisconnecting = disconnectingProvider === svc.provider;

        return (
          <div
            key={svc.id}
            className={`glass rounded-xl p-4 transition-all ${
              isSlack ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${config.gradient}`}>
                <Icon size={20} className={config.iconClass} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {svc.display_name}
                  </span>
                  {isConnected && (
                    <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
                      <Check size={10} />
                      Autorizzato
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {config.description}
                </p>
                {isConnected && svc.account_label && (
                  <p className="text-[11px] text-foreground/50 mt-0.5 truncate">
                    {svc.account_label}
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="shrink-0">
                {isSlack ? (
                  <span className="text-[10px] text-muted-foreground/60 font-medium">
                    Prossimamente
                  </span>
                ) : isConnected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => onDisconnect(svc.provider)}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <LogOut size={13} className="mr-1" />
                        Revoca
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10"
                    onClick={() => onConnect(svc.provider)}
                    disabled={isConnecting || !backendAvailable}
                  >
                    {isConnecting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Autorizza"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Workspace;
