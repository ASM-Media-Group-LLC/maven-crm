import { describe, it, expect } from "vitest";

// TODO CANAL DE REALTIME DE MESSENGER TIENE QUE SABER REVIVIR.
//
// Auditoría del 10/09: ocho suscripciones hacían `.subscribe()` sin callback de
// estado. En realtime-js `CLOSED` es terminal y no se rejoin-ea solo, así que
// tras un corte de red quedaban muertas hasta recargar: sin sonido de aviso,
// contador de no leídos congelado, reacciones y menciones que no llegaban.
//
// La regla: un archivo de Messenger que suscribe un canal o pasa por
// useCanalQueRevive, o maneja CLOSED a mano (como useChat y useTypingInbox).
//
// Se lee con import.meta.glob y no con node:fs porque el tsconfig de la app
// apunta al navegador. El patrón arranca en la RAÍZ del repo: vitest corre ahí.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

// Qué cuenta como Messenger: sus hooks y sus dos carpetas de pantallas.
const esDeMessenger = (ruta: string) =>
  /\/frontend\/src\/(pages|components)\/messenger\//.test(ruta) ||
  /\/frontend\/src\/hooks\/(useChat|useReactions|useReadReceipts|useMentionedConversations|useMessengerNotifications|useUnreadChatCount|usePinnedChats|useArchivedChats|useTypingInbox|useOnlinePresence|useCanalQueRevive|canalDelChat)\./.test(ruta);

// Deuda anotada a propósito, no olvido. Cada entrada lleva su porqué.
const EXCEPCIONES: Record<string, string> = {
  // Presencia: el topic tiene que ser el MISMO para todos (versionarlo dejaría a
  // cada persona en una sala distinta) y revivirlo exige re-track(). Va en su
  // propio PR, con prueba en vivo.
  "/frontend/src/hooks/useOnlinePresence.ts": "presencia — PR aparte",
};

describe("canales de realtime de Messenger", () => {
  // El hook mismo se salta: su comentario cita el `.subscribe()` que vino a matar.
  const esElHook = (ruta: string) => ruta.endsWith("/hooks/useCanalQueRevive.ts");

  it("ninguno suscribe sin callback de estado", () => {
    const culpables = Object.entries(fuentes)
      .filter(([ruta, c]) => esDeMessenger(ruta) && !esElHook(ruta) && /\.subscribe\(\)/.test(c))
      .map(([ruta]) => ruta);
    expect(culpables, `Suscriben a ciegas:\n${culpables.join("\n")}`).toEqual([]);
  });

  it("todo el que suscribe sabe revivir (hook o CLOSED a mano)", () => {
    const culpables: string[] = [];
    for (const [ruta, c] of Object.entries(fuentes)) {
      if (!esDeMessenger(ruta) || ruta in EXCEPCIONES) continue;
      if (!/\.subscribe\(/.test(c)) continue;
      const revive = c.includes("useCanalQueRevive") || c.includes("CLOSED");
      if (!revive) culpables.push(ruta);
    }
    expect(culpables, `No saben revivir:\n${culpables.join("\n")}`).toEqual([]);
  });

  it("las excepciones siguen siendo excepciones (si ya lo arreglaron, sacarlas de la lista)", () => {
    for (const ruta of Object.keys(EXCEPCIONES)) {
      const c = fuentes[ruta];
      expect(c, `${ruta} ya no existe: sacarla de EXCEPCIONES`).toBeTruthy();
      expect(c.includes("useCanalQueRevive") || c.includes("CLOSED"), `${ruta} ya revive: sacarla de EXCEPCIONES`).toBe(false);
    }
  });

  it("el test se mira a sí mismo: encuentra canales en Messenger", () => {
    // Los que pasan por el hook ya no dicen `.subscribe(`: cuentan por el hook,
    // igual que los que escuchan por el canal compartido (canalDelChat.ts).
    const n = Object.entries(fuentes).filter(
      ([ruta, c]) =>
        esDeMessenger(ruta) &&
        !esElHook(ruta) &&
        (/\.subscribe\(/.test(c) ||
          c.includes("useCanalQueRevive(") ||
          c.includes("useEscuchaDelChat(") ||
          c.includes("registrarEnElCanalDelChat(")),
    ).length;
    expect(n).toBeGreaterThanOrEqual(12);
  });
});
