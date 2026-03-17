import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@/types";
import type { ChatResponse } from "@/lib/api/chat";

describe("External Agent Support", () => {
  it("should accept external_agent as a valid sender type", () => {
    const message: ChatMessage = {
      id: "1",
      text: "Hello from external agent",
      time: "10:00",
      sender: "external_agent",
      agent_id: "agent-123",
      agent_name: "Test Agent",
      agent_avatar: "https://example.com/avatar.jpg",
      feedback: null,
    };

    expect(message.sender).toBe("external_agent");
    expect(message.agent_id).toBe("agent-123");
    expect(message.agent_name).toBe("Test Agent");
  });

  it("should accept user as a valid sender type", () => {
    const message: ChatMessage = {
      id: "2",
      text: "Hello from user",
      time: "10:01",
      sender: "user",
      feedback: null,
    };

    expect(message.sender).toBe("user");
  });

  it("should accept kael as a valid sender type", () => {
    const message: ChatMessage = {
      id: "3",
      text: "Hello from Kael",
      time: "10:02",
      sender: "kael",
      feedback: null,
    };

    expect(message.sender).toBe("kael");
  });

  it("should support optional agent metadata fields", () => {
    const message: ChatMessage = {
      id: "4",
      text: "Message without agent metadata",
      time: "10:03",
      sender: "external_agent",
      feedback: null,
    };

    expect(message.agent_id).toBeUndefined();
    expect(message.agent_name).toBeUndefined();
    expect(message.agent_avatar).toBeUndefined();
  });

  it("should support mixed conversation with all sender types", () => {
    const messages: ChatMessage[] = [
      { id: "1", text: "User message", time: "10:00", sender: "user", feedback: null },
      { id: "2", text: "Kael response", time: "10:01", sender: "kael", feedback: null },
      {
        id: "3",
        text: "External agent response",
        time: "10:02",
        sender: "external_agent",
        agent_name: "GitHub Agent",
        feedback: null,
      },
    ];

    expect(messages.length).toBe(3);
    expect(messages[0].sender).toBe("user");
    expect(messages[1].sender).toBe("kael");
    expect(messages[2].sender).toBe("external_agent");
    expect(messages[2].agent_name).toBe("GitHub Agent");
  });

  it("should define ChatResponse with sender field", () => {
    const response: ChatResponse = {
      turn_id: "t-1",
      content: "Hello",
      sender: "external_agent",
      agent_id: "agent-1",
      agent_name: "Test Agent",
    };

    expect(response.sender).toBe("external_agent");
  });
});
