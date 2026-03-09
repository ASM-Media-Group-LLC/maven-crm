import { useState, useCallback } from "react";
import { Search, X, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGlobalSearch, type GlobalSearchResult } from "@/hooks/useGlobalSearch";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface GlobalSearchPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectResult: (conversationId: string, messageId: string) => void;
}

export default function GlobalSearchPanel({ open, onClose, onSelectResult }: GlobalSearchPanelProps) {
  const { results, searching, search, clearResults } = useGlobalSearch();
  const [query, setQuery] = useState("");

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      search(value);
    } else {
      clearResults();
    }
  }, [search, clearResults]);

  if (!open) return null;

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          placeholder="Buscar en todas las conversaciones…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          className="h-8 text-sm flex-1"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onClose(); setQuery(""); clearResults(); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {(results.length > 0 || searching) && (
        <ScrollArea className="max-h-60 border-t border-border">
          {searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Buscando…</p>
          )}
          {results.map((r) => (
            <button
              key={r.messageId}
              onClick={() => {
                onSelectResult(r.conversationId, r.messageId);
                onClose();
                setQuery("");
                clearResults();
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary truncate">{r.conversationTitle}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: es })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                <span className="font-medium">{r.senderName}:</span> {r.content}
              </p>
            </button>
          ))}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
