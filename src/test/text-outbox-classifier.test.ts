import { describe, expect, it } from "vitest";
import type { ChatHttpResult } from "@/lib/api/chat";
import { classifyChatOutcome } from "@/lib/chat/textOutbox";

function response(
  status: number,
  body: ChatHttpResult["body"],
  retryAfterSeconds?: number,
): ChatHttpResult {
  return { status, statusText: "diagnostic", body, retryAfterSeconds };
}

describe("durable text outbox response classifier (diagnostic contract)", () => {
  it("accepts a committed reply only when both canonical turn ids exist", () => {
    expect(classifyChatOutcome(response(200, {
      reply: "risposta",
      session_id: "mobile_kael",
      exchange_status: "complete",
      outcome_kind: "reply",
      user_turn_id: 10,
      assistant_turn_id: 11,
    }))).toEqual({ kind: "reply" });

    expect(classifyChatOutcome(response(200, {
      reply: "risposta senza prova",
      session_id: "mobile_kael",
      exchange_status: "complete",
      outcome_kind: "reply",
      user_turn_id: 10,
    }))).toEqual({ kind: "terminal_failure", errorCode: "committed_reply_invalid_turn_ids" });
  });

  it("classifies a canonical replay without treating it as a new generation", () => {
    expect(classifyChatOutcome(response(200, {
      reply: "stessa risposta",
      session_id: "mobile_kael",
      idempotent_replay: true,
      exchange_status: "complete",
      outcome_kind: "reply",
      user_turn_id: 20,
      assistant_turn_id: 21,
    }))).toEqual({ kind: "replay" });

    // Compatibility-only alias: canonical Gate A replay is the receipt above
    // (`complete` + idempotent_replay=true), not exchange_status=duplicate.
    expect(classifyChatOutcome(response(200, {
      reply: "stessa risposta dal receipt duplicato",
      exchange_status: "duplicate",
      user_turn_id: 20,
      assistant_turn_id: 21,
    }))).toEqual({ kind: "replay" });
  });

  it("classifies deliberate silence as terminal success with no assistant turn", () => {
    expect(classifyChatOutcome(response(200, {
      reply: "",
      session_id: "mobile_kael",
      exchange_status: "silence",
      outcome_kind: "silence",
      user_turn_id: 30,
      assistant_turn_id: undefined,
    }))).toEqual({ kind: "silence" });
  });

  it("keeps an HTTP 202 exchange pending and honors a bounded retry hint", () => {
    const classified = classifyChatOutcome(response(202, {
      reply: "",
      session_id: "mobile_kael",
      exchange_status: "processing",
      error: { code: "exchange_in_progress", retryable: true },
      user_turn_id: 40,
    }, 2));

    expect(classified.kind).toBe("in_progress");
    expect(classified.errorCode).toBe("exchange_in_progress");
    expect(classified.retryAfterMs).toBe(2_000);
  });

  it("never auto-retries recovery-required cognition", () => {
    // Compatibility-only nested alias; the canonical code is asserted above.
    expect(classifyChatOutcome(response(409, {
      reply: "",
      session_id: "mobile_kael",
      exchange_status: "recovery_required",
      error: { code: "cognition_outcome_requires_recovery", retryable: false },
      user_turn_id: 50,
    }))).toEqual({
      kind: "recovery_required",
      errorCode: "cognition_outcome_requires_recovery",
    });

    expect(classifyChatOutcome(response(409, {
      detail: {
        status: "recovery_required",
        code: "exchange_recovery_required",
        retryable: false,
      },
    }))).toEqual({
      kind: "recovery_required",
      errorCode: "exchange_recovery_required",
    });
  });

  it("gives canonical recovery precedence over HTTP 202 and processing aliases", () => {
    expect(classifyChatOutcome(response(202, {
      reply: "",
      session_id: "mobile_kael",
      exchange_status: "processing",
      user_turn_id: 50,
      error: { code: "cognition_outcome_requires_recovery", retryable: false },
    }))).toEqual({
      kind: "recovery_required",
      errorCode: "cognition_outcome_requires_recovery",
    });
  });

  it("fails closed on internally contradictory recovery or processing receipts", () => {
    expect(classifyChatOutcome(response(202, {
      reply: "non deve essere renderizzata",
      exchange_status: "recovery_required",
      outcome_kind: "reply",
      user_turn_id: 50,
      assistant_turn_id: 51,
      error: { code: "cognition_outcome_requires_recovery", retryable: false },
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "incoherent_recovery_receipt",
    });

    expect(classifyChatOutcome(response(202, {
      reply: "non deve essere renderizzata",
      exchange_status: "processing",
      outcome_kind: "reply",
      user_turn_id: 50,
      assistant_turn_id: 51,
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "incoherent_processing_receipt",
    });

    expect(classifyChatOutcome(response(200, {
      reply: "testo senza lifecycle canonico",
      exchange_status: "complete",
      user_turn_id: 50,
      assistant_turn_id: 51,
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "incoherent_reply_receipt",
    });

    expect(classifyChatOutcome(response(200, {
      reply: "non può accompagnare SILENCE",
      exchange_status: "silence",
      outcome_kind: "silence",
      user_turn_id: 50,
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "incoherent_silence_receipt",
    });
  });

  it("distinguishes retryable server pressure from an idempotency collision", () => {
    expect(classifyChatOutcome(response(503, {
      reply: "",
      session_id: "mobile_kael",
      error: { code: "cognitive_writer_busy", retryable: true },
    }, 1)).kind).toBe("retryable_failure");

    expect(classifyChatOutcome(response(409, {
      reply: "",
      session_id: "mobile_kael",
      detail: "idempotency key already belongs to another request",
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "idempotency key already belongs to another request",
    });

    expect(classifyChatOutcome(response(409, {
      detail: {
        code: "idempotency_payload_mismatch",
        retryable: false,
      },
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "idempotency_payload_mismatch",
    });
  });

  it("rejects an unclassified empty 200 instead of rendering a blank bubble", () => {
    expect(classifyChatOutcome(response(200, {
      reply: "",
      session_id: "mobile_kael",
    }))).toEqual({
      kind: "terminal_failure",
      errorCode: "unclassified_empty_chat_outcome",
    });
  });

  it.each([
    [401, { detail: { code: "authentication_required", retryable: false } }, "authentication_required"],
    [403, { detail: { code: "invalid_credentials", retryable: false } }, "invalid_credentials"],
    [503, { detail: { code: "api-auth-not-configured", retryable: false } }, "api-auth-not-configured"],
  ])("keeps HTTP %i authentication failures blocked and retryable by the user", (status, body, code) => {
    expect(classifyChatOutcome(response(status, body))).toEqual({
      kind: "authentication_required",
      errorCode: code,
    });
  });

  it("uses the preserved HTTP status when the body is empty or malformed", () => {
    expect(classifyChatOutcome({
      status: 401,
      statusText: "Unauthorized",
      body: {},
      bodyParseError: "empty",
    })).toEqual({
      kind: "authentication_required",
      errorCode: "http_401_empty",
    });
    expect(classifyChatOutcome({
      status: 503,
      statusText: "Unavailable",
      body: {},
      bodyParseError: "invalid_json",
    })).toEqual({
      kind: "retryable_failure",
      errorCode: "http_503_invalid_json",
      retryAfterMs: 1_000,
    });
    expect(classifyChatOutcome({
      status: 409,
      statusText: "Conflict",
      body: {},
      bodyParseError: "empty",
    })).toEqual({
      kind: "terminal_failure",
      errorCode: "http_409_empty",
    });
  });
});
