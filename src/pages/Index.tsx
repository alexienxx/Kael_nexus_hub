import { useState } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatArea from "@/components/ChatArea";
import { MessageSquare } from "lucide-react";

const Index = () => {
  const [activeChat, setActiveChat] = useState("1");

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 shrink-0 border-r border-border">
        <ChatSidebar activeChat={activeChat} onSelectChat={setActiveChat} />
      </div>

      {/* Chat area */}
      <div className="flex-1">
        {activeChat ? (
          <ChatArea key={activeChat} chatId={activeChat} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <MessageSquare size={28} className="text-primary animate-pulse-glow" />
            </div>
            <p className="font-display text-lg">Seleziona una conversazione</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
