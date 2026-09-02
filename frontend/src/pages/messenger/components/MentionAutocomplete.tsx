import type { ReactNode } from "react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { UserProfile } from "../types";
import { cn } from "@/lib/utils";

interface MentionAutocompleteProps {
  text: string;
  cursorPosition: number;
  participants: { user_id: string; profile?: UserProfile }[];
  currentUserId?: string;
  onSelect: (mention: string, userId: string) => void;
}

export function useMentionDetection(text: string, cursorPos: number) {
  // Detect if cursor is inside an @mention trigger
  const mentionQuery = useMemo(() => {
    const beforeCursor = text.slice(0, cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    if (!match) return null;
    return {
      query: match[1].toLowerCase(),
      startIndex: match.index!,
      endIndex: cursorPos,
    };
  }, [text, cursorPos]);

  return mentionQuery;
}

export function insertMention(text: string, startIndex: number, endIndex: number, displayName: string): string {
  return text.slice(0, startIndex) + `@${displayName} ` + text.slice(endIndex);
}

// URLs clickeables dentro del texto (abren en otra pestaña). Vive acá y no
// en MessageBubble porque los tramos SIN mención también pasan por esta
// función: antes, en los grupos, el texto entraba por las menciones y se
// saltaba el linkify de MessageBubble — un link de OnlyFans pegado en un grupo
// salía como texto plano (Vanessa, 02/09/2026). En los DMs sí funcionaba,
// porque ahí MessageBubble no llamaba a esta función.
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

export function linkifyText(text: string, keyPrefix = ""): ReactNode[] {
  return text.split(URL_REGEX).map((part, i) =>
    // El regex es global: `test` mueve lastIndex y se salta matches alternos,
    // por eso se resetea antes de cada prueba.
    ((URL_REGEX.lastIndex = 0), URL_REGEX.test(part)) ? (
      <a
        key={`${keyPrefix}u${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline hover:opacity-80 break-all"
      >
        {part}
      </a>
    ) : (
      <span key={`${keyPrefix}t${i}`}>{part}</span>
    ),
  );
}

export function renderTextWithMentions(
  text: string,
  participantNames: string[],
  // Con handler, la mención es un HIPERVÍNCULO: clic → abrir el DM con esa
  // persona (lo resuelve el que llama, que es quien conoce nombre→userId).
  onMentionClick?: (name: string) => void,
) {
  // Sin participantes no hay menciones que buscar, pero los links igual van.
  if (!text) return text;
  if (participantNames.length === 0) return <>{linkifyText(text)}</>;

  const mentionPattern = new RegExp(
    `@(${participantNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g'
  );

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...linkifyText(text.slice(lastIndex, match.index), `s${lastIndex}-`));
    }
    const nombre = match[1];
    parts.push(
      onMentionClick ? (
        <button
          key={match.index}
          type="button"
          title={`Abrir chat con ${nombre}`}
          onClick={(e) => { e.stopPropagation(); onMentionClick(nombre); }}
          className="font-bold underline decoration-dotted underline-offset-2 hover:opacity-80"
        >
          @{nombre}
        </button>
      ) : (
        <span key={match.index} className="font-bold">
          @{nombre}
        </span>
      )
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...linkifyText(text.slice(lastIndex), `e${lastIndex}-`));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

export default function MentionAutocomplete({
  text, cursorPosition, participants, currentUserId, onSelect,
}: MentionAutocompleteProps) {
  const mentionQuery = useMentionDetection(text, cursorPosition);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!mentionQuery) return [];
    return participants
      .filter(p => p.user_id !== currentUserId && p.profile?.full_name)
      .filter(p => {
        const name = p.profile!.full_name!.toLowerCase();
        return name.includes(mentionQuery.query);
      })
      .slice(0, 6);
  }, [mentionQuery, participants, currentUserId]);

  useEffect(() => { setSelectedIndex(0); }, [mentionQuery?.query]);

  const handleSelect = useCallback((participant: typeof filtered[0]) => {
    if (!mentionQuery) return;
    const displayName = participant.profile!.full_name!;
    onSelect(
      insertMention(text, mentionQuery.startIndex, mentionQuery.endIndex, displayName),
      participant.user_id,
    );
  }, [mentionQuery, text, onSelect]);

  // Keyboard navigation is handled in the parent via onKeyDown
  useEffect(() => {
    if (filtered.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          handleSelect(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        // Let parent handle
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, selectedIndex, handleSelect]);

  if (!mentionQuery || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-52 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50 py-1"
    >
      {filtered.map((p, i) => (
        <button
          key={p.user_id}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-sm",
            i === selectedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"
          )}
          onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <UserAvatar
            name={p.profile?.full_name}
            src={p.profile?.avatar_url}
            seed={p.profile?.avatar_seed}
            size="xs"
          />
          <span className="truncate font-medium">{p.profile?.full_name}</span>
        </button>
      ))}
    </div>
  );
}
