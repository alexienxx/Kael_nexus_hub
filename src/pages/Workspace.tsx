import { useState } from "react";
import { FolderKanban, Target, BookOpen } from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import { useCapability } from "@/hooks/useCapability";
import { useSession } from "@/hooks/useSession";
import * as projectsApi from "@/lib/api/projects";

type WorkspaceTab = "projects" | "goals" | "reflections";

const Workspace = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("projects");
  const { sessionId } = useSession();

  const tabs: { id: WorkspaceTab; label: string; icon: React.ElementType }[] = [
    { id: "projects", label: "Progetti", icon: FolderKanban },
    { id: "goals", label: "Obiettivi", icon: Target },
    { id: "reflections", label: "Riflessioni", icon: BookOpen },
  ];

  return (
    <div className="flex h-full flex-col">
      <KaelHeader title="Workspace" subtitle="Progetti, obiettivi e riflessioni" showStatus={false} />

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
      {/* Never rendered — state is always "pending" */}
      <div />
    </CapabilityGuard>
  );
}

export default Workspace;
