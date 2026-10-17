import { useLanguage } from "@/hooks/useLanguage";
import type { UserProfile } from "../types";

// La burbuja de "está escribiendo…" DENTRO del chat (los tres puntitos
// animados, estilo WhatsApp), justo arriba del cuadro de escribir. Es aparte
// del aviso de la cabecera (ese sigue): aquí es la burbuja flotante abajo, que
// es lo que la gente espera ver cuando el otro está tecleando.
//
// `typingUsers` son IDs; el nombre sale de `profiles` igual que en la cabecera.
// En un chat de a dos basta con los puntitos; en grupo se antepone quién.
export default function TypingBubble({
  typingUsers,
  profiles,
  isGroup,
}: {
  typingUsers: string[];
  profiles: Record<string, UserProfile>;
  isGroup: boolean;
}) {
  const { t } = useLanguage();
  if (!typingUsers.length) return null;

  const nombres = typingUsers
    .map((id) => profiles[id]?.full_name?.split(" ")[0] || t("messenger.header.alguien"))
    .join(", ");

  return (
    <div className="shrink-0 px-4 pb-1 pt-0.5" aria-live="polite">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-muted-foreground">
        {isGroup && <span className="text-xs font-medium">{nombres}</span>}
        <span className="mv-typing" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <style>{`
        .mv-typing { display:inline-flex; align-items:center; gap:3px; line-height:0; }
        .mv-typing i { width:6px; height:6px; border-radius:9999px; background:currentColor; display:inline-block; animation:mvTyping 1.2s infinite ease-in-out; }
        .mv-typing i:nth-child(2){ animation-delay:.18s; }
        .mv-typing i:nth-child(3){ animation-delay:.36s; }
        @keyframes mvTyping { 0%,60%,100%{ transform:translateY(0); opacity:.35; } 30%{ transform:translateY(-3px); opacity:.95; } }
        @media (prefers-reduced-motion: reduce){ .mv-typing i{ animation:none; opacity:.6; } }
      `}</style>
    </div>
  );
}
