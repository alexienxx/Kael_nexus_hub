/**
 * Section 10: Advanced Raw / Debug View
 */

import { useState } from "react";
import { useRawDebug } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { Copy, Check, ChevronDown, ChevronRight, Code } from "lucide-react";
import type { DataFreshness } from "@/lib/api/observatory";

/**
 * Map provenance strings from the backend ("runtime", "persisted", "computed", etc.)
 * to DataFreshness values used by FreshnessBadge.
 * The backend sends provenance strings that don't match DataFreshness directly.
 */
function provenanceToFreshness(prov: string): DataFreshness {
  const p = (prov ?? "").toLowerCase();
  if (p === "live" || p === "runtime") return "live";
  if (p === "persisted" || p === "stale" || p === "cached") return "stale";
  if (p === "computed" || p === "derived") return "computed";
  return "unavailable";
}

function ProvenanceBadge({ provenance }: { provenance: string }) {
  const freshness = provenanceToFreshness(provenance);
  const STYLES: Record<DataFreshness, string> = {
    live: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stale: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    unavailable: "bg-red-500/20 text-red-400 border-red-500/30",
    computed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STYLES[freshness]}`}>
      {provenance}
    </span>
  );
}

export default function DebugSection() {
  const { state, data, error, retry } = useRawDebug();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Debug View non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Source names */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">Sorgenti Dati</h3>
        <div className="flex flex-wrap gap-1">
          {d.source_names.map((s) => (
            <span key={s} className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-foreground/70">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* State owners */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">State Owners</h3>
        <div className="space-y-1">
          {Object.entries(d.state_owners).map(([key, owner]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="font-mono text-foreground/70">{key}</span>
              <span className="text-muted-foreground">{owner}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Provenance */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">Provenienza Dati</h3>
        <div className="space-y-1">
          {Object.entries(d.provenance).map(([key, prov]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="font-mono text-foreground/70 truncate flex-1 mr-2">{key}</span>
              <ProvenanceBadge provenance={String(prov)} />
            </div>
          ))}
        </div>
      </div>

      {/* Raw JSON sections */}
      <div className="space-y-2">
        {Object.entries(d.sections).map(([sectionName, sectionData]) => (
          <JsonBlock key={sectionName} title={sectionName} data={sectionData} />
        ))}
      </div>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Code size={12} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </button>
      {expanded && (
        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded bg-muted hover:bg-muted/80 transition-colors z-10"
            aria-label="Copia JSON"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-muted-foreground" />}
          </button>
          <pre className="p-3 pt-1 text-[10px] font-mono text-foreground/70 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed">
            {jsonStr}
          </pre>
        </div>
      )}
    </div>
  );
}
