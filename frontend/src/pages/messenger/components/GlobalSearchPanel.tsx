import { useState, useCallback } from "react";
import { Search, X, MessageSquare, Users, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGlobalSearch, type GlobalSearchResult } from "@/hooks/useGlobalSearch";
import { formatDistanceToNow } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import EtiquetaApi from "./EtiquetaApi";

interface GlobalSearchPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectResult: (conversationId: string, messageId: string) => void;
}

function highlightKeyword(text: string, keyword: string) {
  if (!keyword.trim()) return text;
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300 dark:bg-yellow-400/80 text-foreground font-bold rounded px-0.5">{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  );
}

export default function GlobalSearchPanel({ open, onClose, onSelectResult }: GlobalSearchPanelProps) {
  const { results, searching, search, clearResults } = useGlobalSearch();
  const f = useFormato();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      search(value);
    } else {
      clearResults();
    }
  }, [search, clearResults]);

  const handleClose = () => {
    onClose();
    setQuery("");
    clearResults();
  };

  if (!open) return null;

  // Group results by conversation
  const grouped = results.reduce<Record<string, { title: string; results: GlobalSearchResult[] }>>((acc, r) => {
    if (!acc[r.conversationId]) {
      acc[r.conversationId] = { title: r.conversationTitle, results: [] };
    }
    acc[r.conversationId].results.push(r);
    return acc;
  }, {});

  const totalResults = results.length;

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          placeholder={t("messenger.globalSearch.placeholder")}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && handleClose()}
          className="h-8 text-sm flex-1"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Results summary */}
      {query.trim().length >= 2 && !searching && totalResults > 0 && (
        <div className="px-4 py-1 border-t border-border bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            {t("messenger.globalSearch.resumen", {
              resultados: totalResults === 1 ? t("messenger.search.unResultado") : t("messenger.search.resultados", { n: totalResults }),
              conversaciones: Object.keys(grouped).length === 1
                ? t("messenger.globalSearch.unaConversacion")
                : t("messenger.globalSearch.conversaciones", { n: Object.keys(grouped).length }),
            })}
          </span>
        </div>
      )}

      {(totalResults > 0 || searching) && (
        <ScrollArea className="max-h-72 border-t border-border">
          {searching && totalResults === 0 && (
            <div className="flex items-center justify-center gap-2 py-6">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground">{t("messenger.globalSearch.buscando")}</p>
            </div>
          )}

          {Object.entries(grouped).map(([convId, group]) => (
            <div key={convId}>
              {/* Conversation header */}
              <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b border-border/50 sticky top-0 z-10">
                <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-foreground truncate">{group.title}</span>
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] rounded-full ml-auto">
                  {group.results.length}
                </Badge>
              </div>

              {/* Messages in this conversation */}
              {group.results.map((r) => (
                <button
                  key={r.messageId}
                  onClick={() => {
                    onSelectResult(r.conversationId, r.messageId);
                    handleClose();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-medium text-foreground">{r.senderName}</span>
                    {r.esApi && <EtiquetaApi nombre={r.senderName} persona={r.personaReal} esMio={false} />}
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: f.fechas })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {highlightKeyword(r.content, query)}
                  </p>
                </button>
              ))}
            </div>
          ))}

          {!searching && query.trim().length >= 2 && totalResults === 0 && (
            <div className="text-center py-6 space-y-1">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground">{t("messenger.globalSearch.sinResultados", { query })}</p>
              <p className="text-[10px] text-muted-foreground/70">{t("messenger.globalSearch.intentaOtras")}</p>
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
