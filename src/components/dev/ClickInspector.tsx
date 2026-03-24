/**
 * ClickInspector — Dev-only double-click element inspector.
 *
 * Double-click any element to:
 *   1. Highlight it with a pulsing ring
 *   2. Show a floating info panel with tag, classes, id, text, dimensions, React component
 *   3. Copy a summary to clipboard for easy paste into chat
 *
 * The panel auto-dismisses after 8s or on click-away.
 * Only active in development mode.
 */
import { useEffect, useState, useCallback, useRef } from "react";

interface InspectedElement {
  tag: string;
  id: string;
  classes: string;
  text: string;
  rect: { top: number; left: number; width: number; height: number };
  reactComponent: string;
  path: string;
  timestamp: number;
}

/** Walk React fiber tree to find nearest component name */
function getReactComponentName(el: HTMLElement): string {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return "—";

  let fiber = (el as any)[fiberKey];
  // Walk up the fiber tree to find a named function component or class
  for (let i = 0; i < 15 && fiber; i++) {
    const type = fiber.type;
    if (type) {
      const name =
        typeof type === "function"
          ? type.displayName || type.name
          : typeof type === "string"
            ? null // skip DOM elements like "div"
            : type.displayName || type.name;
      if (name && name !== "Anonymous" && !name.startsWith("_")) {
        return name;
      }
    }
    fiber = fiber.return;
  }
  return "—";
}

/** Build a short CSS-like selector path */
function selectorPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  for (let i = 0; i < 5 && current && current !== document.body; i++) {
    let seg = current.tagName.toLowerCase();
    if (current.id) seg += `#${current.id}`;
    else if (current.className && typeof current.className === "string") {
      const cls = current.className
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("__"))
        .slice(0, 2)
        .join(".");
      if (cls) seg += `.${cls}`;
    }
    parts.unshift(seg);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

const ClickInspector = () => {
  const [inspected, setInspected] = useState<InspectedElement | null>(null);
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    setInspected(null);
    setCopied(false);
  }, []);

  const handleDblClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target || target.closest("[data-click-inspector]")) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = target.getBoundingClientRect();
    const text = (target.textContent || "").trim().slice(0, 80);
    const classes =
      typeof target.className === "string"
        ? target.className
            .split(/\s+/)
            .filter((c) => c)
            .slice(0, 6)
            .join(" ")
        : "";

    const info: InspectedElement = {
      tag: target.tagName.toLowerCase(),
      id: target.id || "",
      classes,
      text: text || "(vuoto)",
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      reactComponent: getReactComponentName(target),
      path: selectorPath(target),
      timestamp: Date.now(),
    };

    setInspected(info);
    setCopied(false);

    // Auto-dismiss after 8s
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(dismiss, 8000);
  }, [dismiss]);

  // Copy summary to clipboard
  const handleCopy = useCallback(async () => {
    if (!inspected) return;
    const summary = [
      `🎯 Elemento: <${inspected.tag}>`,
      inspected.id ? `   ID: #${inspected.id}` : null,
      inspected.classes ? `   Classi: ${inspected.classes}` : null,
      `   React: ${inspected.reactComponent}`,
      `   Testo: "${inspected.text}"`,
      `   Dimensioni: ${inspected.rect.width}×${inspected.rect.height}`,
      `   Posizione: (${inspected.rect.left}, ${inspected.rect.top})`,
      `   Path: ${inspected.path}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for Simple Browser
      console.log("[ClickInspector]", summary);
    }
  }, [inspected]);

  useEffect(() => {
    document.addEventListener("dblclick", handleDblClick, true);
    return () => {
      document.removeEventListener("dblclick", handleDblClick, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleDblClick]);

  if (!inspected) return null;

  const { rect } = inspected;

  return (
    <>
      {/* Highlight ring around the inspected element */}
      <div
        style={{
          position: "fixed",
          top: rect.top - 3,
          left: rect.left - 3,
          width: rect.width + 6,
          height: rect.height + 6,
          border: "2px solid #a855f7",
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 99998,
          boxShadow: "0 0 12px 2px rgba(168, 85, 247, 0.5)",
          animation: "inspector-pulse 1s ease-in-out infinite",
        }}
      />

      {/* Backdrop — click to dismiss */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "transparent",
        }}
        onClick={dismiss}
      />

      {/* Info panel */}
      <div
        ref={overlayRef}
        data-click-inspector
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          bottom: 16,
          left: 12,
          right: 12,
          zIndex: 100000,
          background: "rgba(15, 15, 20, 0.95)",
          border: "1px solid rgba(168, 85, 247, 0.4)",
          borderRadius: 14,
          padding: "12px 14px",
          fontFamily: "monospace",
          fontSize: 11,
          lineHeight: 1.6,
          color: "#e2e8f0",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.15)",
          animation: "inspector-slide-up 0.2s ease-out",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#a855f7", fontWeight: 700, fontSize: 12 }}>
            🎯 Inspector
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "rgba(34,197,94,0.2)" : "rgba(168,85,247,0.15)",
                border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "rgba(168,85,247,0.3)"}`,
                borderRadius: 6,
                padding: "3px 8px",
                color: copied ? "#4ade80" : "#c4b5fd",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {copied ? "✓ Copiato" : "📋 Copia"}
            </button>
            <button
              onClick={dismiss}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                padding: "3px 8px",
                color: "#94a3b8",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
          <span style={{ color: "#94a3b8" }}>Tag:</span>
          <span style={{ color: "#f59e0b" }}>&lt;{inspected.tag}&gt;</span>

          {inspected.id && (
            <>
              <span style={{ color: "#94a3b8" }}>ID:</span>
              <span style={{ color: "#38bdf8" }}>#{inspected.id}</span>
            </>
          )}

          <span style={{ color: "#94a3b8" }}>React:</span>
          <span style={{ color: "#a78bfa" }}>{inspected.reactComponent}</span>

          <span style={{ color: "#94a3b8" }}>Classi:</span>
          <span style={{ color: "#6ee7b7", wordBreak: "break-all" }}>
            {inspected.classes || "—"}
          </span>

          <span style={{ color: "#94a3b8" }}>Testo:</span>
          <span style={{ color: "#e2e8f0", fontStyle: inspected.text === "(vuoto)" ? "italic" : "normal" }}>
            "{inspected.text}"
          </span>

          <span style={{ color: "#94a3b8" }}>Size:</span>
          <span>{inspected.rect.width} × {inspected.rect.height}px</span>

          <span style={{ color: "#94a3b8" }}>Path:</span>
          <span style={{ color: "#94a3b8", fontSize: 10, wordBreak: "break-all" }}>
            {inspected.path}
          </span>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes inspector-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes inspector-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default ClickInspector;
