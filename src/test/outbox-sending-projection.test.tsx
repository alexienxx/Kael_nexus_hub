import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChatProcessingNotice from "@/components/chat/ChatProcessingNotice";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThemeProvider } from "@/lib/store/theme";
import type { DurableTextExchange } from "@/lib/chat/durableExchangeStore";
import {
  applyChatProcessingOutcome,
  applyTextOutboxSendingMessage,
  applyTextOutboxSendingNotice,
  chatProcessingNoticeFromOutbox,
  textOutboxMessageStatus,
} from "@/lib/chat/processingNotice";
import { classifyChatOutcome, outboxDeliveryStatus, publishTextOutboxSending } from "@/lib/chat/textOutbox";
import type { ChatMessage } from "@/types";

// Direct DTO/component controls only; no IndexedDB, transport or backend substitute.
const sending: DurableTextExchange = {
  schemaVersion: 1, clientMessageId: "declared-sending-control", timelineKey: "kael-main",
  sessionId: "declared-component-control", bodyHash: "retained-opaque-body-hash",
  requestBody: { text: "Declared component control; no send.", session_id: "declared-component-control",
    client_time: "2026-11-06T22:08:27Z", client_message_id: "declared-sending-control" },
  state: "sending", attempts: 9, createdAtMs: 1000, updatedAtMs: 2000, nextAttemptAtMs: 0,
  userTurnId: "42", exchangeStatus: "retryable_failure", errorCode: "transport_unavailable",
};
const failed: ChatMessage = {
  id: sending.clientMessageId, client_message_id: sending.clientMessageId,
  backend_turn_id: sending.userTurnId, sender: "user", text: sending.requestBody.text, time: "10:00",
  meta: { exchange_status: "transport_deferred", exchange_error_code: "transport_unavailable", durable_outbox: true },
};

afterEach(cleanup);

describe("committed sending presentation", () => {
  it("publishes sending synchronously on the existing view channel without changing the receipt", () => {
    const before = JSON.stringify(sending);
    const observed: unknown[] = [];
    const observe = (event: Event) => observed.push((event as CustomEvent).detail);
    window.addEventListener("kael-outbox-view-change", observe);
    try {
      publishTextOutboxSending(sending);
      expect(observed).toEqual([{ kind: "sending", clientMessageId: sending.clientMessageId, entry: sending }]);
      publishTextOutboxSending({ ...sending, state: "queued" });
      expect(observed).toHaveLength(1);
    } finally {
      window.removeEventListener("kael-outbox-view-change", observe);
    }
    expect(JSON.stringify(sending)).toBe(before);
  });

  it("replaces a previous failure with waiting, then uses the actual classified final outcome", () => {
    const before = JSON.stringify({ sending, failed });
    const view = render(<ThemeProvider><MessageBubble message={failed} /></ThemeProvider>);
    expect(screen.getByText("messaggio non consegnato")).toBeVisible();
    const message = applyTextOutboxSendingMessage(failed, sending);
    const notice = applyTextOutboxSendingNotice({ kind: "transport_deferred", clientMessageId: sending.clientMessageId }, sending);
    view.rerender(<ThemeProvider><MessageBubble message={message} /><ChatProcessingNotice state={notice} /></ThemeProvider>);
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Messaggio in attesa di conferma.");
    expect(message.meta?.exchange_error_code).toBe("transport_unavailable");
    const outcome = { ...classifyChatOutcome({ status: 200, statusText: "OK", body: {
      exchange_status: "complete", outcome_kind: "reply", reply: "Declared response control.", user_turn_id: 42, assistant_turn_id: 43,
    } }), clientMessageId: sending.clientMessageId };
    expect(outcome.kind).toBe("reply");
    view.rerender(<ThemeProvider><MessageBubble message={{ ...message, meta: {
      ...message.meta, exchange_status: outboxDeliveryStatus(outcome),
    } }} /><ChatProcessingNotice state={applyChatProcessingOutcome(notice, outcome)} /></ThemeProvider>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
    expect(JSON.stringify({ sending, failed })).toBe(before);
  });

  it("lets a subsequent classified failure replace waiting without losing the old diagnostic", () => {
    const notice = applyTextOutboxSendingNotice(null, sending);
    const message = applyTextOutboxSendingMessage(failed, sending);
    const outcome = { ...classifyChatOutcome({ status: 503, statusText: "Unavailable", body: {
      exchange_status: "retryable_failure", error: { code: "service_unavailable" },
    } }), clientMessageId: sending.clientMessageId };
    const view = render(<ThemeProvider><MessageBubble message={message} /><ChatProcessingNotice state={notice} /></ThemeProvider>);
    view.rerender(<ThemeProvider><MessageBubble message={{ ...message, meta: {
      ...message.meta, exchange_status: outboxDeliveryStatus(outcome),
    } }} /><ChatProcessingNotice state={applyChatProcessingOutcome(notice, outcome)} /></ThemeProvider>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("messaggio non consegnato")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Connessione non disponibile.");
    expect(sending.errorCode).toBe("transport_unavailable");
  });

  it("restores the sending projection after view closure without cancelling or rewriting the envelope", () => {
    const before = JSON.stringify(sending);
    const restore = () => render(<ThemeProvider><MessageBubble message={{ ...failed,
      meta: { ...failed.meta, exchange_status: textOutboxMessageStatus(sending) },
    }} /><ChatProcessingNotice state={chatProcessingNoticeFromOutbox(sending)} /></ThemeProvider>);
    const first = restore();
    first.unmount();
    // The real restoration helpers consume the same retained row; no drain or cancellation runs.
    restore();
    expect(screen.getByRole("status")).toHaveTextContent("Messaggio in attesa di conferma.");
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
    expect(textOutboxMessageStatus(sending)).toBe("sending");
    expect(JSON.stringify(sending)).toBe(before);
  });

  it("preserves other clients, accepted processing and retained canonical barriers", () => {
    const other = { kind: "waiting" as const, clientMessageId: "newer-client" };
    expect(applyTextOutboxSendingNotice(other, sending)).toBe(other);
    const processing = { kind: "in_progress" as const, clientMessageId: sending.clientMessageId };
    expect(applyTextOutboxSendingNotice(processing, sending)).toBe(processing);
    const otherMessage = { ...failed, client_message_id: "another-client" };
    expect(applyTextOutboxSendingMessage(otherMessage, sending)).toBe(otherMessage);
    const assistant = { ...failed, sender: "kael" as const };
    expect(applyTextOutboxSendingMessage(assistant, sending)).toBe(assistant);
    for (const status of ["complete", "silence", "recovery_required", "terminal_failed", "authentication_required"]) {
      const canonical = { ...failed, meta: { ...failed.meta, exchange_status: status } };
      expect(applyTextOutboxSendingMessage(canonical, sending)).toBe(canonical);
    }
    for (const state of ["recovery_required", "terminal_failed", "authentication_required"] as const) {
      const retained = { ...sending, state };
      expect(textOutboxMessageStatus(retained)).toBe(state);
      expect(applyTextOutboxSendingMessage(failed, retained)).toBe(failed);
      expect(chatProcessingNoticeFromOutbox(retained)).toBeNull();
    }
  });
});
