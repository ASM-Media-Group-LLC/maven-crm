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

// LOS AVISOS DE VIGILANCIA ABREN LA VISTA EN VIVO (Alvaro, 11/11/2026). Las filas
// nuevas ya traen /hr/en-vivo/…; las de antes (al expediente con fotos, o a
// «Dónde está») se reescriben al tocarlas en la campana, para que lleven al
// mismo lugar que el push.
describe("avisos de vigilancia en la campana", () => {
  const PERSONA = "0473bcfa-6755-486f-8b07-bfdd1dd51bc8";
  const ALERTA = "11111111-2222-4333-8444-555555555555";

  it("un aviso nuevo de Argos va tal cual a su vista en vivo", () => {
    const url = `/hr/en-vivo/${PERSONA}?alerta=${ALERTA}`;
    expect(resolveDeepLink("argos_alerta", ALERTA, url)).toBe(url);
  });

  it("uno viejo de Argos (al expediente) abre la vista en vivo con esa alerta", () => {
    expect(resolveDeepLink("argos_alerta", ALERTA, `/hr/expediente/${PERSONA}`)).toBe(`/hr/en-vivo/${PERSONA}?alerta=${ALERTA}`);
  });

  it("uno viejo de «se salió de Cowork» (a «Dónde está») abre su vista en vivo", () => {
    expect(resolveDeepLink("profile", PERSONA, "/hr/monitor-ia?t=donde")).toBe(`/hr/en-vivo/${PERSONA}`);
  });

  it("el aviso a la PERSONA («comparte tu pantalla») no se toca: sigue a Cowork", () => {
    expect(resolveDeepLink("argos_alerta", ALERTA, "/cowork")).toBe("/cowork");
  });
});
