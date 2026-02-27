import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="w-80 flex flex-col bg-[hsl(240_8%_10%)] border-l border-[hsl(0_0%_100%/0.1)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(0_0%_100%/0.1)]">
        <h3 className="text-sm font-semibold text-[hsl(0_0%_96%)]">Chat de la llamada</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-[hsl(0_0%_96%/0.7)]" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-[hsl(0_0%_96%/0.4)] text-center py-8">
              Los mensajes del chat aparecerán aquí
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender === localIdentity;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] text-[hsl(0_0%_96%/0.5)] mb-0.5">
                    {msg.senderName}
                  </span>
                )}
                <div
                  className={`rounded-lg px-3 py-1.5 max-w-[85%] text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)]"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[9px] text-[hsl(0_0%_96%/0.3)] mt-0.5">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-[hsl(0_0%_100%/0.1)]">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribe un mensaje..."
            className="bg-[hsl(0_0%_100%/0.05)] border-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] text-sm placeholder:text-[hsl(0_0%_96%/0.3)]"
          />
          <Button size="icon" className="shrink-0" onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
