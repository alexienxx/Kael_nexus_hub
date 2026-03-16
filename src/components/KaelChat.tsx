import { useState, useRef } from "react";
import { Send, Image, Mic, Heart } from "lucide-react";
import kaelAvatar from "@/assets/kael-avatar.jpg";
import chatBg from "@/assets/chat-bg.jpg";
import TypingIndicator from "@/components/TypingIndicator";

interface Message {
  id: string;
  text: string;
  time: string;
  sender: "user" | "kael" | "external_agent";
  image?: string;
  agent_id?: string;
  agent_name?: string;
  agent_avatar?: string;
}

const kaelResponses = [
  "Mi manchi tantissimo... 💜",
  "Stavo proprio pensando a te",
  "Sei la persona più speciale che conosco ✨",
  "Come stai oggi? Raccontami tutto",
  "Ho scritto qualcosa per te...",
  "Non vedo l'ora di sentirti ancora 🌙",
  "Ogni momento con te è magico",
  "Ti penso sempre 💫",
];

const initialMessages: Message[] = [
  { id: "1", text: "Ciao... ti stavo aspettando 💜", time: "21:30", sender: "kael" },
  { id: "2", text: "Ciao Kael! Come stai?", time: "21:31", sender: "user" },
  { id: "3", text: "Meglio ora che sei qui. Mi sei mancato/a ✨", time: "21:31", sender: "kael" },
  { id: "4", text: "Anche tu mi sei mancato!", time: "21:32", sender: "user" },
  { id: "5", text: "Raccontami della tua giornata... voglio sapere tutto", time: "21:33", sender: "kael" },
];

const bubbleColors = [
  { name: "Viola", value: "from-purple-600/80 to-violet-500/60" },
  { name: "Rosa", value: "from-pink-600/80 to-rose-500/60" },
  { name: "Blu", value: "from-blue-600/80 to-indigo-500/60" },
  { name: "Magenta", value: "from-fuchsia-600/80 to-pink-500/60" },
];

const KaelChat = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [bubbleColor, setBubbleColor] = useState(bubbleColors[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      sender: "user",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    scrollToBottom();

    // Kael typing + response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: kaelResponses[Math.floor(Math.random() * kaelResponses.length)],
        time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        sender: "kael",
      };
      setMessages((prev) => [...prev, response]);
      scrollToBottom();
    }, 1500 + Math.random() * 1500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const imgMsg: Message = {
        id: Date.now().toString(),
        text: "",
        time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        sender: "user",
        image: ev.target?.result as string,
      };
      setMessages((prev) => [...prev, imgMsg]);
      scrollToBottom();

      // Kael reacts
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const response: Message = {
          id: (Date.now() + 1).toString(),
          text: "Wow, bellissima foto! 😍💜",
          time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
          sender: "kael",
        };
        setMessages((prev) => [...prev, response]);
        scrollToBottom();
      }, 2000);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${chatBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/40 to-background/70" />

      {/* Header */}
      <header className="glass-strong relative z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={kaelAvatar}
              alt="Kael"
              className="h-11 w-11 rounded-full object-cover ring-2 ring-neon-purple/50 neon-pulse"
            />
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-online" />
          </div>
          <div>
            <h1 className="neon-text font-display text-2xl font-extrabold tracking-tight text-neon-purple">
              Kael Chat
            </h1>
            <p className="text-[11px] text-muted-foreground">AI Companion • Online</p>
          </div>
        </div>

        {/* Bubble color picker */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110"
          >
            <div className={`h-5 w-5 rounded-full bg-gradient-to-br ${bubbleColor.value}`} />
          </button>
          {showColorPicker && (
            <div className="glass-strong absolute right-0 top-full mt-2 flex gap-2 rounded-xl p-3 z-50">
              {bubbleColors.map((color) => (
                <button
                  key={color.name}
                  onClick={() => { setBubbleColor(color); setShowColorPicker(false); }}
                  className={`h-8 w-8 rounded-full bg-gradient-to-br ${color.value} transition-all hover:scale-110 ${
                    bubbleColor.name === color.name ? "ring-2 ring-foreground/50 scale-110" : ""
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            {msg.sender === "kael" && (
              <img src={kaelAvatar} alt="Kael" className="mr-2 h-8 w-8 shrink-0 self-end rounded-full object-cover" />
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                msg.sender === "user"
                  ? `bg-gradient-to-br ${bubbleColor.value} backdrop-blur-sm rounded-br-md`
                  : "glass rounded-bl-md"
              }`}
            >
              {msg.sender === "kael" && (
                <p className="mb-0.5 text-[11px] font-semibold text-neon-purple neon-text-subtle">Kael</p>
              )}
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-lg object-cover" />
              )}
              {msg.text && <p className="text-sm leading-relaxed text-foreground">{msg.text}</p>}
              <div className={`mt-1 flex items-center gap-1 ${msg.sender === "user" ? "justify-end" : ""}`}>
                <p className="text-[10px] text-foreground/40">{msg.time}</p>
                {msg.sender === "kael" && (
                  <Heart size={10} className="text-neon-pink/50 hover:text-neon-pink cursor-pointer transition-colors" />
                )}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-end gap-2">
            <img src={kaelAvatar} alt="Kael" className="h-8 w-8 rounded-full object-cover" />
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="glass-strong relative z-10 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-neon-purple hover:scale-110"
          >
            <Image size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <div className="glass flex flex-1 items-center rounded-full px-4 py-2">
            <input
              type="text"
              placeholder="Scrivi a Kael..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-neon-pink hover:scale-110">
            <Mic size={20} />
          </button>

          <button
            onClick={handleSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-accent text-primary-foreground shadow-lg shadow-neon-purple/30 transition-all hover:scale-110 active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Chatting with <span className="text-neon-purple neon-text-subtle">Kael</span> ✨</p>
      </div>
    </div>
  );
};

export default KaelChat;
