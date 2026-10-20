import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatProcessingNotice from "@/components/chat/ChatProcessingNotice";
import { applyChatProcessingOutcome, chatProcessingNoticeFromOutcome, reconcileChatProcessingMessages } from "@/lib/chat/processingNotice";
import type { ChatMessage } from "@/types";
import { classifyChatOutcome } from "@/lib/chat/textOutbox";
import type { ChatHttpResult } from "@/lib/api/chat";

describe("honest chat processing status", () => {
  it("announces confirmed quiet after waiting without claiming typing or delivery failure", () => {
    const view = render(<ChatProcessingNotice state={{ kind: "waiting" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("In attesa del server");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const outcome = classifyChatOutcome({
      status: 200, statusText: "OK",
      body: { exchange_status: "silence", outcome_kind: "silence", user_turn_id: 42, assistant_turn_id: undefined },
    });
    expect(outcome.kind).toBe("silence");
    view.rerender(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome(outcome)} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-outcome", "silence");
    expect(screen.getByRole("status")).toHaveTextContent("Elaborazione conclusa senza una risposta");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/sta scrivendo|Non consegnato|Codice:/)).not.toBeInTheDocument();
  });

  it("keeps real receipt processing, recovery, failure and authentication distinct with exact codes", () => {
    const cases: [ChatHttpResult, string, string, string][] = [
      [{ status: 202, statusText: "Accepted", body: { exchange_status: "processing" } }, "in_progress", "Ultimo stato confermato: elaborazione in corso", "exchange_in_progress"],
      [{ status: 409, statusText: "Conflict", body: { exchange_status: "recovery_required", error: { code: "cognition_outcome_requires_recovery" } } }, "recovery_required", "Recupero da verificare", "cognition_outcome_requires_recovery"],
      [{ status: 400, statusText: "Bad Request", body: { error: { code: "INTERPRETATION_BOUNDARY_UNAVAILABLE" } } }, "terminal_failure", "Elaborazione non completata", "INTERPRETATION_BOUNDARY_UNAVAILABLE"],
      [{ status: 403, statusText: "Forbidden", body: { error: { code: "api_auth_required" } } }, "authentication_required", "Accesso al server richiesto", "api_auth_required"],
    ];
    const view = render(<ChatProcessingNotice state={null} />);
    for (const [receipt, kind, label, code] of cases) {
      const outcome = classifyChatOutcome(receipt);
      expect(outcome.kind).toBe(kind);
      view.rerender(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome(outcome)} />);
      expect(screen.getByRole("status")).toHaveAttribute("data-outcome", kind);
      expect(screen.getByRole("status")).toHaveTextContent(label);
      expect(screen.getByRole("status")).toHaveTextContent(`Codice: ${code}`);
      expect(screen.queryByText("Elaborazione conclusa senza una risposta")).not.toBeInTheDocument();
    }
  });

  it("does not promote rejected complete receipts or private detail and clears only an accepted reply", () => {
    const outcome = classifyChatOutcome({ status: 200, statusText: "OK", body: {
      exchange_status: "complete", outcome_kind: "reply", reply: "untrusted test text", user_turn_id: 42, assistant_turn_id: 42,
    } });
    const view = render(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome(outcome)} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-outcome", "terminal_failure");
    expect(screen.getByRole("status")).toHaveTextContent("committed_reply_turn_ids_collide");
    expect(screen.queryByText("untrusted test text")).not.toBeInTheDocument();
    view.rerender(<ChatProcessingNotice state={{ kind: "unconfirmed", errorCode: "private backend detail / not a code" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Esito della richiesta non confermato");
    expect(screen.queryByText(/private backend detail|Codice:/)).not.toBeInTheDocument();
    const reply = classifyChatOutcome({ status: 200, statusText: "OK", body: {
      exchange_status: "complete", outcome_kind: "reply", reply: "test reply", user_turn_id: 42, assistant_turn_id: 43,
    } });
    view.rerender(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome(reply)} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not overwrite a newer request with old FIFO results or infer SSE reply correlation", () => {
    const current = { kind: "waiting" as const, clientMessageId: "current" };
    expect(applyChatProcessingOutcome(current, { kind: "silence", clientMessageId: "older" })).toBe(current);
    expect(applyChatProcessingOutcome(current, { kind: "reply", clientMessageId: "older" })).toBe(current);
    const processing = applyChatProcessingOutcome(current, { kind: "in_progress", clientMessageId: "current" });
    const committed: ChatMessage = { id: "durable-43", backend_turn_id: "43", sender: "kael", text: "test text", time: "10:00" };
    const unknown = reconcileChatProcessingMessages(processing, [committed]);
    expect(unknown?.kind).toBe("unconfirmed");
    expect(unknown?.clientMessageId).toBe("current");
    const view = render(<ChatProcessingNotice state={unknown} />);
    expect(screen.queryByText("Ultimo stato confermato: elaborazione in corso")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Esito della richiesta non confermato");
    expect(reconcileChatProcessingMessages(processing, [{ ...committed, sender: "user" }])).toBe(processing);
    expect(reconcileChatProcessingMessages(processing, [{ ...committed, client_message_id: "current" }])).toBeNull();
  });
});
