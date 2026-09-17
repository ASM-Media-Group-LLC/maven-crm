import { describe, it, expect } from "vitest";
import { resolveDeepLink } from "@/lib/notificationHelpers";

// LA NOTIFICACIÓN ES UN ENLACE A LO QUE NOTIFICA.
//
// Auditoría 15/09: 86.254 notificaciones de Messenger en 30 días llevaban
// '/messenger?chat=<id>' y la página lee `?c=`. El clic aterrizaba en Messenger
// sin abrir el chat. Estos casos fijan el contrato entre el resolver, el trigger
// y la página, para que no vuelvan a hablar idiomas distintos.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/messenger/MessengerPage.tsx", { query: "?raw", import: "default", eager: true });

describe("enlace de una notificación de Messenger", () => {
  it("el resolver manda a ?c=, que es lo que la página lee", () => {
    expect(resolveDeepLink("conversation", "abc", null)).toBe("/messenger?c=abc");
  });

  it("un deep_link_url guardado gana sobre el resolver (filas viejas con ?chat=)", () => {
    expect(resolveDeepLink("conversation", "abc", "/messenger?chat=abc")).toBe("/messenger?chat=abc");
  });

  it("la página acepta ?chat= como alias: las 86 mil filas viejas siguen abriendo el chat", () => {
    const c = Object.values(fuentes)[0] ?? "";
    expect(c).toMatch(/searchParams\.get\("c"\) \?\? searchParams\.get\("chat"\)/);
    expect(c).toMatch(/searchParams\.delete\("chat"\)/);
  });

  it("sin referencia, cae a un sitio seguro y no a un 404", () => {
    expect(resolveDeepLink(null, null, null)).toBe("/dashboard");
    expect(resolveDeepLink("lo-que-sea", "x", null)).toBe("/dashboard");
  });
});
