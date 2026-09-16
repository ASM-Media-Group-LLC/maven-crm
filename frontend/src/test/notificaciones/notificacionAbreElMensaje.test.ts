import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// LA NOTIFICACIÓN DE MESSENGER LLEVA AL MENSAJE, Y SI ES DE UN HILO, ABRE EL HILO.
//
// María Villegas (16/09): "me abrió el grupo pero no me llevó al hilo". El
// enlace era solo '/messenger?c=<conversación>'. Ahora todos los caminos
// (trigger de la campana, push, avisos dentro de la app) llevan '&m=<mensaje>'
// y Messenger sabe saltar a él: hilo del padre si es respuesta de hilo,
// resaltado en el timeline si no.
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("la notificación de Messenger lleva al mensaje", () => {
  it("MessengerPage lee ?m= y se lo pasa a ChatView", () => {
    const src = leer("../../pages/messenger/MessengerPage.tsx");
    expect(src).toMatch(/searchParams\.get\("m"\)/);
    expect(src).toMatch(/saltarA=\{mensajeDestino\}/);
    expect(src).toMatch(/searchParams\.delete\("m"\)/);
  });
  it("ChatView abre el hilo del padre si el mensaje es una respuesta de hilo", () => {
    const src = leer("../../pages/messenger/ChatView.tsx");
    expect(src).toMatch(/if \(!saltarA\) return;[\s\S]{0,1800}is_thread_reply[\s\S]{0,700}setThreadParent\(/);
    expect(src).toMatch(/resaltada=\{respuestaResaltada\}/);
  });
  it("ThreadPanel resalta la respuesta y la lleva a la vista", () => {
    const src = leer("../../pages/messenger/components/ThreadPanel.tsx");
    expect(src).toMatch(/resaltada\?: string \| null/);
    expect(src).toMatch(/respuestaRefs\.current\[resaltada\]\?\.scrollIntoView/);
  });
  it("los avisos dentro de la app enlazan con el mensaje", () => {
    const src = leer("../../hooks/useMessengerNotifications.ts");
    expect(src.match(/\/messenger\?c=\$\{[^}]+\}&m=\$\{m\.id\}/g)?.length).toBe(2);
    expect(src).not.toMatch(/\/messenger\?c=\$\{[^}]+\}`/);
  });
  it("el push y el trigger de la campana también", () => {
    expect(leer("../../../../supabase/functions/web-push/index.ts")).toMatch(/url: `\/messenger\?c=\$\{msg\.conversation_id\}&m=\$\{msg\.id\}`/);
    expect(leer("../../../../supabase/migrations/20260916190000_notificaciones_llevan_al_mensaje.sql")).toMatch(/'\/messenger\?c=' \|\| new\.conversation_id \|\| '&m=' \|\| new\.id/);
  });
});
