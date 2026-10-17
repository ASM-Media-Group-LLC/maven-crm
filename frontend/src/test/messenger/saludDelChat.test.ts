// LA SALUD DE LA CONEXIÓN DEL CHAT TIENE QUE SEGUIR AL CANAL.
//
// El banner "Reconectando…" y el poll adaptativo (que hace que los mensajes
// lleguen igual cuando el socket se cae, sin recargar) cuelgan los dos de una
// sola señal: la salud que publica canalDelChat. Si esa señal deja de seguir al
// canal —no pasa a "reconectando" al caer, o no vuelve a "en-vivo" al revivir—
// el banner miente y el poll no acelera: justo el "hay que refrescar" que vino a
// matar. Esta guarda la maneja con una base falsa y mira las transiciones.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const base = vi.hoisted(() => {
  class CanalFalso {
    removido = false;
    alEstado?: (s: string) => void;
    constructor(public topic: string) {}
    on() { return this; }
    subscribe(cb?: (s: string) => void) {
      this.alEstado = cb;
      // Como realtime-js cuando conecta bien: SUBSCRIBED en la próxima vuelta.
      queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); });
      return this;
    }
    unsubscribe() { return Promise.resolve("ok"); }
  }
  const canales: CanalFalso[] = [];
  const supabase = {
    channel(topic: string) {
      const vivo = canales.find((c) => c.topic === topic && !c.removido);
      if (vivo) return vivo;
      const nuevo = new CanalFalso(topic);
      canales.push(nuevo);
      return nuevo;
    },
    removeChannel(c: CanalFalso) {
      c.removido = true;
      c.alEstado?.("CLOSED");
      return Promise.resolve("ok");
    },
  };
  return { supabase, canales };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
// La vuelta del segundo plano no entra en esta prueba: no-op que se puede soltar.
vi.mock("@/hooks/useReanudarAlVolver", () => ({ escucharLaVuelta: () => () => {} }));

import { registrarEnElCanalDelChat, saludDelChatAhora, reportarSaludDelChat } from "@/hooks/canalDelChat";

const vivo = () => base.canales.find((c) => !c.removido);

beforeEach(() => { base.canales.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe("salud de la conexión del chat", () => {
  it("en-vivo al suscribir · reconectando al caer · en-vivo al revivir · conectando al soltar", async () => {
    vi.useFakeTimers();
    const ref = { current: {} };
    const soltar = registrarEnElCanalDelChat("yo-1", ref);

    // Arma el canal (microtarea) y conecta (SUBSCRIBED).
    await vi.advanceTimersByTimeAsync(1);
    expect(saludDelChatAhora()).toBe("en-vivo");

    // Se cae el socket: la señal pasa a "reconectando" en el acto (sin esperar al
    // reintento), que es lo que el banner y el poll necesitan ver ya.
    vivo()!.alEstado!("CHANNEL_ERROR");
    expect(saludDelChatAhora()).toBe("reconectando");

    // El reintento (espera 1 s) rearma el canal y vuelve a conectar.
    await vi.advanceTimersByTimeAsync(1100);
    expect(saludDelChatAhora()).toBe("en-vivo");

    // Sin chat montado no hay nada que reconectar: no queda "reconectando" colgado.
    soltar();
    await vi.advanceTimersByTimeAsync(1);
    expect(saludDelChatAhora()).toBe("conectando");
  });

  it("salud multi-fuente: la PEOR gana (la conversación caída manda aunque la lista esté en vivo)", () => {
    // Base limpia.
    reportarSaludDelChat("lista", "conectando");
    reportarSaludDelChat("mensajes:x", "conectando");
    expect(saludDelChatAhora()).toBe("conectando");

    // La lista entrega pero el canal de la conversación abierta está caído: la
    // salud global tiene que decir "reconectando" (si no, el banner y el poll se
    // apagarían con la conversación todavía sin entregar — el hallazgo que cerramos).
    reportarSaludDelChat("lista", "en-vivo");
    reportarSaludDelChat("mensajes:x", "reconectando");
    expect(saludDelChatAhora()).toBe("reconectando");

    // La conversación vuelve: recién ahí, en vivo.
    reportarSaludDelChat("mensajes:x", "en-vivo");
    expect(saludDelChatAhora()).toBe("en-vivo");

    // Se cierra la conversación (su fuente se retira): la lista sola manda.
    reportarSaludDelChat("mensajes:x", "conectando");
    expect(saludDelChatAhora()).toBe("en-vivo");

    // Limpieza para no arrastrar estado a otros tests.
    reportarSaludDelChat("lista", "conectando");
    expect(saludDelChatAhora()).toBe("conectando");
  });
});
