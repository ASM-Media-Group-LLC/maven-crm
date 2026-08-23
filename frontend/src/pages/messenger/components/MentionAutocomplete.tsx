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

export function renderTextWithMentions(text: string, participantNames: string[]) {
  if (!text || participantNames.length === 0) return text;

  const mentionPattern = new RegExp(
    `@(${participantNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g'
  );

  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="font-bold">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
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
