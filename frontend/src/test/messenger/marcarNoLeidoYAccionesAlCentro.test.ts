import { describe, it, expect } from "vitest";

// (1) "MARCAR COMO NO LEÍDO" EN EL MENÚ DEL CHAT y (2) LAS ACCIONES DE LA
// BURBUJA (emoji y tres puntos) AL CENTRO, NO ARRIBA. Pedidos de Jhon, 18/09.
//
// El no leído se calcula como "mensajes de otros posteriores a last_read_at":
// marcar como no leído = retroceder last_read_at a justo antes del último
// mensaje ajeno. Si el chat está abierto, se cierra antes.
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
// ⚠️ import.meta.glob exige ruta Y opciones literales (Vite lo resuelve al compilar).
const hook = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useChat.ts", { query: "?raw", import: "default", eager: true }));
const sidebar = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/messenger/ChatSidebar.tsx", { query: "?raw", import: "default", eager: true }));
const page = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/messenger/MessengerPage.tsx", { query: "?raw", import: "default", eager: true }));
const bubble = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/messenger/components/MessageBubble.tsx", { query: "?raw", import: "default", eager: true }));
const i18n = uno((import.meta as unknown as Glob).glob("/frontend/src/lib/i18n/messenger.ts", { query: "?raw", import: "default", eager: true }));

describe("marcar como no leído", () => {
  it("las fuentes se cargaron", () => {
    for (const s of [hook, sidebar, page, bubble, i18n]) expect(s.length).toBeGreaterThan(500);
  });
  it("retrocede last_read_at a justo antes del último mensaje ajeno", () => {
    expect(hook).toMatch(/markConversationUnread[\s\S]{0,900}\.neq\("sender_id", user\.id\)[\s\S]{0,700}\.update\(\{ last_read_at: antes \}\)/);
    expect(hook).toMatch(/getTime\(\) - 1\)/);
  });
  it("el menú del chat ofrece marcar como no leído o como leído, traducido", () => {
    expect(sidebar).toMatch(/t\("messenger\.marcarNoLeido"\)/);
    expect(sidebar).toMatch(/t\("messenger\.marcarLeido"\)/);
    expect(i18n).toMatch(/"messenger\.marcarNoLeido": \{ es: "Marcar como no leído"/);
  });
  it("si el chat está abierto, se cierra antes de marcarlo", () => {
    expect(page).toMatch(/onMarkUnread=\{\(id\) => \{ if \(id === activeChatId\) selectChat\(null\);/);
  });
});

describe("acciones de la burbuja al centro", () => {
  it("con mouse van centradas verticalmente; en táctil siguen sobre la esquina", () => {
    expect(bubble).toMatch(/"absolute top-1\/2 -translate-y-1\/2 transition-opacity z-10 flex items-center gap-0\.5"/);
    expect(bubble.match(/\[@media\(hover:none\)\]:translate-y-0/g)?.length).toBe(2);
  });
});
