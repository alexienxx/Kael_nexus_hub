import { useState } from "react";
import {
  Palette,
  Globe,
  User,
  Bell,
  Sliders,
  ChevronRight,
  RotateCcw,
  Download,
  Bot,
} from "lucide-react";
import KaelHeader from "@/components/layout/KaelHeader";
import ThemeCustomizer from "@/components/settings/ThemeCustomizer";
import BackendConfig from "@/components/settings/BackendConfig";
import ProfileEditor from "@/components/settings/ProfileEditor";
import UpdateSettings from "@/components/settings/UpdateSettings";
import ExternalAgentSettings from "@/components/settings/ExternalAgentSettings";

type SettingsSection = "main" | "theme" | "backend" | "profile" | "updates" | "external_agent";

const Settings = () => {
  const [section, setSection] = useState<SettingsSection>("main");

  if (section === "theme") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader
          title="Tema"
          showStatus={false}
          rightContent={
            <button onClick={() => setSection("main")} className="text-sm text-neon-purple">
              ← Indietro
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto">
          <ThemeCustomizer />
        </div>
      </div>
    );
  }

  if (section === "backend") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader
          title="Connessione"
          showStatus={false}
          rightContent={
            <button onClick={() => setSection("main")} className="text-sm text-neon-purple">
              ← Indietro
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto">
          <BackendConfig />
        </div>
      </div>
    );
  }

  if (section === "profile") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader
          title="Profilo"
          showStatus={false}
          rightContent={
            <button onClick={() => setSection("main")} className="text-sm text-neon-purple">
              ← Indietro
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto">
          <ProfileEditor />
        </div>
      </div>
    );
  }

  if (section === "updates") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader
          title="Aggiornamenti"
          showStatus={false}
          rightContent={
            <button onClick={() => setSection("main")} className="text-sm text-neon-purple">
              ← Indietro
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto">
          <UpdateSettings />
        </div>
      </div>
    );
  }

  if (section === "external_agent") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader
          title="Agente Esterno"
          showStatus={false}
          rightContent={
            <button onClick={() => setSection("main")} className="text-sm text-neon-purple">
              ← Indietro
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto">
          <ExternalAgentSettings />
        </div>
      </div>
    );
  }

  const menuItems = [
    { id: "profile" as const, icon: User, label: "Profilo Kael", desc: "Avatar e identità" },
    { id: "theme" as const, icon: Palette, label: "Personalizzazione", desc: "Colori, bolle, sfondo, blur" },
    { id: "backend" as const, icon: Globe, label: "Connessione Backend", desc: "URL, API key, stato" },
    { id: "external_agent" as const, icon: Bot, label: "Agente Esterno", desc: "API key, modello AI" },
    { id: "updates" as const, icon: Download, label: "Aggiornamenti", desc: "Versione, update remoti" },
  ];

  return (
    <div className="flex h-full flex-col">
      <KaelHeader title="Settings" showStatus={false} showBack />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {menuItems.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className="glass flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-purple/15 text-neon-purple">
              <Icon size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}

        <div className="pt-6">
          <p className="mb-2 text-center text-[10px] text-muted-foreground">
            Kael Companion v1.0
          </p>
          <p className="text-center text-[10px] text-muted-foreground/50">
            Built with 💜
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
