import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage, UserProfile } from "../types";
import { formatTime, formatDate } from "../utils";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

interface SearchResultsPanelProps {
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  onResultClick: (messageId: string) => void;
  onClose: () => void;
  onQueryChange: (query: string) => void;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-300/80 dark:bg-yellow-500/40 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function SearchResultsPanel({
  messages, profiles, onResultClick, onClose, onQueryChange,
}: SearchResultsPanelProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    onQueryChange(query);
  }, [query, onQueryChange]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return messages
      .filter(m => !m.is_deleted && (
        m.content?.toLowerCase().includes(q) ||
        m.file_name?.toLowerCase().includes(q)
      ))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [messages, query]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: ChatMessage[] }[] = [];
    let currentLabel = "";
    for (const msg of results) {
      const label = formatDate(msg.created_at, t, language);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [msg] });
      } else {
        groups[groups.length - 1].items.push(msg);
      }
    }
    return groups;
  }, [results, t, language]);

  return (
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-30 w-full sm:w-[380px] bg-card sm:rounded-l-3xl sm:shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/[0.03] shrink-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          placeholder={t("messenger.search.buscarEnConversacion")}
          className="h-9 bg-primary/5 border-0 rounded-full text-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Results count */}
      {query.trim() && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground shrink-0">
          {results.length === 0
            ? t("messenger.search.sinResultadosPara", { query })
            : results.length === 1
              ? t("messenger.search.unResultado")
              : t("messenger.search.resultados", { n: results.length })}
        </div>
      )}

      {/* Results list */}
      <ScrollArea className="flex-1">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("messenger.search.escribeParaBuscar")}
            </p>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.label}>
            <div className="sticky top-0 bg-primary/5 backdrop-blur-sm px-3 py-1 text-xs font-medium text-muted-foreground z-10">
              {group.label}
            </div>
            {group.items.map((msg) => {
              const profile = profiles[msg.sender_id];
              const name = profile?.full_name || t("messenger.usuario");
              const snippet = msg.content || "";
              const fileNameMatch = msg.file_name && msg.file_name.toLowerCase().includes(query.toLowerCase());

              return (
                <button
                  key={msg.id}
                  className={cn(
                    "w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-primary/5 transition-colors rounded-2xl mx-1",
                    "",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  )}
                  onClick={() => onResultClick(msg.id)}
                >
                  <UserAvatar
                    name={name}
                    src={profile?.avatar_url}
                    seed={profile?.avatar_seed}
                    size="sm"
                    className="h-7 w-7 shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">
                        {name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(msg.created_at, language)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {highlightText(snippet, query)}
                    </p>
                    {fileNameMatch && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
                        <span>📎</span>
                        <span className="truncate">{highlightText(msg.file_name!, query)}</span>
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
