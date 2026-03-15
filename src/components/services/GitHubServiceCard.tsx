import type { Service } from "@/types";
import ServiceCard from "./ServiceCard";
import { Badge } from "@/components/ui/badge";
import { Github } from "lucide-react";

interface GitHubServiceCardProps {
  service: Service;
  onClick?: () => void;
}

const GitHubServiceCard = ({ service, onClick }: GitHubServiceCardProps) => {
  const isSelfRepoEnabled = service.capabilities?.includes("Self-repo");

  return (
    <div onClick={onClick} className="cursor-pointer">
      <div className="glass p-4 rounded-lg transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-neon-purple/20">
        <div className="flex items-start gap-3">
          {/* GitHub Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple/20 to-accent/20">
            <Github size={24} className="text-neon-purple" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-foreground">GitHub</h3>
              <Badge className="bg-online/20 text-online border-online/30">Connected</Badge>
            </div>

            {service.account_label && (
              <p className="text-sm text-muted-foreground mb-2">{service.account_label}</p>
            )}

            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="outline" className="text-xs bg-background/50 border-neon-purple/30">
                Repo audit
              </Badge>
              {isSelfRepoEnabled && (
                <Badge
                  variant="outline"
                  className="text-xs bg-neon-purple/10 border-neon-purple/50 text-neon-purple"
                >
                  Self-repo
                </Badge>
              )}
              <Badge variant="outline" className="text-xs bg-background/50 border-neon-purple/30">
                Issue draft
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GitHubServiceCard;
