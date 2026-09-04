import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/types";
import {
  mergeMessagesIdempotent,
  normalizeAfterTs,
  resolveAudioUrlFromPayload,
  resolveAssistantIdentity,
  resolveHistoryMessageId,
} from "@/lib/chat/reliability";

describe("chat reliability", () => {
  it("A: builds stable assistant fallback id when assistant_turn_id is null", () => {
    const response = {
      reply: "ciao mondo",
      assistant_turn_id: null,
      message_id: null,
      trace_id: "trace-abc",
      timestamp: 1778107000,
    };

    const identity = resolveAssistantIdentity(response, "sess-1", response.reply, 1778107000);

    expect(identity.messageId.length).toBeGreaterThan(0);
    expect(identity.idSource).toBe("fallback");
    expect(identity.backendTurnId).toBeUndefined();
  });

  it("A2: prefers assistant_turn_id when available", () => {
    const identity = resolveAssistantIdentity(
      { reply: "ok", assistant_turn_id: 1234 },
      "sess-1",
      "ok",
      1,
    );

    expect(identity.idSource).toBe("assistant_turn_id");
    expect(identity.backendTurnId).toBe("1234");
    expect(identity.messageId).toBe("assistant-turn:1234");
  });

  it("B: pending drain readiness can run with afterTs=0", () => {
    const afterTs = normalizeAfterTs(0);
    expect(afterTs).toBe(0);
  });

  it("C: duplicate trigger merge remains idempotent", () => {
    const base: ChatMessage[] = [
      {
        id: "assistant-turn:10",
        text: "a",
        time: "10:00",
        timestamp: 10,
        sender: "kael",
        feedback: null,
        backend_turn_id: "10",
      },
    ];

    const incomingBurst: ChatMessage[] = [
      {
        id: "assistant-turn:10",
        text: "a",
        time: "10:00",
        timestamp: 10,
        sender: "kael",
        feedback: null,
        backend_turn_id: "10",
      },
      {
        id: "assistant-fallback:sess:t:20:h",
        text: "b",
        time: "10:01",
        timestamp: 20,
        sender: "kael",
        feedback: null,
      },
      {
        id: "assistant-fallback:sess:t:20:h",
        text: "b",
        time: "10:01",
        timestamp: 20,
        sender: "kael",
        feedback: null,
      },
    ];

    const merged = mergeMessagesIdempotent(base, incomingBurst);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("assistant-turn:10");
    expect(merged[1].id).toBe("assistant-fallback:sess:t:20:h");
  });

  it("D: long generation recovery does not duplicate late direct response", () => {
    const optimisticUser: ChatMessage = {
      id: "client-1",
      client_message_id: "client-1",
      text: "domanda lunga",
      time: "10:00",
      timestamp: 10,
      sender: "user",
      feedback: null,
    };

    const recoveredAssistant: ChatMessage = {
      id: "assistant-fallback:sess:req-1:20:hash",
      text: "risposta lunga",
      time: "10:02",
      timestamp: 20,
      sender: "kael",
      feedback: null,
      meta: { id_source: "fallback" },
    };

    const lateDirectAssistant: ChatMessage = {
      ...recoveredAssistant,
    };

    const afterRecovery = mergeMessagesIdempotent([optimisticUser], [recoveredAssistant]);
    const afterLateDirect = mergeMessagesIdempotent(afterRecovery, [lateDirectAssistant]);

    expect(afterLateDirect).toHaveLength(2);
    expect(afterLateDirect[1].text).toBe("risposta lunga");
  });

  it("D2: causal client id shared by USER and ASSISTANT does not collapse the reply", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-501",
        backend_turn_id: "501",
        client_message_id: "client-shared",
        text: "domanda",
        time: "10:00",
        timestamp: 10,
        sender: "user",
        feedback: null,
      },
      {
        id: "assistant-502",
        backend_turn_id: "502",
        client_message_id: "client-shared",
        text: "risposta",
        time: "10:01",
        timestamp: 11,
        sender: "kael",
        feedback: null,
      },
    ];

    const merged = mergeMessagesIdempotent([], messages);
    expect(merged.map((message) => message.text)).toEqual(["domanda", "risposta"]);
  });

  it("E: audio fields survive history/pending merge", () => {
    const existing: ChatMessage[] = [];
    const incoming: ChatMessage[] = [
      {
        id: resolveHistoryMessageId(
          { id: 77, sender: "assistant", text: "audio turn", timestamp: 1778107001 },
          "sess-audio",
        ),
        text: "audio turn",
        time: "10:03",
        timestamp: 1778107001,
        sender: "kael",
        feedback: null,
        audioUrl: "https://example.local/voice/audio/trace-1.wav",
      },
    ];

    const merged = mergeMessagesIdempotent(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].audioUrl).toContain("voice/audio/trace-1.wav");
  });

  it("E2: relative tts_url is normalized to backend absolute URL", () => {
    const resolved = resolveAudioUrlFromPayload(
      { tts_url: "/voice/audio/trace-2.wav" },
      "http://127.0.0.1:8002",
    );
    expect(resolved).toBe("http://127.0.0.1:8002/voice/audio/trace-2.wav");
  });

  it("E3: voice_asset_id is not treated as playable audio URL", () => {
    const resolved = resolveAudioUrlFromPayload(
      { voice_asset_id: "asset-123", has_voice_audio: true },
      "http://127.0.0.1:8002",
    );
    expect(resolved).toBeUndefined();
  });

  it("F: two autonomous messages with close timestamps preserve chronological order", () => {
    // Simulates a burst of two autonomous messages arriving within the 700ms
    // coalescing window. Both are eventually fetched (possibly in a single call
    // if the deferred retry fires). The merge must produce stable chronological
    // order keyed on timestamp + backend_turn_id tie-breaker.
    const existing: ChatMessage[] = [];

    const msg1: ChatMessage = {
      id: "hist:101",
      text: "primo messaggio autonomo",
      time: "10:00",
      timestamp: 1778107001,
      sender: "kael",
      feedback: null,
      backend_turn_id: "101",
    };

    const msg2: ChatMessage = {
      id: "hist:102",
      text: "secondo messaggio autonomo",
      time: "10:00",
      timestamp: 1778107001, // same-second — tie-break via backend_turn_id
      sender: "kael",
      feedback: null,
      backend_turn_id: "102",
    };

    // Simulate two SSE triggers both resulting in fetchAndAppendPending.
    // The second call may arrive with both msgs (deferred retry fetches after first).
    const afterFirst = mergeMessagesIdempotent(existing, [msg1]);
    const afterSecond = mergeMessagesIdempotent(afterFirst, [msg2]);

    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[0].backend_turn_id).toBe("101");
    expect(afterSecond[1].backend_turn_id).toBe("102");
  });

  it("F2: burst merge is idempotent when both msgs arrive in single pending response", () => {
    // Deferred retry returns both messages in one fetch. Must not duplicate.
    const existing: ChatMessage[] = [];
    const both: ChatMessage[] = [
      {
        id: "hist:201",
        text: "msg-a",
        time: "10:01",
        timestamp: 1778107050,
        sender: "kael",
        feedback: null,
        backend_turn_id: "201",
      },
      {
        id: "hist:202",
        text: "msg-b",
        time: "10:01",
        timestamp: 1778107051,
        sender: "kael",
        feedback: null,
        backend_turn_id: "202",
      },
    ];
    const merged = mergeMessagesIdempotent(existing, both);
    // Second call with same payload must not duplicate.
    const mergedAgain = mergeMessagesIdempotent(merged, both);

    expect(mergedAgain).toHaveLength(2);
    expect(mergedAgain[0].backend_turn_id).toBe("201");
    expect(mergedAgain[1].backend_turn_id).toBe("202");
  });
});
