import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const entorno = vi.hoisted(() => ({
  canales: [] as Array<Canal>, todos: [] as Array<Canal>,
  quitar: vi.fn(), usuario: { id: "persona-1" } as { id: string } | null,
}));
type Canal = ReturnType<typeof canalFalso>;
function canalFalso(topic: string, key: string) {
  let estado: (status: string) => void = () => {};
  const eventos = new Map<string, () => void>();
  const canal = {
    topic: `realtime:${topic}`, key,
    presencias: {} as Record<string, Array<Record<string, unknown>>>,
    track: vi.fn(async (_payload: Record<string, unknown>) => "ok"),
    untrack: vi.fn(async () => "ok"),
    presenceState: () => canal.presencias,
    on(_tipo: string, filtro: { event: string }, callback: () => void) { eventos.set(filtro.event, callback); return canal; },
    subscribe(callback: (status: string) => void) { estado = callback; return canal; },
    estado(status: string) { estado(status); },
    sincronizar(presencias: Record<string, Array<Record<string, unknown>>>) {
      canal.presencias = presencias; eventos.get("sync")?.();
    },
  };
  return canal;
}
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: entorno.usuario }) }));
vi.mock("@/lib/portal/cuenta", () => ({ esCuentaDeCreadora: () => false }));
vi.mock("@/lib/versionDelBundle", async (original) => ({
  ...await original<typeof import("@/lib/versionDelBundle")>(), BUILD_PROPIO: 1795480000000,
}));
vi.mock("@/lib/arranque", () => ({ leerArranque: async () => ({ perfil: { status: "available" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel(topic: string, options: { config: { presence: { key: string } } }) {
      const existente = entorno.canales.find((c) => c.topic === `realtime:${topic}`);
      if (existente) return existente;
      const canal = canalFalso(topic, options.config.presence.key);
      entorno.canales.push(canal); entorno.todos.push(canal); return canal;
    },
    getChannels: () => entorno.canales,
    removeChannel(canal: Canal) {
      return Promise.resolve(entorno.quitar(canal)).then((resultado) => {
        if (resultado === "ok") {
          entorno.canales = entorno.canales.filter((c) => c.topic !== canal.topic);
          canal.estado("CLOSED");
        }
        return resultado;
      });
    },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  },
}));

import { OnlinePresenceProvider, useOnlinePresence } from "@/hooks/useOnlinePresence";
const wrapper = ({ children }: { children: ReactNode }) => <OnlinePresenceProvider>{children}</OnlinePresenceProvider>;
const vaciar = () => act(async () => { for (let n = 0; n < 25; n++) await Promise.resolve(); });
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
async function montar() {
  const hook = renderHook(() => useOnlinePresence(), { wrapper });
  await vaciar();
  act(() => { entorno.todos[0].estado("SUBSCRIBED"); });
  await vaciar();
  return hook;
}
beforeEach(() => {
  vi.useFakeTimers(); entorno.canales = []; entorno.todos = [];
  entorno.quitar.mockReset().mockResolvedValue("ok"); entorno.usuario = { id: "persona-1" };
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(async () => { cleanup(); await vaciar(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("presencia que vuelve con el internet", () => {
  it.each(["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"])("recupera %s en el mismo topic y recibe la lista nueva", async (estado) => {
    const { result } = await montar();
    const anterior = entorno.todos[0];
    act(() => { anterior.sincronizar({ primera: [{ status: "available" }] }); anterior.estado(estado); });
    await avanzar(1000);
    expect(entorno.todos).toHaveLength(2);
    const nueva = entorno.todos[1];
    expect(nueva.topic).toBe("realtime:online-users");
    act(() => { nueva.estado("SUBSCRIBED"); nueva.sincronizar({ segunda: [{ status: "busy" }] }); });
    expect(result.current.isOnline("segunda")).toBe(true);
    expect(result.current.isOnline("primera")).toBe(false);
    act(() => { anterior.sincronizar({ fantasma: [{ status: "available" }] }); });
    expect(result.current.isOnline("fantasma")).toBe(false);
  });

  it("envía el build al suscribir, al cambiar estado y al recuperar el canal", async () => {
    const { result } = await montar();
    expect(entorno.todos[0].track).toHaveBeenLastCalledWith(expect.objectContaining({ b: 1795480000000 }));
    act(() => { result.current.setMyStatus("busy"); }); await vaciar();
    expect(entorno.todos[0].track).toHaveBeenLastCalledWith(expect.objectContaining({ status: "busy", b: 1795480000000 }));
    act(() => { entorno.todos[0].estado("CLOSED"); }); await avanzar(1000);
    act(() => { entorno.todos[1].estado("SUBSCRIBED"); });
    expect(entorno.todos[1].track).toHaveBeenLastCalledWith(expect.objectContaining({ status: "busy", b: 1795480000000 }));
  });

  it("no abre otro canal hasta que el cierre anterior quede confirmado", async () => {
    let confirmar!: (valor: string) => void;
    entorno.quitar.mockImplementationOnce(() => new Promise<string>((ok) => { confirmar = ok; }));
    await montar();
    act(() => { entorno.todos[0].estado("CLOSED"); });
    await avanzar(1000);
    expect(entorno.todos).toHaveLength(1);
    act(() => { window.dispatchEvent(new Event("online")); });
    await vaciar();
    expect(entorno.quitar).toHaveBeenCalledTimes(1);
    act(() => { confirmar("ok"); }); await vaciar();
    expect(entorno.todos).toHaveLength(2);
  });

  it("si retirar falla, espera y reintenta sin reutilizar el canal zombi", async () => {
    entorno.quitar.mockResolvedValueOnce("error").mockResolvedValue("ok");
    await montar();
    act(() => { entorno.todos[0].estado("CLOSED"); });
    await avanzar(1000);
    expect(entorno.todos).toHaveLength(1);
    await avanzar(1999); expect(entorno.todos).toHaveLength(1);
    await avanzar(1); expect(entorno.todos).toHaveLength(2);
    expect(entorno.quitar).toHaveBeenCalledTimes(2);
  });

  it("publicaciones rechazadas conservan la espera creciente aunque el canal se suscriba", async () => {
    const { result } = await montar();
    entorno.todos[0].track.mockResolvedValueOnce("error");
    act(() => { result.current.setMyStatus("busy"); }); await vaciar();
    await avanzar(1000);
    entorno.todos[1].track.mockResolvedValueOnce("error");
    act(() => { entorno.todos[1].estado("SUBSCRIBED"); }); await vaciar();
    await avanzar(1999); expect(entorno.todos).toHaveLength(2);
    await avanzar(1); expect(entorno.todos).toHaveLength(3);
  });

  it("sin internet no martilla el canal y al volver recupera en el acto", async () => {
    await montar();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => { entorno.todos[0].estado("CLOSED"); });
    await avanzar(30_000);
    expect(entorno.quitar).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => { window.dispatchEvent(new Event("online")); }); await vaciar();
    expect(entorno.todos).toHaveLength(2);
  });

  it("republica texto y color y mantiene invisible a quien eligió desconectado", async () => {
    const { result } = await montar();
    await act(async () => { await result.current.setMyStatusText("En revisión", null, "offline", "#112233"); });
    act(() => { entorno.todos[0].estado("CLOSED"); });
    await avanzar(1000);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => { entorno.todos[1].estado("SUBSCRIBED"); });
    expect(entorno.todos[1].track).toHaveBeenLastCalledWith(expect.objectContaining({
      user_id: "persona-1", status: "offline", status_text: "En revisión", status_color: "#112233",
    }));
  });

  it("desmontar cancela la recuperación, incluso si internet vuelve después", async () => {
    const { unmount } = await montar();
    act(() => { entorno.todos[0].estado("CLOSED"); });
    unmount(); await vaciar();
    act(() => { window.dispatchEvent(new Event("online")); });
    await avanzar(30_000);
    expect(entorno.todos).toHaveLength(1);
    expect(entorno.canales).toHaveLength(0);
  });

  it("un proveedor remontado espera el cierre pendiente del anterior", async () => {
    let confirmar!: (valor: string) => void;
    entorno.quitar.mockImplementationOnce(() => new Promise<string>((ok) => { confirmar = ok; }));
    const anterior = await montar();
    anterior.unmount(); await vaciar();
    renderHook(() => useOnlinePresence(), { wrapper }); await vaciar();
    expect(entorno.todos).toHaveLength(1);
    act(() => { confirmar("ok"); }); await vaciar();
    expect(entorno.todos).toHaveLength(2);
    expect(entorno.quitar).toHaveBeenCalledTimes(1);
  });
});
