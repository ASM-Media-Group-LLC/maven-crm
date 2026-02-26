import { useState, useRef, useEffect, useCallback } from "react";
import {
  Phone, Video, Search, MoreVertical, Smile, Paperclip, Send, ArrowLeft,
  Check, CheckCheck, File, Reply, Copy, Trash2, Forward, X, Edit2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ConversationWithDetails, ChatMessage, UserProfile } from "./types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ChatViewProps {
  conversation: ConversationWithDetails;
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails) => void;
  loading: boolean;
}

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","👍","👋","🎉","🔥","❤️","💯","🚀","✅","⭐","💪","🙏","😊","🤩","👏"];

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatMsgTime(d: string) {
  return new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatView({
  conversation, messages, profiles, typingUsers, onSendMessage, onSendTyping,
  onEditMessage, onDeleteMessage, onBack, onStartVideoCall, loading,
}: ChatViewProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text.trim(), "text", undefined, undefined, replyTo?.id);
    setText("");
    setReplyTo(null);
    onSendTyping(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (val: string) => {
    setText(val);
    onSendTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onSendTyping(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("chat-files").upload(path, file);
    if (error) {
      toast.error("Error al subir archivo");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const type = file.type.startsWith("image/") ? "image" : "file";
    onSendMessage(file.name, type as ChatMessage["type"], urlData.publicUrl, file.name);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  messages.forEach(msg => {
    const dateStr = new Date(msg.created_at).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateStr) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, messages: [msg] });
    }
  });

  const typingNames = typingUsers
    .map(id => profiles[id]?.full_name || "Alguien")
    .join(", ");

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">
            {getInitials(conversation.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{conversation.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {typingNames
              ? `${typingNames} está escribiendo...`
              : conversation.type === "group"
                ? `${conversation.participants.length} participantes`
                : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onStartVideoCall(conversation)} title="Videollamada">
            <Video className="h-4 w-4" />
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
                      isMe={msg.sender_id === user?.id}
                      chatType={conversation.type}
                      profiles={profiles}
                      highlight={searchQuery.toLowerCase()}
                      onReply={() => setReplyTo(msg)}
                      onCopy={() => { navigator.clipboard.writeText(msg.content || ""); toast.success("Copiado"); }}
                      onEdit={(content) => onEditMessage(msg.id, content)}
                      onDelete={() => onDeleteMessage(msg.id)}
                      replyMessage={msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/30">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">
              {replyTo.sender_id === user?.id ? "Tú" : profiles[replyTo.sender_id]?.full_name || "Usuario"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setReplyTo(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 flex items-end gap-2 px-4 py-3 border-t border-border bg-card">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 mb-0.5"><Smile className="h-5 w-5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" side="top">
            <div className="grid grid-cols-10 gap-1">
              {EMOJIS.map(e => (
                <button key={e} className="text-lg hover:bg-muted rounded p-0.5" onClick={() => handleTextChange(text + e)}>
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        <Button variant="ghost" size="icon" className="shrink-0 mb-0.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </Button>
        <Textarea
          ref={inputRef}
          placeholder="Escribe un mensaje..."
          className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-muted/50"
          rows={1}
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button size="icon" onClick={handleSend} className="shrink-0 mb-0.5" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({
  message, isMe, chatType, profiles, highlight, onReply, onCopy, onEdit, onDelete, replyMessage,
}: {
  message: ChatMessage; isMe: boolean; chatType: string; profiles: Record<string, UserProfile>;
  highlight: string; onReply: () => void; onCopy: () => void;
  onEdit: (content: string) => void; onDelete: () => void;
  replyMessage?: ChatMessage;
}) {
  const senderName = profiles[message.sender_id]?.full_name || "Usuario";

  if (message.is_deleted) {
    return (
      <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
        <div className="max-w-[75%] rounded-2xl px-3.5 py-2 bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground italic">Mensaje eliminado</p>
        </div>
      </div>
    );
  }

  const highlightText = (text: string) => {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-accent/30 text-foreground rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
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
        {/* Reply reference */}
        {replyMessage && (
          <div className={cn(
            "text-[11px] mb-1 px-2 py-1 rounded border-l-2",
            isMe ? "bg-primary-foreground/10 border-primary-foreground/30" : "bg-muted/50 border-primary/30"
          )}>
            <p className="font-medium">{profiles[replyMessage.sender_id]?.full_name || "Usuario"}</p>
            <p className="truncate">{replyMessage.content}</p>
          </div>
        )}

        {/* Group sender name */}
        {chatType === "group" && !isMe && (
          <p className="text-[11px] font-semibold text-accent-foreground mb-0.5">{senderName}</p>
        )}

        {/* Content */}
        {message.type === "file" || message.type === "image" ? (
          message.type === "image" && message.file_url ? (
            <div>
              <img src={message.file_url} alt={message.file_name || "image"} className="rounded-lg max-w-full max-h-64 object-cover" />
              {message.content && message.content !== message.file_name && (
                <p className="text-sm mt-1">{highlightText(message.content)}</p>
              )}
            </div>
          ) : (
            <a href={message.file_url || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
              <File className="h-4 w-4 shrink-0" />
              <span className="text-sm">{message.file_name || "Archivo"}</span>
            </a>
          )
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{highlightText(message.content || "")}</p>
        )}

        {/* Time and edited indicator */}
        <div className={cn("flex items-center gap-1 mt-1", "justify-end")}>
          {message.is_edited && (
            <span className={cn("text-[10px]", isMe ? "text-primary-foreground/50" : "text-muted-foreground")}>editado</span>
          )}
          <span className={cn("text-[10px]", isMe ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {formatMsgTime(message.created_at)}
          </span>
        </div>

        {/* Context menu */}
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
              {isMe && (
                <>
                  <DropdownMenuItem onClick={() => {
                    const newContent = prompt("Editar mensaje:", message.content || "");
                    if (newContent && newContent !== message.content) onEdit(newContent);
                  }}><Edit2 className="h-3 w-3 mr-2" /> Editar</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3 w-3 mr-2" /> Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
