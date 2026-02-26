import { useState, useRef, useEffect } from "react";
import {
  Phone, Video, Search, MoreVertical, Smile, Paperclip, Mic, Send, ArrowLeft,
  Check, CheckCheck, File, Image, Reply, Copy, Trash2, Forward, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chat, Message, Contact } from "./types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  onSendMessage: (content: string, type: Message["type"]) => void;
  onBack: () => void;
  onStartVideoCall: (chat: Chat) => void;
}

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","👍","👋","🎉","🔥","❤️","💯","🚀","✅","⭐","💪","🙏","😊","🤩","👏"];

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatMsgTime(d: Date) {
  return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function StatusIcon({ status }: { status: Message["status"] }) {
  if (status === "sent") return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  return <CheckCheck className="h-3 w-3 text-primary" />;
}

export default function ChatView({ chat, messages, onSendMessage, onBack, onStartVideoCall }: ChatViewProps) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const contact = chat.participants[0];
  const isOnline = contact?.status === "online";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text.trim(), "text");
    setText("");
    setReplyTo(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const dateStr = msg.timestamp.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateStr) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, messages: [msg] });
    }
  });

  const filteredHighlight = searchQuery.toLowerCase();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">
            {getInitials(chat.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{chat.name}</p>
          <p className="text-xs text-muted-foreground">
            {chat.type === "group"
              ? `${chat.participants.length} participantes`
              : isOnline ? "En línea" : contact?.lastSeen ? `Últ. vez ${contact.lastSeen}` : "Desconectado"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onStartVideoCall(chat)} title="Videollamada">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Llamada de voz">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!searchOpen)} title="Buscar">
            <Search className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Info del contacto</DropdownMenuItem>
              <DropdownMenuItem>Archivos compartidos</DropdownMenuItem>
              <DropdownMenuItem>Silenciar</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Eliminar chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Buscar en la conversación..."
            className="h-8 bg-background"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <Button variant="ghost" size="icon" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, hsl(var(--accent) / 0.03) 0%, transparent 50%)" }}>
        <div className="max-w-3xl mx-auto space-y-4">
          {groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex justify-center my-4">
                <span className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                  {group.date}
                </span>
              </div>
              <div className="space-y-1">
                {group.messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMe={msg.senderId === "me"}
                    chatType={chat.type}
                    participants={chat.participants}
                    highlight={filteredHighlight}
                    onReply={() => setReplyTo(msg)}
                    onCopy={() => { navigator.clipboard.writeText(msg.content); toast.success("Copiado"); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/30">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">{replyTo.senderId === "me" ? "Tú" : chat.name}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setReplyTo(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-card">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0"><Smile className="h-5 w-5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" side="top">
            <div className="grid grid-cols-10 gap-1">
              {EMOJIS.map(e => (
                <button key={e} className="text-lg hover:bg-muted rounded p-0.5" onClick={() => setText(t => t + e)}>
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => toast.info("Adjuntar archivo (demo)")}>
          <Paperclip className="h-5 w-5" />
        </Button>
        <Input
          ref={inputRef}
          placeholder="Escribe un mensaje..."
          className="flex-1 bg-muted/50"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {text.trim() ? (
          <Button size="icon" onClick={handleSend} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => toast.info("Nota de voz (demo)")}>
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message, isMe, chatType, participants, highlight, onReply, onCopy,
}: {
  message: Message; isMe: boolean; chatType: Chat["type"]; participants: Contact[];
  highlight: string; onReply: () => void; onCopy: () => void;
}) {
  const sender = participants.find(p => p.id === message.senderId);

  const highlightText = (text: string) => {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-warning/30 text-foreground rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  };

  return (
    <div className={cn("flex group", isMe ? "justify-end" : "justify-start")}>
      <div className={cn(
        "relative max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm",
        isMe
          ? "bg-primary text-primary-foreground rounded-br-md"
          : "bg-card border border-border rounded-bl-md"
      )}>
        {/* Group sender name */}
        {chatType === "group" && !isMe && sender && (
          <p className="text-[11px] font-semibold text-accent mb-0.5">{sender.name}</p>
        )}

        {/* Content */}
        {message.type === "file" ? (
          <div className="flex items-center gap-2">
            <File className="h-4 w-4 shrink-0" />
            <span className="text-sm underline">{message.fileName}</span>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{highlightText(message.content)}</p>
        )}

        {/* Time and status */}
        <div className={cn("flex items-center gap-1 mt-1", isMe ? "justify-end" : "justify-end")}>
          <span className={cn("text-[10px]", isMe ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {formatMsgTime(message.timestamp)}
          </span>
          {isMe && <StatusIcon status={message.status} />}
        </div>

        {/* Context menu on hover */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isMe ? "end" : "start"}>
              <DropdownMenuItem onClick={onReply}><Reply className="h-3 w-3 mr-2" /> Responder</DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}><Copy className="h-3 w-3 mr-2" /> Copiar</DropdownMenuItem>
              <DropdownMenuItem><Forward className="h-3 w-3 mr-2" /> Reenviar</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive"><Trash2 className="h-3 w-3 mr-2" /> Eliminar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
