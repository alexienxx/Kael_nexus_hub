import { useRef, useCallback, useEffect } from "react";

interface UseLongPressOptions {
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  delay?: number;
  onPress?: () => void;
}

/**
 * Hook for long-press detection.
 * Returns event handlers to spread on the target element.
 */
export function useLongPress({ onLongPress, delay = 500, onPress }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => clear, [clear]);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      isLongPress.current = false;

      // Record start position to detect movement (cancel if dragged)
      if ("touches" in e) {
        startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
        startPos.current = { x: e.clientX, y: e.clientY };
      }

      timerRef.current = setTimeout(() => {
        isLongPress.current = true;

        // Vibration feedback on mobile
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }

        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay]
  );

  const move = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!startPos.current) return;

      let x: number, y: number;
      if ("touches" in e) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else {
        x = e.clientX;
        y = e.clientY;
      }

      // Cancel if moved more than 10px
      const dx = Math.abs(x - startPos.current.x);
      const dy = Math.abs(y - startPos.current.y);
      if (dx > 10 || dy > 10) {
        clear();
      }
    },
    [clear]
  );

  const end = useCallback(
    (_e: React.TouchEvent | React.MouseEvent) => {
      if (!isLongPress.current && onPress) {
        onPress();
      }
      clear();
      startPos.current = null;
    },
    [clear, onPress]
  );

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
  };
}
