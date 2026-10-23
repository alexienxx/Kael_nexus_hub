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
afterEach(cleanup);

describe("recovery actions on the actual message components", () => {
  it("retains a failed receipt indication without restoring verbose delivery notes", () => {
    render(<ThemeProvider><MessageBubble message={message} /></ThemeProvider>);
    expect(screen.getByText("messaggio non consegnato")).toBeVisible();
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
});
