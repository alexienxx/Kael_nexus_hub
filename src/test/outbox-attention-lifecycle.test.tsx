import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OutboxAttentionPanel from "@/components/chat/OutboxAttentionPanel";
import ChatProcessingNotice from "@/components/chat/ChatProcessingNotice";
import type { DurableTextExchange, TextOutboxSummary } from "@/lib/chat/durableExchangeStore";

const entry: DurableTextExchange = {
  schemaVersion: 1,
  clientMessageId: "declared-ui-control",
  timelineKey: "default",
  sessionId: "default",
  requestBody: {
    text: "Declared component control; no backend send.",
    session_id: "default",
    client_time: "2026-10-24T00:00:00Z",
    client_message_id: "declared-ui-control",
  },
  bodyHash: "component-control",
  state: "recovery_required",
  attempts: 1,
  createdAtMs: 1,
  updatedAtMs: 2,
  nextAttemptAtMs: 0,
};
const clear: TextOutboxSummary = { total: 0, capacity: 100, blocked: false, attention: [] };
const blocked: TextOutboxSummary = { total: 1, capacity: 100, blocked: true, attention: [entry] };
function panel(summary: TextOutboxSummary, busyClientMessageId: string | null = null) {
  return <OutboxAttentionPanel summary={summary} busyClientMessageId={busyClientMessageId}
    onRetry={() => { throw new Error("A notification must not retry a send"); }}
    onRemove={() => { throw new Error("A notification must not remove a send"); }} />;
}
afterEach(cleanup);

describe("outbox notification lifecycle, with the real component and clock", () => {
  it("does not announce restored failures or a restored full queue on opening", () => {
    const view = render(panel(blocked));
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
    render(panel({ ...clear, total: 100 }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("expires a newly observed failure after five seconds without changing its durable state", async () => {
    const failure = { kind: "retryable_failure" as const, clientMessageId: "declared-new-request" };
    const view = render(<>{panel(clear)}<ChatProcessingNotice state={null} /></>);
    view.rerender(<>{panel(blocked)}<ChatProcessingNotice state={failure} /></>);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Non è stato possibile completare una richiesta.");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
    view.rerender(<>{panel({ ...blocked, attention: [{ ...entry }] }, entry.clientMessageId)}<ChatProcessingNotice state={{ ...failure }} /></>);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 4_200)); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(blocked.attention[0].state).toBe("recovery_required");
  }, 15_000);

  it("does not replay the visible failure after closing and reopening the chat", () => {
    const view = render(panel(clear));
    view.rerender(panel(blocked));
    expect(screen.getByRole("alert")).toBeVisible();
    view.unmount();
    render(panel(blocked));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not turn an initial history-load failure into a send notification", () => {
    const view = render(<ChatProcessingNotice state={null} />);
    view.rerender(<ChatProcessingNotice state={{ kind: "terminal_failure", errorCode: "timeline_unavailable" }} />);
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
    render(<ChatProcessingNotice state={{ kind: "recovery_required", clientMessageId: "restored-request" }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
