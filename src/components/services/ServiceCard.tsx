import type { Service } from "@/types";
import { Card } from "@/components/ui/card";
import ConnectedServiceBadge from "./ConnectedServiceBadge";
import { Badge } from "@/components/ui/badge";

interface ServiceCardProps {
  service: Service;
  onClick?: () => void;
  disabled?: boolean;
}

const ServiceCard = ({ service, onClick, disabled }: ServiceCardProps) => {
  const isClickable = !disabled && service.connection_status === "connected";

  return (
    <Card
      className={`glass p-4 transition-all ${
        isClickable
          ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg hover:shadow-neon-purple/20"
          : disabled
          ? "opacity-50"
          : ""
      }`}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple/20 to-accent/20">
          <span className="text-2xl">{service.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-foreground">{service.display_name}</h3>
            <ConnectedServiceBadge status={service.connection_status} />
          </div>

          {service.account_label && (
            <p className="text-sm text-muted-foreground mb-2">{service.account_label}</p>
          )}

          {service.capabilities && service.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {service.capabilities.slice(0, 3).map((capability, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs bg-background/50 border-neon-purple/30"
                >
                  {capability}
                </Badge>
              ))}
              {service.capabilities.length > 3 && (
                <Badge variant="outline" className="text-xs bg-background/50">
                  +{service.capabilities.length - 3} more
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ServiceCard;
