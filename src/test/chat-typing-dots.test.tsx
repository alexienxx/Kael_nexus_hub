import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import ChatTypingDots from "@/components/chat/ChatTypingDots";
import { GENERATION_HINT_MAX_AGE_MS } from "@/lib/chat/generationActivity";
const id = "866454a1-9d9d-4b26-93ca-140ea331126f";
const id2 = "866454a1-9d9d-4b26-93ca-140ea331126e";
function hint(active: boolean, activity_id = id, extra = {}) {
  act(() => window.dispatchEvent(new CustomEvent("kael-generation-activity", {detail: {
    active, activity_id, surface: "human_chat", ts: Date.now()/1000, ...extra,
  }})));
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("D5 request activity dots", () => {
  it("starts only on admitted D5 metadata; stops on corresponding end, not another request", () => {
    render(<ChatTypingDots />);
    expect(screen.queryByRole("status")).toBeNull();
    hint(true, id, {surface: "codex"}); expect(screen.queryByRole("status")).toBeNull();
    hint(true); expect(screen.getByRole("status")).toHaveAccessibleName("Arrakis sta scrivendo");
    hint(false, id2); expect(screen.getByRole("status")).toBeInTheDocument();
    hint(false); expect(screen.queryByRole("status")).toBeNull();
  });
  it("clears disconnected hints and expires missing stop without asserting completion", () => {
    vi.useFakeTimers(); render(<ChatTypingDots />); hint(true);
    act(() => window.dispatchEvent(new CustomEvent("kael-generation-reset")));
    expect(screen.queryByRole("status")).toBeNull();
    hint(true); act(() => vi.advanceTimersByTime(GENERATION_HINT_MAX_AGE_MS));
    expect(screen.queryByRole("status")).toBeNull();
    hint(true, id, {ts: (Date.now()-GENERATION_HINT_MAX_AGE_MS-1)/1000});
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
