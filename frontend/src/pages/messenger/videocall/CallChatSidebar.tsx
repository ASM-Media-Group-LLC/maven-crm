import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LKChatMessage } from "@/hooks/useLiveKit";

interface CallChatSidebarProps {
  messages: LKChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
  localIdentity: string;
}

export default function CallChatSidebar({ messages, onSend, onClose, localIdentity }: CallChatSidebarProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="w-80 flex flex-col bg-[hsl(220_3%_17%)] border-l border-[hsl(220_3%_25%)] rounded-l-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(220_3%_25%)]">
        <h3 className="text-sm font-medium text-[hsl(220_3%_85%)]">Chat de la llamada</h3>
        <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center text-[hsl(220_3%_60%)] hover:bg-[hsl(220_3%_25%)] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-[hsl(220_3%_45%)] text-center py-8">
              Los mensajes del chat aparecerán aquí
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender === localIdentity;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] text-[hsl(220_3%_55%)] mb-0.5">{msg.senderName}</span>
                )}
                <div
                  className={`rounded-2xl px-3 py-1.5 max-w-[85%] text-sm ${
                    isMe
                      ? "bg-[hsl(214_82%_51%)] text-white rounded-br-md"
                      : "bg-[hsl(220_3%_25%)] text-[hsl(220_3%_85%)] rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[9px] text-[hsl(220_3%_40%)] mt-0.5">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-[hsl(220_3%_25%)]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-[hsl(220_3%_22%)] border border-[hsl(220_3%_30%)] rounded-full px-3.5 py-2 text-sm text-[hsl(220_3%_85%)] placeholder:text-[hsl(220_3%_45%)] focus:outline-none focus:ring-1 focus:ring-[hsl(214_82%_51%)]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-9 w-9 rounded-full bg-[hsl(214_82%_51%)] text-white flex items-center justify-center hover:bg-[hsl(214_82%_45%)] transition-colors disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
