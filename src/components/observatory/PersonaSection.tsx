/**
 * Section 7: Manifest / Persona / Model Routing
 */

import { usePersonaRouting } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending, WarningBanner } from "./shared";
import { User, Layers, AlertTriangle, Check, Shuffle } from "lucide-react";

export default function PersonaSection() {
  const { state, data, error, retry } = usePersonaRouting();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Persona Routing non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />
      <WarningBanner warnings={d.mismatch_warnings} />

      {/* Active persona + manifest */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <User size={14} />
            <span className="text-[10px] uppercase tracking-wider">Persona Attiva</span>
          </div>
          <p className="text-sm font-bold text-foreground">{d.active_persona ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <Layers size={14} />
            <span className="text-[10px] uppercase tracking-wider">Manifest Attivo</span>
          </div>
          <p className="text-sm font-bold text-foreground">{d.active_manifest ?? "—"}</p>
        </div>
      </div>

      {/* Blend info */}
      {d.blend_active && (
        <div className="rounded-lg border border-neon-pink/30 bg-neon-pink/5 p-3">
          <div className="flex items-center gap-1.5 text-neon-pink mb-2">
            <Shuffle size={14} />
            <span className="text-xs font-semibold">Blending Attivo</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {d.blend_components.map((c) => (
              <span key={c} className="rounded-full border border-neon-pink/30 bg-neon-pink/10 px-2 py-0.5 text-[10px] text-neon-pink">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fallback */}
      {d.fallback_active && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-xs text-amber-300">Fallback persona attivo</span>
        </div>
      )}

      {/* Manifest usage table */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3">Utilizzo Manifest</h3>
        <div className="space-y-2">
          {d.manifests
            .sort((a, b) => b.usage_count - a.usage_count)
            .map((m) => (
              <div key={m.manifest_id} className={`flex items-center gap-2 text-xs p-2 rounded ${m.is_current ? "bg-primary/10 border border-primary/20" : ""}`}>
                {m.is_current && <Check size={12} className="text-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-foreground">{m.label}</span>
                  <span className="ml-1 text-[9px] text-muted-foreground font-mono">{m.manifest_id}</span>
                </div>
                <span className="font-mono text-muted-foreground shrink-0">{m.usage_count}×</span>
              </div>
            ))}
        </div>
      </div>

      {/* System blocks */}
      {d.system_blocks_included.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">System Blocks Inclusi</h3>
          <div className="flex flex-wrap gap-1">
            {d.system_blocks_included.map((b) => (
              <span key={b} className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-foreground/70">
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Routing priority */}
      {d.routing_priority.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Priorità Routing</h3>
          <ol className="space-y-1">
            {d.routing_priority.map((r, i) => (
              <li key={r} className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}.</span>
                <span className="text-foreground/80">{r}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
