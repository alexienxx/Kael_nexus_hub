import { Send, Paperclip, Smile, Phone, Video, MoreVertical } from "lucide-react";
import { useState } from "react";

interface Message {
  id: string;
  text: string;
  time: string;
  own: boolean;
}

const chatData: Record<string, { name: string; online: boolean; messages: Message[] }> = {
  "1": {
    name: "Aria Nova",
    online: true,
    messages: [
      { id: "1", text: "Ciao! Come procede il progetto?", time: "14:20", own: false },
      { id: "2", text: "Tutto bene! Sto finendo l'interfaccia", time: "14:22", own: true },
      { id: "3", text: "Fantastico, non vedo l'ora di vederla", time: "14:25", own: false },
      { id: "4", text: "Ti mando uno screenshot tra poco 📸", time: "14:28", own: true },
      { id: "5", text: "Il progetto è quasi pronto 🚀", time: "14:32", own: false },
    ],
  },
  "2": {
    name: "Luca Stein",
    online: true,
    messages: [
      { id: "1", text: "Ehi, ci vediamo domani per il meeting?", time: "12:50", own: false },
      { id: "2", text: "Sì, alle 10 va bene?", time: "13:00", own: true },
      { id: "3", text: "Ci vediamo domani?", time: "13:10", own: false },
    ],
  },
  "3": {
    name: "Maya Chen",
    online: false,
    messages: [
      { id: "1", text: "Ho inviato i file sul cloud", time: "11:40", own: false },
      { id: "2", text: "Perfetto, li controllo subito", time: "11:42", own: true },
      { id: "3", text: "Ho inviato i file", time: "11:45", own: false },
    ],
  },
  "4": {
    name: "Dex Harlow",
    online: false,
    messages: [
      { id: "1", text: "Grazie per l'aiuto!", time: "Ieri", own: false },
      { id: "2", text: "Perfetto, grazie!", time: "Ieri", own: false },
    ],
  },
  "5": {
    name: "Zara Kim",
    online: true,
    messages: [
      { id: "1", text: "Hai visto il nuovo layout?", time: "Ieri", own: true },
      { id: "2", text: "Bellissimo design ✨", time: "Ieri", own: false },
    ],
  },
  "6": {
    name: "Team Devs",
    online: false,
    messages: [
      { id: "1", text: "Build passata ✅", time: "Lun", own: false },
      { id: "2", text: "Deploy completato", time: "Lun", own: false },
    ],
  },
};

interface ChatAreaProps {
  chatId: string;
}

const ChatArea = ({ chatId }: ChatAreaProps) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(chatData[chatId]?.messages || []);
  const chat = chatData[chatId];

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      text: input,
      time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      own: true,
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  };

  if (!chat) return null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground">
              {chat.name.split(" ").map((n) => n[0]).join("")}
            </div>
            {chat.online && (
              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-online" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{chat.name}</h2>
            <p className="text-xs text-muted-foreground">
              {chat.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[Phone, Video, MoreVertical].map((Icon, i) => (
            <button key={i} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.own ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                msg.own
                  ? "bg-chat-own text-foreground rounded-br-md"
                  : "bg-chat-other text-foreground rounded-bl-md"
              }`}
            >
              <p className="text-sm leading-relaxed">{msg.text}</p>
              <p className={`mt-1 text-[10px] ${msg.own ? "text-primary/60" : "text-muted-foreground"}`}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
          <button className="text-muted-foreground transition-colors hover:text-foreground">
            <Paperclip size={18} />
          </button>
          <input
            type="text"
            placeholder="Scrivi un messaggio..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button className="text-muted-foreground transition-colors hover:text-foreground">
            <Smile size={18} />
          </button>
          <button
            onClick={handleSend}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
