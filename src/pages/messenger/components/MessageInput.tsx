import { useState, useRef, useCallback } from "react";
import { Smile, Paperclip, Send, X, Reply, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EMOJIS = [
  "😀","😂","😍","🥰","😎","🤔","👍","👋","🎉","🔥",
  "❤️","💯","🚀","✅","⭐","💪","🙏","😊","🤩","👏",
  "😅","🫡","🤝","💀","🥲","😤","🤓","🫠","🙌","💜",
];

interface MessageInputProps {
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  replyTo: ChatMessage | null;
  profiles: Record<string, UserProfile>;
  onCancelReply: () => void;
}

export default function MessageInput({
  onSendMessage, onSendTyping, replyTo, profiles, onCancelReply,
}: MessageInputProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSendMessage(text.trim(), "text", undefined, undefined, replyTo?.id);
    setText("");
    onCancelReply();
    onSendTyping(false);
    inputRef.current?.focus();
  }, [text, replyTo, onSendMessage, onCancelReply, onSendTyping]);

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
    const { error } = await supabase.storage.from("chat-files").upload(path, file);
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

  return (
    <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border animate-fade-in">
          <div className="h-8 w-1 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary">
              {replyTo.sender_id === user?.id ? "Tú" : profiles[replyTo.sender_id]?.full_name || "Usuario"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCancelReply}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 px-3 py-2.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground">
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" side="top" align="start">
            <div className="grid grid-cols-10 gap-0.5">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  className="text-lg hover:bg-muted rounded-md p-1 transition-colors"
                  onClick={() => handleTextChange(text + e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        <Button
          variant="ghost" size="icon"
          className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </Button>

        <div className="flex-1 relative">
          <Textarea
            ref={inputRef}
            placeholder="Escribe un mensaje..."
            className="min-h-[38px] max-h-[120px] resize-none bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-2xl px-4 py-2.5 text-sm"
            rows={1}
            value={text}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <Button
          size="icon"
          onClick={handleSend}
          className={cn(
            "shrink-0 h-9 w-9 rounded-full transition-all",
            text.trim()
              ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg scale-100"
              : "bg-muted text-muted-foreground scale-95 opacity-50"
          )}
          disabled={!text.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
