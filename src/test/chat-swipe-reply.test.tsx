import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThemeProvider } from "@/lib/store/theme";
import type { ChatMessage } from "@/types";

vi.mock("@/components/chat/MessageActions", () => ({ default: () => null }));
vi.mock("@/components/chat/AudioMessage", () => ({ default: () => null }));
vi.mock("@/components/chat/ImageMessage", () => ({ default: () => null }));
vi.mock("@/components/chat/BubbleContextMenu", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/chat/PlaylistCard", () => ({ default: () => null }));
vi.mock("@/components/media/TrackCard", () => ({ default: () => null }));

const message: ChatMessage = {
  id: "turn-4180",
  backend_turn_id: 4180,
  sender: "kael",
  text: "Non voglio dare per scontato nulla.",
  time: "21:10",
};

function renderBubble(onSwipeReply = vi.fn()) {
  render(
    <ThemeProvider>
      <MessageBubble message={message} onSwipeReply={onSwipeReply} />
    </ThemeProvider>,
  );
  return {
    bubble: screen.getByTestId("message-bubble-turn-4180"),
    onSwipeReply,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("message drag-to-reply", () => {
  it("selects a message only after hold and sufficient horizontal drag", () => {
    vi.useFakeTimers();
    const { bubble, onSwipeReply } = renderBubble();

    fireEvent.touchStart(bubble, {
      touches: [{ clientX: 10, clientY: 100 }],
    });
    act(() => vi.advanceTimersByTime(170));
    fireEvent.touchMove(bubble, {
      touches: [{ clientX: 110, clientY: 105 }],
    });

    expect(bubble.style.transform).toContain("translateX");
    fireEvent.touchEnd(bubble, {
      changedTouches: [{ clientX: 110, clientY: 105 }],
    });

    expect(onSwipeReply).toHaveBeenCalledTimes(1);
    expect(onSwipeReply).toHaveBeenCalledWith(message);
    expect(bubble.style.transform).toBe("translateX(0px)");
  });

  it("does not reply on an ordinary horizontal scroll before hold", () => {
    vi.useFakeTimers();
    const { bubble, onSwipeReply } = renderBubble();
    fireEvent.touchStart(bubble, {
      touches: [{ clientX: 10, clientY: 100 }],
    });
    fireEvent.touchMove(bubble, {
      touches: [{ clientX: 130, clientY: 102 }],
    });
    fireEvent.touchEnd(bubble, {
      changedTouches: [{ clientX: 130, clientY: 102 }],
    });
    expect(onSwipeReply).not.toHaveBeenCalled();
  });

  it("cancels the gesture when vertical movement indicates scrolling", () => {
    vi.useFakeTimers();
    const { bubble, onSwipeReply } = renderBubble();
    fireEvent.touchStart(bubble, {
      touches: [{ clientX: 10, clientY: 100 }],
    });
    act(() => vi.advanceTimersByTime(170));
    fireEvent.touchMove(bubble, {
      touches: [{ clientX: 35, clientY: 180 }],
    });
    fireEvent.touchEnd(bubble, {
      changedTouches: [{ clientX: 35, clientY: 180 }],
    });
    expect(onSwipeReply).not.toHaveBeenCalled();
  });
});
