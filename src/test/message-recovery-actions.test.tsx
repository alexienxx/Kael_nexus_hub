import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThemeProvider } from "@/lib/store/theme";
import type { ChatMessage } from "@/types";

const message: ChatMessage = {
  id: "declared-ui-message",
  sender: "user",
  text: "Declared component control; no backend send.",
  time: "10:00",
  client_message_id: "declared-ui-request",
  meta: { exchange_status: "recovery_required" },
};

const cachedProcessing: ChatMessage = { ...message, backend_turn_id: "741",
  meta: { exchange_status: "processing", exchange_id: "exchange:declared-receipt" } };
afterEach(cleanup);

describe("recovery actions on the actual message components", () => {
  it("preserves confirmed receipt when a cached processing row is reloaded", () => {
    const before = JSON.stringify(cachedProcessing);
    render(<ThemeProvider><MessageBubble message={cachedProcessing}
      onRetrySend={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("Messaggio ricevuto.")).toBeVisible();
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
    expect(screen.queryByText("Messaggio ricevuto. Elaborazione interrotta.")).toBeNull();
    expect(JSON.stringify(cachedProcessing)).toBe(before);
  });

  it.each([undefined, "0", "-1", "receipt-only"])(
    "does not claim received processing without a positive canonical user turn: %s", (turnId) => {
      render(<ThemeProvider><MessageBubble message={{ ...cachedProcessing, backend_turn_id: turnId }}
        onRetrySend={() => undefined} /></ThemeProvider>);
      expect(screen.queryByText("Messaggio ricevuto.")).toBeNull();
      expect(screen.getByText("messaggio non consegnato")).toBeVisible();
    },
  );

  it("does not call newer processing interrupted because an earlier view showed recovery", () => {
    const view = render(<ThemeProvider><MessageBubble message={{ ...cachedProcessing,
      meta: { ...cachedProcessing.meta, exchange_status: "recovery_required" } }}
      onRetrySend={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("Messaggio ricevuto. Elaborazione interrotta.")).toBeVisible();
    view.rerender(<ThemeProvider><MessageBubble message={cachedProcessing}
      onRetrySend={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("Messaggio ricevuto.")).toBeVisible();
    expect(screen.queryByText("Messaggio ricevuto. Elaborazione interrotta.")).toBeNull();
  });

  it.each(["transport_deferred", "retryable_failure"])("keeps the undelivered indication during %s", (status) => {
    render(<ThemeProvider><MessageBubble message={{ ...message, meta: { exchange_status: status } }} /></ThemeProvider>);
    expect(screen.getByText("messaggio non consegnato")).toBeVisible();
  });

  it.each(["queued", "in_progress", "complete"])("does not mark %s as a failed delivery", (status) => {
    render(<ThemeProvider><MessageBubble message={{ ...message, meta: { exchange_status: status } }} /></ThemeProvider>);
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
  });

  it("shows a received user turn even when recovery actions are available", () => {
    render(<ThemeProvider><MessageBubble message={{ ...message, backend_turn_id: "5414" }}
      onRetrySend={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("Messaggio ricevuto. Elaborazione interrotta.")).toBeVisible();
    expect(screen.queryByText("messaggio non consegnato")).toBeNull();
  });

  it("keeps a legacy recovery barrier without claiming confirmed receipt", () => {
    render(<ThemeProvider><MessageBubble message={message} /></ThemeProvider>);
    expect(screen.getByText("Risposta da recuperare.")).toBeVisible();
    expect(screen.queryByText(/Codice:|Consegnato|Outbox chat:/)).toBeNull();
  });

  it("opens the actual message menu by touch and delegates only the explicit retry", async () => {
    const actions: string[] = [];
    render(<ThemeProvider><MessageBubble message={message}
      onRetrySend={() => actions.push("retry original envelope")}
      onCancelSend={() => actions.push("cancel original envelope")}
    /></ThemeProvider>);
    fireEvent.touchStart(screen.getByTestId("message-bubble-declared-ui-message"), {
      touches: [{ clientX: 100, clientY: 200 }],
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
    expect(screen.getByRole("button", { name: "Annulla invio" })).toBeVisible();
    expect(actions).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Riprova invio" }));
    expect(actions).toEqual(["retry original envelope"]);
  });

  it("handles Android's native text context-menu event without invoking a retry", () => {
    const actions: string[] = [];
    render(<ThemeProvider><MessageBubble message={message}
      onSwipeReply={() => actions.push("reply")}
      onRetrySend={() => actions.push("retry")}
    /></ThemeProvider>);
    const nativeMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 200 });
    fireEvent(screen.getByText(message.text), nativeMenu);
    expect(nativeMenu.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Riprova invio" })).toBeVisible();
    expect(actions).toEqual([]);
  });
});
