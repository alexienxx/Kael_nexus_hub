import { Search, Plus, MessageSquare } from "lucide-react";
import { useState } from "react";

interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

const contacts: Contact[] = [
  { id: "1", name: "Aria Nova", avatar: "AN", lastMessage: "Il progetto è quasi pronto 🚀", time: "14:32", unread: 3, online: true },
  { id: "2", name: "Luca Stein", avatar: "LS", lastMessage: "Ci vediamo domani?", time: "13:10", unread: 0, online: true },
  { id: "3", name: "Maya Chen", avatar: "MC", lastMessage: "Ho inviato i file", time: "11:45", unread: 1, online: false },
  { id: "4", name: "Dex Harlow", avatar: "DH", lastMessage: "Perfetto, grazie!", time: "Ieri", unread: 0, online: false },
  { id: "5", name: "Zara Kim", avatar: "ZK", lastMessage: "Bellissimo design ✨", time: "Ieri", unread: 0, online: true },
  { id: "6", name: "Team Devs", avatar: "TD", lastMessage: "Deploy completato", time: "Lun", unread: 5, online: false },
];

interface ChatSidebarProps {
  activeChat: string;
  onSelectChat: (id: string) => void;
}

const ChatSidebar = ({ activeChat, onSelectChat }: ChatSidebarProps) => {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          <span className="text-primary">Kael</span> Chat
        </h1>
        <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Plus size={20} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Cerca conversazione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filtered.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelectChat(contact.id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-all ${
              activeChat === contact.id
                ? "bg-secondary"
                : "hover:bg-secondary/50"
            }`}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground">
                {contact.avatar}
              </div>
              {contact.online && (
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-sidebar bg-online" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">
                  {contact.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {contact.time}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-muted-foreground truncate">
                  {contact.lastMessage}
                </p>
                {contact.unread > 0 && (
                  <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {contact.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChatSidebar;
