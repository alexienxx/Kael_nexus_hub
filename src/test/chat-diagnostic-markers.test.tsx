import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThemeProvider } from "@/lib/store/theme";
import { applyDiagnosticMarkers, normalizeDiagnosticMarkers } from "@/lib/chat/diagnosticMarkers";
import type { ChatMessage } from "@/types";

vi.mock("@/components/chat/MessageActions", () => ({
  default: () => null,
}));

vi.mock("@/components/chat/AudioMessage", () => ({
  default: () => <div data-testid="audio-message" />,
}));

vi.mock("@/components/chat/ImageMessage", () => ({
  default: () => <div data-testid="image-message" />,
}));

vi.mock("@/components/chat/BubbleContextMenu", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/chat/PlaylistCard", () => ({
  default: () => <div data-testid="playlist-card" />,
}));

vi.mock("@/components/media/TrackCard", () => ({
  default: () => <div data-testid="track-card" />,
}));

vi.mock("@/components/common/SpotifyIcon", () => ({
  default: () => <div data-testid="spotify-icon" />,
}));

describe("chat diagnostic markers", () => {
  it("normalizes memory marker only", () => {
    const normalized = normalizeDiagnosticMarkers("[MEMORY_CONTEXT_IGNORED]");

    expect(normalized.cleanText).toBe("");
    expect(normalized.markers).toEqual(["MEMORY_CONTEXT_IGNORED"]);
    expect(normalized.note).toContain("contesto memoria");
    expect(normalized.severity).toBe("warning");
  });

  it("normalizes always-on marker only", () => {
    const normalized = normalizeDiagnosticMarkers("[ALWAYS_ON_IGNORED]");

    expect(normalized.cleanText).toBe("");
    expect(normalized.markers).toEqual(["ALWAYS_ON_IGNORED"]);
    expect(normalized.note).toContain("sempre attivo");
    expect(normalized.severity).toBe("warning");
  });

  it("normalizes both markers together", () => {
    const normalized = normalizeDiagnosticMarkers(
      "Risposta [MEMORY_CONTEXT_IGNORED] [ALWAYS_ON_IGNORED]",
    );

    expect(normalized.cleanText).toBe("Risposta");
    expect(normalized.markers).toEqual(["MEMORY_CONTEXT_IGNORED", "ALWAYS_ON_IGNORED"]);
    expect(normalized.note).toContain("contesto memoria e del contesto sempre attivo");
    expect(normalized.severity).toBe("warning");
  });

  it("normalizes unknown markers without dropping metadata", () => {
    const normalized = normalizeDiagnosticMarkers("[UNSEEN_INTERNAL_FLAG]");

    expect(normalized.cleanText).toBe("");
    expect(normalized.markers).toEqual(["UNSEEN_INTERNAL_FLAG"]);
    expect(normalized.note).toContain("marker interno non previsto");
    expect(normalized.severity).toBe("info");
  });

  it("strips free-form instruction markers used by backend leaks", () => {
    const normalized = normalizeDiagnosticMarkers(
      "Risposta [Generating response...] [non specificare il ragionamento interno] finale",
    );

    expect(normalized.cleanText).toBe("Risposta finale");
    expect(normalized.markers).toEqual([
      "Generating response...",
      "non specificare il ragionamento interno",
    ]);
    expect(normalized.note).toContain("marker interno non previsto");
    expect(normalized.severity).toBe("info");
  });

  it("strips think/reasoning tags from assistant text", () => {
    const normalized = normalizeDiagnosticMarkers(
      "Risposta <think>internal chain</think> finale",
    );

    expect(normalized.cleanText).toBe("Risposta finale");
    expect(normalized.markers).toEqual([]);
  });

  it("strips dangling reasoning tags and keeps visible content", () => {
    const normalized = normalizeDiagnosticMarkers(
      "<reasoning>hidden</reasoning>Contenuto visibile</reasoning>",
    );

    expect(normalized.cleanText).toBe("Contenuto visibile");
    expect(normalized.markers).toEqual([]);
  });

  it("passes through normal text without markers", () => {
    const normalized = normalizeDiagnosticMarkers("Risposta normale senza marker");

    expect(normalized.cleanText).toBe("Risposta normale senza marker");
    expect(normalized.markers).toEqual([]);
    expect(normalized.note).toBeUndefined();
    expect(normalized.severity).toBeUndefined();
  });

  it("preserves diagnostic metadata for history and pending normalization", () => {
    const normalized = applyDiagnosticMarkers("Contenuto [MEMORY_CONTEXT_IGNORED]", {
      source: "history",
    });

    expect(normalized.text).toBe("Contenuto");
    expect(normalized.meta?.source).toBe("history");
    expect(normalized.meta?.diagnostic_markers).toEqual(["MEMORY_CONTEXT_IGNORED"]);
    expect(normalized.meta?.diagnostic_severity).toBe("warning");
  });

  it("does not render diagnostic note in user bubble", () => {
    const normalized = applyDiagnosticMarkers(
      "Risposta finale [MEMORY_CONTEXT_IGNORED] [ALWAYS_ON_IGNORED]",
    );

    const message: ChatMessage = {
      id: "assistant-1",
      text: normalized.text,
      time: "10:00",
      timestamp: 10,
      sender: "kael",
      feedback: null,
      meta: normalized.meta,
    };

    const { container } = render(
      <ThemeProvider>
        <MessageBubble message={message} />
      </ThemeProvider>,
    );

    expect(screen.getByText("Risposta finale")).toBeInTheDocument();
    expect(screen.queryByText(/Nota diagnostica:/)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("[MEMORY_CONTEXT_IGNORED]");
    expect(container.textContent).not.toContain("[ALWAYS_ON_IGNORED]");
  });

  it("renders assistant semantic bubbles as separate stacked chunks", () => {
    const message: ChatMessage = {
      id: "assistant-bubbles-1",
      text: "Prima parte Seconda parte",
      bubbles: ["Prima parte", "Seconda parte"],
      time: "10:05",
      timestamp: 11,
      sender: "kael",
      feedback: null,
    };

    render(
      <ThemeProvider>
        <MessageBubble message={message} />
      </ThemeProvider>,
    );

    expect(screen.getByText("Prima parte")).toBeInTheDocument();
    expect(screen.getByText("Seconda parte")).toBeInTheDocument();
  });

  it("fails closed for a native voice note while audio is unavailable", () => {
    const message: ChatMessage = {
      id: "assistant-native-voice-pending",
      text: "Superficie canonica che non deve apparire.",
      bubbles: ["Nemmeno questa bolla deve apparire."],
      delivery_mode: "voice_note",
      time: "10:06",
      timestamp: 12,
      sender: "kael",
      feedback: null,
    };

    render(
      <ThemeProvider>
        <MessageBubble message={message} />
      </ThemeProvider>,
    );

    expect(screen.queryByText(message.text)).not.toBeInTheDocument();
    expect(screen.queryByText(message.bubbles![0])).not.toBeInTheDocument();
    expect(screen.queryByTestId("audio-message")).not.toBeInTheDocument();
    expect(screen.getByText("Vocale non disponibile.")).toBeInTheDocument();
  });

  it("never renders native voice-note text when playable audio is resolved", () => {
    const message: ChatMessage = {
      id: "assistant-native-voice-ready",
      text: "Superficie privata del vocale.",
      bubbles: ["Bolla privata del vocale."],
      delivery_mode: "voice_note",
      audioUrl: "blob:https://arrakis.local/native-voice-note",
      time: "10:07",
      timestamp: 13,
      sender: "kael",
      feedback: null,
    };

    render(
      <ThemeProvider>
        <MessageBubble message={message} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("audio-message")).toBeInTheDocument();
    expect(screen.queryByText(message.text)).not.toBeInTheDocument();
    expect(screen.queryByText(message.bubbles![0])).not.toBeInTheDocument();
    expect(screen.queryByText("Vocale non disponibile.")).not.toBeInTheDocument();
  });

  it("exposes native play and stop only for a canonical assistant turn", () => {
    const onPlay = vi.fn();
    const onStop = vi.fn();
    const message: ChatMessage = {
      id: "assistant-native-voice-turn",
      backend_turn_id: "602",
      text: "Testo privato da non montare nel DOM.",
      bubbles: ["Bolla privata da non montare nel DOM."],
      delivery_mode: "voice_note",
      time: "10:08",
      timestamp: 14,
      sender: "kael",
      feedback: null,
    };

    const { rerender } = render(
      <ThemeProvider>
        <MessageBubble
          message={message}
          nativeVoiceState="idle"
          onPlayNativeVoice={onPlay}
          onStopNativeVoice={onStop}
        />
      </ThemeProvider>,
    );

    expect(screen.queryByText(message.text)).not.toBeInTheDocument();
    expect(screen.queryByText(message.bubbles![0])).not.toBeInTheDocument();
    expect(screen.queryByText("Vocale non disponibile.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riproduci vocale" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(message);
    expect(onStop).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider>
        <MessageBubble
          message={message}
          nativeVoiceState="starting"
          onPlayNativeVoice={onPlay}
          onStopNativeVoice={onStop}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preparazione vocale" }));
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(
      <ThemeProvider>
        <MessageBubble
          message={message}
          nativeVoiceState="playing"
          onPlayNativeVoice={onPlay}
          onStopNativeVoice={onStop}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Interrompi vocale" }));
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "0", "-1", "1.5", "not-a-turn"])(
    "keeps the unavailable fallback for invalid assistant turn id %s",
    (backendTurnId) => {
      const message: ChatMessage = {
        id: `assistant-native-invalid-${String(backendTurnId)}`,
        backend_turn_id: backendTurnId,
        text: "Testo privato.",
        delivery_mode: "voice_note",
        time: "10:09",
        sender: "kael",
      };

      render(
        <ThemeProvider>
          <MessageBubble
            message={message}
            onPlayNativeVoice={vi.fn()}
            onStopNativeVoice={vi.fn()}
          />
        </ThemeProvider>,
      );

      expect(screen.queryByRole("button", { name: "Riproduci vocale" })).not.toBeInTheDocument();
      expect(screen.queryByText(message.text)).not.toBeInTheDocument();
      expect(screen.getByText("Vocale non disponibile.")).toBeInTheDocument();
    },
  );

  it("shows failed native playback as a retry without exposing reply text", () => {
    const onPlay = vi.fn();
    const message: ChatMessage = {
      id: "assistant-native-retry",
      backend_turn_id: "603",
      text: "Risposta interna.",
      delivery_mode: "voice_note",
      time: "10:10",
      sender: "kael",
    };

    render(
      <ThemeProvider>
        <MessageBubble
          message={message}
          nativeVoiceState="failed"
          onPlayNativeVoice={onPlay}
          onStopNativeVoice={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.queryByText(message.text)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova vocale" }));
    expect(onPlay).toHaveBeenCalledWith(message);
  });
});
