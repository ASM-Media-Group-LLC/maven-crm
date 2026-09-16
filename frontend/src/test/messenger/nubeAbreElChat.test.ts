import { describe, it, expect } from "vitest";

// LA NUBE LLEVA AL CHAT, TAMBIÉN DESDE MESSENGER.
//
// Jhon (16/09): en /messenger abrió la nube, tocó el chat de María y no pasó nada.
// abrirChat abría una ventanita flotante, y en /messenger las ventanitas no se
// dibujan. Ya en la página, la nube tiene que navegar a ?c=<id>, como en el
// teléfono, y la página selecciona el chat.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/components/messenger/MessengerDock.tsx", { query: "?raw", import: "default", eager: true });

describe("abrirChat del muelle", () => {
  const c = Object.values(fuentes)[0] ?? "";
  it("en /messenger navega en vez de abrir ventanita", () => {
    // El muelle ya sabía si estaba en Messenger (location.pathname); el arreglo lo reutiliza.
    expect(c).toMatch(/enMessenger = (location\.)?pathname\.startsWith\("\/messenger"\)/);
    expect(c).toMatch(/if \(isMobile \|\| !puedeMessenger \|\| enMessenger\) \{ navigate\(`\/messenger\?c=\$\{id\}`\); return; \}/);
  });
});
