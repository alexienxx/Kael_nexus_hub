import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import MessageActions from "@/components/chat/MessageActions";
import { createAssistantSpeechRequest } from "@/lib/audio/nativeCallVoiceService";
import type { ChatMessage } from "@/types";

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-turn:602",
    backend_turn_id: "602",
    text: "Risposta canonica",
    time: "10:00",
    sender: "kael",
    ...overrides,
  };
}

describe("native voice chat consumer", () => {
  it("keeps retired voice payloads and the legacy TTS endpoint out of production consumers", () => {
    const sourceRoot = path.join(process.cwd(), "src");
    const forbiddenFields = new Set(["tts_url", "voice_audio", "audio_base64"]);
    const findings: string[] = [];
    const visitFile = (filePath: string) => {
      const source = ts.createSourceFile(
        filePath,
        readFileSync(filePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visitNode = (node: ts.Node) => {
        if (ts.isIdentifier(node) && forbiddenFields.has(node.text)) {
          findings.push(`${path.relative(sourceRoot, filePath)}:${node.getStart(source)}:${node.text}`);
        }
        if (ts.isStringLiteralLike(node)) {
          if (forbiddenFields.has(node.text) || node.text.includes("/chat/voice/tts")) {
            findings.push(`${path.relative(sourceRoot, filePath)}:${node.getStart(source)}:${node.text}`);
          }
        }
        ts.forEachChild(node, visitNode);
      };
      visitNode(source);
    };
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "test" && entry.name !== "__tests__") walk(fullPath);
        } else if (/\.tsx?$/.test(entry.name)) {
          visitFile(fullPath);
        }
      }
    };

    walk(sourceRoot);

    expect(findings).toEqual([]);
  });

  it("builds speech presentation from assistant turn identity without client text", () => {
    const request = createAssistantSpeechRequest(602, "mobile voice/session");

    const requestUrl = new URL(request.path, "http://localhost");
    expect(requestUrl.pathname).toBe("/audio/speech/602");
    expect(requestUrl.searchParams.get("session_id")).toBe("mobile voice/session");
    expect(request.options).toEqual({ method: "POST", timeout: 15_000 });
    expect(Object.prototype.hasOwnProperty.call(request.options, "body")).toBe(false);
  });

  it.each([
    [0, "session"],
    [-1, "session"],
    [1.5, "session"],
    [Number.NaN, "session"],
    [602, "   "],
  ])("rejects invalid speech binding turn=%s session=%s", (turnId, sessionId) => {
    expect(() => createAssistantSpeechRequest(turnId, sessionId))
      .toThrow("AUDIO_STREAM_REQUEST_INVALID");
  });

  it("routes the text-message Listen action through the canonical ChatMessage", () => {
    const message = assistantMessage();
    const onPlay = vi.fn();

    render(<MessageActions message={message} onPlayTTS={onPlay} />);
    fireEvent.click(screen.getByTitle("Ascolta"));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(message);
  });

  it("does not expose a duplicate Listen action for a native voice note", () => {
    render(<MessageActions message={assistantMessage({ delivery_mode: "voice_note" })} onPlayTTS={vi.fn()} />);

    expect(screen.queryByTitle("Ascolta")).not.toBeInTheDocument();
  });

  it("does not expose native speech for external agents or invalid turn ids", () => {
    const { rerender } = render(
      <MessageActions
        message={assistantMessage({ sender: "external_agent" })}
        onPlayTTS={vi.fn()}
      />,
    );
    expect(screen.queryByTitle("Ascolta")).not.toBeInTheDocument();

    rerender(
      <MessageActions
        message={assistantMessage({ backend_turn_id: "not-a-turn" })}
        onPlayTTS={vi.fn()}
      />,
    );
    expect(screen.queryByTitle("Ascolta")).not.toBeInTheDocument();
  });
});
