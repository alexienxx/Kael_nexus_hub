import { useEffect, useState } from "react";

import { generationHint, GENERATION_HINT_MAX_AGE_MS } from "@/lib/chat/generationActivity";

export default function ChatTypingDots() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const requests = new Map<string, ReturnType<typeof setTimeout>>();
    const stop = (id: string) => {
      clearTimeout(requests.get(id)); requests.delete(id); setActive(requests.size > 0);
    };
    const reset = () => { requests.forEach(clearTimeout); requests.clear(); setActive(false); };
    const receive = (event: Event) => {
      const hint = generationHint((event as CustomEvent).detail);
      if (!hint) return;
      if (!hint.active) { stop(hint.activity_id); return; }
      // An old/replayed hint or hidden app cannot create a fresh animation.
      const age = Date.now() - hint.ts * 1000;
      if (document.visibilityState === "hidden" || age < -5000 || age >= GENERATION_HINT_MAX_AGE_MS) return;
      clearTimeout(requests.get(hint.activity_id));
      requests.set(hint.activity_id, setTimeout(() => stop(hint.activity_id), GENERATION_HINT_MAX_AGE_MS - Math.max(age, 0)));
      setActive(true);
    };
    const hide = () => { if (document.visibilityState === "hidden") reset(); };
    window.addEventListener("kael-generation-activity", receive);
    window.addEventListener("kael-generation-reset", reset);
    document.addEventListener("visibilitychange", hide);
    return () => {
      requests.forEach(clearTimeout);
      window.removeEventListener("kael-generation-activity", receive);
      window.removeEventListener("kael-generation-reset", reset);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  if (!active) return null;
  return <div role="status" aria-label="Arrakis sta scrivendo" className="flex w-fit items-center gap-1 rounded-2xl bg-muted px-4 py-3">
    {[0, 1, 2].map((n) => <span key={n} aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground motion-safe:animate-bounce" style={{ animationDelay: `${n * 150}ms` }} />)}
  </div>;
}
