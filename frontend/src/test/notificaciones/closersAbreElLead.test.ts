import { describe, it, expect } from "vitest";
import { resolveDeepLink } from "@/lib/notificationHelpers";

// LAS NOTIFICACIONES DE CLOSERS ABREN EL LEAD.
//
// 662 al mes (contacto vencido, asignación, decisión) apuntaban a
// /closers?id=<closer_creator> y ningún archivo de la página leía `id`: el clic
// aterrizaba en la lista, paginada y filtrada, sin abrir nada (auditoría 15/09).
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/closers/ClosersContent.tsx", { query: "?raw", import: "default", eager: true });

describe("notificación de Closers", () => {
  it("el resolver apunta a /closers?id=", () => {
    expect(resolveDeepLink("closer_creator", "abc", null)).toBe("/closers?id=abc");
    expect(resolveDeepLink("deal", "abc", null)).toBe("/closers?id=abc");
  });
  it("la página lee ?id= y abre la ficha del lead", () => {
    const c = Object.values(fuentes)[0] ?? "";
    expect(c).toMatch(/searchParams\.get\("id"\)/);
    expect(c).toMatch(/from\("closer_creators"\)[\s\S]{0,80}\.eq\("id"/);
    expect(c).toMatch(/<ViewCreatorModal/);
  });
});
