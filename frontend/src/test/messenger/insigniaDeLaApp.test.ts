import { describe, it, expect, vi } from "vitest";
import { actualizarInsignia, contarChatsSinLeer } from "@/lib/insigniaDeLaApp";

describe("insignia de la app", () => {
  it("cuenta chats sin leer, no mensajes", () => {
    expect(contarChatsSinLeer([{ unreadCount: 4 }, { unreadCount: 0 }, { unreadCount: 1 }])).toBe(2);
    expect(contarChatsSinLeer([])).toBe(0);
  });
  it("con soporte: setAppBadge(n) o clearAppBadge()", async () => {
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    const nav = { setAppBadge, clearAppBadge } as unknown as Navigator;
    await actualizarInsignia(3, nav);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    await actualizarInsignia(0, nav);
    expect(clearAppBadge).toHaveBeenCalled();
  });
  it("sin soporte o con error no lanza", async () => {
    await expect(actualizarInsignia(2, {} as Navigator)).resolves.toBeUndefined();
    const roto = { setAppBadge: vi.fn(async () => { throw new Error("no"); }) } as unknown as Navigator;
    await expect(actualizarInsignia(2, roto)).resolves.toBeUndefined();
  });
});
