import type { ConnectionState } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConnectedServiceBadgeProps {
  status: ConnectionState;
  className?: string;
}

const ConnectedServiceBadge = ({ status, className }: ConnectedServiceBadgeProps) => {
  const statusConfig = {
    connected: {
      label: "Connected",
      variant: "default" as const,
      className: "bg-online/20 text-online border-online/30",
    },
    not_connected: {
      label: "Not Connected",
      variant: "outline" as const,
      className: "border-muted-foreground/30 text-muted-foreground",
    },
    pending: {
      label: "Pending",
      variant: "secondary" as const,
      className: "bg-neon-purple/20 text-neon-purple border-neon-purple/30",
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
};

export default ConnectedServiceBadge;
