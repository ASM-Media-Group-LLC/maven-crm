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
  /** Grupo con la lista de miembros oculta: buscador a ciegas (ver `candidatosParaMencion`). */
  aCiegas?: boolean;
}

export interface TokenDeMencion {
  query: string;
  startIndex: number;
  endIndex: number;
}

// El "@algo" que está justo antes del cursor, si lo hay.
//   \p{L} en vez de \w: con \w, teclear la tilde de "@Durán" o "@Mejía"
//   rompía el token y la lista se cerraba a mitad del nombre.
//   El "@" tiene que ir al principio o después de un espacio/paréntesis: si no,
//   escribir un correo ("jhon@maven-ai.me") abría el buscador de personas.
const TOKEN_DE_MENCION = /(?:^|[\s(])@([\p{L}\p{N}_]*)$/u;

export function detectarTokenDeMencion(text: string, cursorPos: number): TokenDeMencion | null {
  const beforeCursor = text.slice(0, cursorPos);
  const match = beforeCursor.match(TOKEN_DE_MENCION);
  if (!match) return null;
  // match.index apunta al espacio de adelante (si lo hubo), no a la arroba.
  const startIndex = match.index! + (match[0].length - match[1].length - 1);
  return {
    query: match[1].toLowerCase(),
    startIndex,
    endIndex: cursorPos,
  };
}

export function useMentionDetection(text: string, cursorPos: number) {
  return useMemo(() => detectarTokenDeMencion(text, cursorPos), [text, cursorPos]);
}

// Cuántos nombres puede llegar a listar. No es "los primeros N que haya":
// la lista scrollea, así que el tope es solo un freno para grupos enormes.
const TOPE_DE_LA_LISTA = 50;

// Cuántas letras hay que teclear antes de que el buscador a ciegas conteste.
export const LETRAS_MINIMAS_A_CIEGAS = 2;

// Antes se cortaba en 6 SIN ordenar: en "Coordinadores PLUS" (28 personas)
// teclear "@" mostraba 6 nombres en el orden en que estaban en la base y el
// resto simplemente no existía — de ahí el "no puedo mencionar a fulano".
//
// `aCiegas` = el grupo tiene la lista de miembros oculta (members_visibility
// 'admins') y quien escribe no es admin. Ahí teclear "@" solo no enseña a
// nadie: hay que escribir al menos LETRAS_MINIMAS_A_CIEGAS letras del nombre,
// así se puede mencionar a alguien que ya se conoce sin poder pasear el roster.
// ⚠️ Es un freno, no un candado: con 20 y pico de personas, alguien insistente
// saca la lista probando pares de letras. Decisión tomada a sabiendas (06/09).
export function candidatosParaMencion<T extends { user_id: string; profile?: UserProfile }>(
  participants: T[],
  currentUserId: string | undefined,
  query: string,
  aCiegas = false,
): T[] {
  if (aCiegas && query.length < LETRAS_MINIMAS_A_CIEGAS) return [];
  return participants
    .filter(p => p.user_id !== currentUserId && p.profile?.full_name)
    .map(p => ({ p, nombre: p.profile!.full_name!.toLowerCase() }))
    .filter(({ nombre }) => nombre.includes(query))
    .map(c => ({
      ...c,
      // Primero el que empieza por lo tecleado, después el que tiene un
      // APELLIDO que empieza así, y al final el que solo lo lleva por dentro:
      // teclear "ja" pone a Jackeline antes que a Alejandra.
      rango: c.nombre.startsWith(query)
        ? 0
        : c.nombre.split(/\s+/).some(palabra => palabra.startsWith(query))
          ? 1
          : 2,
    }))
    .sort((a, b) => (a.rango !== b.rango ? a.rango - b.rango : a.nombre.localeCompare(b.nombre, "es")))
    .slice(0, TOPE_DE_LA_LISTA)
    .map(({ p }) => p);
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
  text, cursorPosition, participants, currentUserId, onSelect, aCiegas = false,
}: MentionAutocompleteProps) {
  const mentionQuery = useMentionDetection(text, cursorPosition);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (mentionQuery ? candidatosParaMencion(participants, currentUserId, mentionQuery.query, aCiegas) : []),
    [mentionQuery, participants, currentUserId, aCiegas],
  );

  useEffect(() => { setSelectedIndex(0); }, [mentionQuery?.query]);

  // La lista ya no se corta en 6, así que las flechas tienen que arrastrar el
  // scroll: si no, el resaltado se va abajo del borde y parece que no hay más.
  useEffect(() => {
    (listRef.current?.children[selectedIndex] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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

  // Sin la pista, teclear "@" en un grupo con la lista oculta no hace NADA y
  // parece roto. El aviso no dice ningún nombre, así que no destapa el roster.
  if (mentionQuery && aCiegas && mentionQuery.query.length < LETRAS_MINIMAS_A_CIEGAS) {
    return (
      <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-xl shadow-lg z-50 px-3 py-2 text-xs text-muted-foreground">
        Escribe {LETRAS_MINIMAS_A_CIEGAS} letras del nombre para buscar
      </div>
    );
  }

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
