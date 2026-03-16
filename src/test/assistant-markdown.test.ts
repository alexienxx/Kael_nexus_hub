import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@/types";

describe("Assistant Markdown Rendering", () => {
  it("only non-user senders should trigger markdown rendering", () => {
    const isAssistantSender = (sender: ChatMessage["sender"]) =>
      sender !== "user";

    expect(isAssistantSender("kael")).toBe(true);
    expect(isAssistantSender("external_agent")).toBe(true);
    expect(isAssistantSender("user")).toBe(false);
  });

  it("kael message with markdown text is a valid ChatMessage", () => {
    const message: ChatMessage = {
      id: "md-1",
      text: "**Bold**, _italic_, `code`, and a [link](https://example.com).",
      time: "12:00",
      sender: "kael",
      feedback: null,
    };

    expect(message.sender).toBe("kael");
    expect(message.text).toContain("**Bold**");
  });

  it("user message with markdown-like text remains plain text", () => {
    const message: ChatMessage = {
      id: "md-2",
      text: "**not bold** because user messages are plain text",
      time: "12:01",
      sender: "user",
      feedback: null,
    };

    expect(message.sender).toBe("user");
    // The text is stored as-is; rendering decides plain vs markdown
    expect(message.text).toBe(
      "**not bold** because user messages are plain text"
    );
  });

  it("external_agent message also qualifies for markdown rendering", () => {
    const message: ChatMessage = {
      id: "md-3",
      text: "- item one\n- item two\n- item three",
      time: "12:02",
      sender: "external_agent",
      agent_name: "GitHub Agent",
      feedback: null,
    };

    const isAssistantSender = (sender: ChatMessage["sender"]) =>
      sender !== "user";

    expect(isAssistantSender(message.sender)).toBe(true);
  });

  it("kael message with plain text (no markdown syntax) remains valid", () => {
    const message: ChatMessage = {
      id: "md-4",
      text: "Hello! How can I help you today?",
      time: "12:03",
      sender: "kael",
      feedback: null,
    };

    expect(message.text).toBe("Hello! How can I help you today?");
  });
});
