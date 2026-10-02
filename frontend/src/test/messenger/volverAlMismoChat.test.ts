import { describe, it, expect } from "vitest";

// VOLVER A LA MISMA CONVERSACIÓN Y AL MISMO LUGAR (Keila, 02/10): ir al Correo
// y regresar desmontaba el Messenger; había que buscar el chat y el punto donde
// iba. La conversación se guarda por PESTAÑA (sessionStorage, para que dos
// pestañas no se muevan juntas) y la lista retoma desde el mensaje de arriba.
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/pages/messenger/MessengerPage.tsx",
  "/frontend/src/pages/messenger/components/MessageList.tsx",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";
const pagina = leer("MessengerPage.tsx");
const lista = leer("MessageList.tsx");

describe("volver al Messenger", () => {
  it("las fuentes cargaron (si no, lo de abajo pasaría en vacío)", () => {
    expect(pagina.length).toBeGreaterThan(0);
    expect(lista.length).toBeGreaterThan(0);
  });
  it("el chat abierto se guarda por pestaña, no en localStorage (que comparten todas)", () => {
    expect(pagina).toMatch(/sessionStorage\.setItem\(claveChatAbierto, activeChatId\)/);
    expect(pagina).not.toMatch(/localStorage\.setItem\(claveChatAbierto/);
  });
  it("un enlace con ?c= o ?dm= manda sobre lo guardado", () => {
    expect(pagina).toMatch(/if \(searchParams\.get\("c"\) \|\| searchParams\.get\("chat"\) \|\| searchParams\.get\("dm"\)\) \{\n\s+restauradoRef\.current = true;\n\s+return;/);
  });
  it("la lista retoma donde quedó SOLO al volver; cambiar de chat sigue abriendo al fondo", () => {
    expect(lista).toMatch(/const alVolver = currentConvRef\.current === null;/);
    expect(lista).toMatch(/const quedo = alVolver && conv \? dondeQuedo\.get\(conv\) : undefined;/);
  });
});
