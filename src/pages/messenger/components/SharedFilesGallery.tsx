import { useState, useEffect } from "react";
import { X, Download, FileText, Image as ImageIcon, File, Loader2 } from "lucide-react";
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

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export default function SharedFilesGallery({ conversationId, profiles, onClose }: SharedFilesGalleryProps) {
  const [files, setFiles] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "images" | "files">("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .in("type", ["file", "image"])
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(100);
      setFiles((data as ChatMessage[]) || []);
      setLoading(false);
    };
    load();
  }, [conversationId]);

  const filtered = files.filter(f => {
    if (tab === "images") return f.type === "image";
    if (tab === "files") return f.type === "file";
    return true;
  });

  const images = filtered.filter(f => f.type === "image");
  const docs = filtered.filter(f => f.type === "file");

  return (
    <div className="w-full md:w-[360px] shrink-0 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">Archivos compartidos</h3>
        <span className="text-xs text-muted-foreground">{files.length} archivos</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-border">
        {(["all", "images", "files"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {t === "all" ? "Todos" : t === "images" ? "Imágenes" : "Documentos"}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">Sin archivos compartidos</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Image grid */}
            {(tab === "all" || tab === "images") && images.length > 0 && (
              <div>
                {tab === "all" && <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Imágenes</p>}
                <div className="grid grid-cols-3 gap-1.5">
                  {images.map(img => (
                    <a
                      key={img.id}
                      href={img.file_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={img.file_url || ""}
                        alt={img.file_name || ""}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Document list */}
            {(tab === "all" || tab === "files") && docs.length > 0 && (
              <div>
                {tab === "all" && images.length > 0 && <p className="text-xs font-semibold text-muted-foreground mb-2 mt-3 px-1">Documentos</p>}
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
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
