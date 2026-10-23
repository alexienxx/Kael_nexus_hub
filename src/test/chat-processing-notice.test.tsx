import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChatProcessingNotice from "@/components/chat/ChatProcessingNotice";
import { applyChatProcessingOutcome, chatProcessingNoticeFromOutcome, reconcileChatProcessingMessages } from "@/lib/chat/processingNotice";
import type { ChatMessage } from "@/types";
import { classifyChatOutcome } from "@/lib/chat/textOutbox";

describe("clean chat with retained diagnostics", () => {
  it("does not render waiting, processing, quiet or unknown as chat notices", () => {
    const view = render(<ChatProcessingNotice state={null} />);
    for (const kind of ["waiting", "in_progress", "silence", "unconfirmed"] as const) {
      view.rerender(<ChatProcessingNotice state={{ kind, errorCode: "private_detail" }} />);
      expect(view.container).toBeEmptyDOMElement();
    }
  });
  it("shows one dismissible error without publishing retained technical codes", () => {
    const outcome = classifyChatOutcome({ status: 409, statusText: "Conflict", body: {
      exchange_status: "recovery_required", error: { code: "cognition_outcome_requires_recovery" },
    } });
    const state = chatProcessingNoticeFromOutcome({ ...outcome, clientMessageId: "declared-ui-request" });
    const view = render(<ChatProcessingNotice state={null} />);
    view.rerender(<ChatProcessingNotice state={state} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Non è stato possibile completare la richiesta.");
    expect(screen.queryByText(/Recupero|cognition_outcome|Codice:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi avviso" }));
    expect(view.container).toBeEmptyDOMElement();
    expect(state?.errorCode).toBe("cognition_outcome_requires_recovery");
    expect(state?.kind).toBe("recovery_required");
    view.rerender(<ChatProcessingNotice state={{kind: "authentication_required", clientMessageId: "new"}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Accedi per inviare messaggi.");
  });
  it("hides invalid reply content and clears only an accepted reply", () => {
    const outcome = classifyChatOutcome({ status: 200, statusText: "OK", body: {
      exchange_status: "complete", outcome_kind: "reply", reply: "untrusted test text", user_turn_id: 42, assistant_turn_id: 42,
    } });
    expect(outcome.kind).toBe("terminal_failure");
    const view = render(<ChatProcessingNotice state={null} />);
    view.rerender(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome({ ...outcome, clientMessageId: "declared-ui-request" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non è stato possibile completare la richiesta.");
    expect(screen.queryByText(/untrusted test text|committed_reply_turn_ids_collide/)).not.toBeInTheDocument();
    const reply = classifyChatOutcome({ status: 200, statusText: "OK", body: {
      exchange_status: "complete", outcome_kind: "reply", reply: "test reply", user_turn_id: 42, assistant_turn_id: 43,
    } });
    view.rerender(<ChatProcessingNotice state={chatProcessingNoticeFromOutcome(reply)} />);
    expect(view.container).toBeEmptyDOMElement();
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(reconcileChatProcessingMessages(processing, [{ ...committed, sender: "user" }])).toBe(processing);
    expect(reconcileChatProcessingMessages(processing, [{ ...committed, client_message_id: "current" }])).toBeNull();
  });
});
