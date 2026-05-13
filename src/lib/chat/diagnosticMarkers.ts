export type DiagnosticSeverity = "info" | "warning" | "critical";

export interface DiagnosticMarkerResult {
  cleanText: string;
  markers: string[];
  note?: string;
  severity?: DiagnosticSeverity;
}

export interface DiagnosticMessagePayload {
  text: string;
  meta?: Record<string, unknown>;
}

const BRACKETED_MARKER_RE = /\[([^\]]+)\]/g;
const CRITICAL_MARKER_HINT_RE = /(ERROR|FAILED|TIMEOUT|ABORTED|UNAVAILABLE|CORRUPTED|BROKEN|PANIC|FATAL)/;
const REASONING_BLOCK_RE = /<\s*(think|reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*(think|reasoning)\s*>/gi;
const REASONING_OPEN_RE = /<\s*(?:think|reasoning)\b[^>]*>/gi;
const REASONING_CLOSE_RE = /<\s*\/\s*(?:think|reasoning)\s*>/gi;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripReasoningTags(text: string): string {
  const countedReplace = (source: string, pattern: RegExp): string =>
    source.replace(pattern, " ");

  let cleanText = text;
  cleanText = countedReplace(cleanText, REASONING_BLOCK_RE);
  cleanText = countedReplace(cleanText, REASONING_OPEN_RE);
  cleanText = countedReplace(cleanText, REASONING_CLOSE_RE);
  return cleanText;
}

function classifyMarker(marker: string): {
  family: "memory_context" | "always_on" | "critical_state" | "unknown";
  severity: DiagnosticSeverity;
} {
  if (marker.includes("MEMORY") && marker.includes("CONTEXT")) {
    return { family: "memory_context", severity: "warning" };
  }
  if (marker.includes("ALWAYS_ON")) {
    return { family: "always_on", severity: "warning" };
  }
  if (CRITICAL_MARKER_HINT_RE.test(marker)) {
    return { family: "critical_state", severity: "critical" };
  }
  return { family: "unknown", severity: "info" };
}

function severityRank(severity: DiagnosticSeverity): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function deriveNote(markers: string[]): { note?: string; severity?: DiagnosticSeverity } {
  if (markers.length === 0) {
    return {};
  }

  const families = markers.map(classifyMarker);
  const hasMemoryContext = families.some((entry) => entry.family === "memory_context");
  const hasAlwaysOn = families.some((entry) => entry.family === "always_on");
  const hasCriticalState = families.some((entry) => entry.family === "critical_state");
  const hasUnknown = families.some((entry) => entry.family === "unknown");

  let severity: DiagnosticSeverity = "info";
  for (const family of families) {
    if (severityRank(family.severity) > severityRank(severity)) {
      severity = family.severity;
    }
  }

  if (hasCriticalState) {
    return {
      note: "Nota diagnostica: il sistema ha segnalato una condizione interna critica in questo turno.",
      severity,
    };
  }

  if (hasMemoryContext && hasAlwaysOn) {
    return {
      note: "Nota diagnostica: in questo turno una parte del contesto memoria e del contesto sempre attivo non e stata applicata.",
      severity,
    };
  }

  if (hasMemoryContext) {
    return {
      note: "Nota diagnostica: in questo turno una parte del contesto memoria non e stata applicata.",
      severity,
    };
  }

  if (hasAlwaysOn) {
    return {
      note: "Nota diagnostica: in questo turno una parte del contesto sempre attivo non e stata applicata.",
      severity,
    };
  }

  if (hasUnknown) {
    return {
      note: "Nota diagnostica: il sistema ha segnalato un marker interno non previsto in questo turno.",
      severity,
    };
  }

  return {};
}

export function normalizeDiagnosticMarkers(rawText: string): DiagnosticMarkerResult {
  const source = rawText ?? "";
  const stripped = stripReasoningTags(source);
  const markers = unique(Array.from(stripped.matchAll(BRACKETED_MARKER_RE), (match) => match[1]));
  const cleanText = normalizeWhitespace(stripped.replace(BRACKETED_MARKER_RE, " "));
  const { note, severity } = deriveNote(markers);

  return {
    cleanText,
    markers,
    note,
    severity,
  };
}

export function applyDiagnosticMarkers(
  rawText: string,
  existingMeta?: Record<string, unknown>,
): DiagnosticMessagePayload {
  const normalized = normalizeDiagnosticMarkers(rawText);

  if (normalized.markers.length === 0) {
    return {
      text: normalized.cleanText,
      meta: existingMeta,
    };
  }

  return {
    text: normalized.cleanText,
    meta: {
      ...(existingMeta ?? {}),
      diagnostic_markers: normalized.markers,
      diagnostic_severity: normalized.severity,
    },
  };
}