import { useState, useEffect, useMemo } from "react";
import { X, Download, FileText, Image as ImageIcon, File, Loader2, Link2, Film, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";

interface SharedFilesGalleryProps {
  conversationId: string;
  profiles: Record<string, UserProfile>;
  onClose: () => void;
}

type TabType = "all" | "media" | "documents" | "links";

import { formatFileSize as _formatFileSize } from "../uploadUtils";

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  return _formatFileSize(bytes);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

// Extract URLs from text content
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractLinks(messages: ChatMessage[]): { url: string; msg: ChatMessage }[] {
  const links: { url: string; msg: ChatMessage }[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (!msg.content) continue;
    const matches = msg.content.match(URL_REGEX);
    if (matches) {
      for (const url of matches) {
        if (!seen.has(url)) {
          seen.add(url);
          links.push({ url, msg });
        }
      }
    }
  }
  return links;
}

function isMediaFile(msg: ChatMessage): boolean {
  if (msg.type === "image") return true;
  const url = msg.file_url || "";
  return /\.(mp4|webm|mov|gif)(\?|$)/i.test(url) ||
    /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i.test(url) ||
    (msg.file_name?.startsWith("voice-note") ?? false);
}

function isDocumentFile(msg: ChatMessage): boolean {
  return msg.type === "file" && !isMediaFile(msg);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url.slice(0, 30);
  }
}

export default function SharedFilesGallery({ conversationId, profiles, onClose }: SharedFilesGalleryProps) {
  const [fileMessages, setFileMessages] = useState<ChatMessage[]>([]);
  const [textMessages, setTextMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("all");

  const fetchSharedFiles = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const [filesRes, textsRes] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .in("type", ["file", "image"])
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("type", "text")
        .eq("is_deleted", false)
        .like("content", "%http%")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setFileMessages((filesRes.data as ChatMessage[]) || []);
    setTextMessages((textsRes.data as ChatMessage[]) || []);
    if (showLoader) setLoading(false);
  };

  useEffect(() => {
    fetchSharedFiles();
  }, [conversationId]);

  // Real-time sync: refresh when messages change in this conversation
  useEffect(() => {
    const channel = supabase
      .channel(`shared-files-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = (payload.new || payload.old) as ChatMessage | undefined;
          if (!msg) return;
          // Only re-fetch if the message is relevant (file/image or text with link)
          const isRelevant =
            msg.type === "file" ||
            msg.type === "image" ||
            (msg.type === "text" && msg.content && /https?:\/\//i.test(msg.content));
          if (isRelevant || payload.eventType === "DELETE") {
            fetchSharedFiles(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const links = useMemo(() => extractLinks(textMessages), [textMessages]);
  const media = useMemo(() => fileMessages.filter(isMediaFile), [fileMessages]);
  const docs = useMemo(() => fileMessages.filter(isDocumentFile), [fileMessages]);

  const images = media.filter(f => f.type === "image");
  const videos = media.filter(f => f.type !== "image" && /\.(mp4|webm|mov|gif)(\?|$)/i.test(f.file_url || ""));
  const audio = media.filter(f =>
    /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i.test(f.file_url || "") || f.file_name?.startsWith("voice-note")
  );

  const totalCount = fileMessages.length + links.length;

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: totalCount },
    { key: "media", label: "Media", count: media.length },
    { key: "documents", label: "Documentos", count: docs.length },
    { key: "links", label: "Enlaces", count: links.length },
  ];

  return (
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-30 w-full sm:w-[380px] bg-card sm:rounded-l-3xl sm:shadow-xl flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/[0.03]">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">Archivos compartidos</h3>
        <span className="text-xs text-muted-foreground">{totalCount}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {t.label}
            <span className={cn(
              "text-[10px] min-w-[18px] text-center rounded-full px-1",
              tab === t.key ? "bg-primary-foreground/20" : "bg-background/50"
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Media section */}
            {(tab === "all" || tab === "media") && media.length > 0 && (
              <div>
                {tab === "all" && <p className="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center gap-1.5"><ImageIcon className="h-3 w-3" /> Media</p>}

                {/* Images grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {images.map(img => (
                      <a
                        key={img.id}
                        href={img.file_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                      >
                        <img src={img.file_url || ""} alt={img.file_name || ""} decoding="async" loading="lazy" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Videos */}
                {videos.length > 0 && (
                  <div className="space-y-1.5">
                    {videos.map(v => (
                      <a key={v.id} href={v.file_url || "#"} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Film className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{v.file_name || "Video"}</p>
                          <span className="text-[11px] text-muted-foreground">{formatDate(v.created_at)}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {/* Audio */}
                {audio.length > 0 && (
                  <div className="space-y-1.5">
                    {audio.map(a => (
                      <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Mic className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{a.file_name || "Audio"}</p>
                          <span className="text-[11px] text-muted-foreground">
                            {profiles[a.sender_id]?.full_name || "Usuario"} · {formatDate(a.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents section */}
            {(tab === "all" || tab === "documents") && docs.length > 0 && (
              <div>
                {tab === "all" && media.length > 0 && (
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center gap-1.5"><FileText className="h-3 w-3" /> Documentos</p>
                )}
                <div className="space-y-1">
                  {docs.map(doc => (
                    <a
                      key={doc.id}
                      href={doc.file_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <File className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{doc.file_name || "Archivo"}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{profiles[doc.sender_id]?.full_name || "Usuario"}</span>
                          <span>·</span>
                          <span>{formatDate(doc.created_at)}</span>
                          {doc.file_size && (
                            <>
                              <span>·</span>
                              <span>{formatFileSize(doc.file_size)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Links section */}
            {(tab === "all" || tab === "links") && links.length > 0 && (
              <div>
                {tab === "all" && (media.length > 0 || docs.length > 0) && (
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center gap-1.5"><Link2 className="h-3 w-3" /> Enlaces</p>
                )}
                <div className="space-y-1">
                  {links.map(({ url, msg }, idx) => (
                    <a
                      key={`${msg.id}-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Link2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{getDomain(url)}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{url}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {profiles[msg.sender_id]?.full_name || "Usuario"} · {formatDate(msg.created_at)}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Empty states */}
            {tab === "media" && media.length === 0 && (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">Sin archivos multimedia</p></div>
            )}
            {tab === "documents" && docs.length === 0 && (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">Sin documentos</p></div>
            )}
            {tab === "links" && links.length === 0 && (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">Sin enlaces compartidos</p></div>
            )}
            {tab === "all" && totalCount === 0 && (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">Sin archivos compartidos</p></div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
