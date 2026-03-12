import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api/client";
import type { ConnectionStatus } from "@/types";

const statusConfig: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  connected: { label: "Online", color: "text-online", dot: "bg-online" },
  connecting: { label: "Connecting...", color: "text-yellow-400", dot: "bg-yellow-400 animate-pulse" },
  disconnected: { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  error: { label: "Error", color: "text-destructive", dot: "bg-destructive" },
};

const ConnectionBadge = () => {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      setStatus("connecting");
      const ok = await checkHealth();
      if (mounted) setStatus(ok ? "connected" : "disconnected");
    };

    check();
    const interval = setInterval(check, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const cfg = statusConfig[status];

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
};

export default ConnectionBadge;
