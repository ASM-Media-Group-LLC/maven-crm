// NINGÚN MENSAJE MÁS DE ~5 S TARDE.
//
// Simulacro v2 (19/11/2026, 100 personas en 4 países): el 99,7 % de los mensajes
// llegó en vivo (mediana 0,45 s), pero el p95 era ~40 s: 1 de cada 20 perdía su
// evento en vivo y nada lo buscaba hasta que el latido de realtime-js (cada 25 s,
// muerto recién al segundo sin respuesta) cerraba el socket y se recargaba.
//
// Esta guarda fija las tres redes que lo bajan a ≤5 s:
//  - el guardián de la conversación abierta repasa cada ≤5 s;
//  - todas las rutas mezclan por id (lo que llega por dos lados no se duplica);
//  - el latido sale cada ≤10 s y un latido sin respuesta enciende el repaso.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const base = vi.hoisted(() => {
  class CanalFalso {
    removido = false;
    alEstado?: (s: string) => void;
    constructor(public topic: string) {}
    on() { return this; }
    subscribe(cb?: (s: string) => void) {
      this.alEstado = cb;
      queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); });
      return this;
    }
    unsubscribe() { return Promise.resolve("ok"); }
  }
  const canales: CanalFalso[] = [];
  const supabase = {
    channel(topic: string) {
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
vi.mock("@/hooks/useReanudarAlVolver", () => ({ escucharLaVuelta: () => () => {}, useReanudarAlVolver: () => {} }));

import { mezclarMensajesNuevos, REPASO_ABIERTO_MS, REPASO_CAIDO_MS } from "@/hooks/useChat";
import { registrarEnElCanalDelChat, saludDelChatAhora } from "@/hooks/canalDelChat";
import {
  alLatidoDelSocket,
  socketSinLatido,
  LATIDO_REALTIME_MS,
  LATIDO_SIN_RESPUESTA_MS,
} from "@/lib/latidoDelRealtime";
import type { ChatMessage } from "@/pages/messenger/types";

const leer = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const fuenteChat = leer(import.meta.glob("../../hooks/useChat.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const fuenteCliente = leer(import.meta.glob("../../integrations/supabase/client.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);

function msg(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id, conversation_id: "c1", sender_id: "otro", content: `hola ${id}`, type: "text",
    file_url: null, file_name: null, file_size: null, reply_to_id: null, album_id: null,
    is_thread_reply: false, content_rich: null, api_key_id: null, api_display_name: null,
    is_edited: false, is_deleted: false,
    created_at: "2026-11-19T15:06:00.000Z", updated_at: "2026-11-19T15:06:00.000Z",
    ...extra,
  } as ChatMessage;
}

beforeEach(() => { base.canales.length = 0; });
afterEach(() => { vi.useRealTimers(); alLatidoDelSocket("ok"); });

describe("el guardián de la conversación abierta", () => {
  it("repasa la conversación abierta cada 5 s o menos (y la caída también)", () => {
    expect(REPASO_ABIERTO_MS).toBeLessThanOrEqual(5000);
    expect(REPASO_CAIDO_MS).toBeLessThanOrEqual(5000);
    // El intervalo del guardián usa esa constante (no un número suelto más largo).
    expect(fuenteChat).toMatch(/setInterval\([\s\S]{0,600}?REPASO_ABIERTO_MS\)/);
  });

  it("también escucha el INSERT del canal de la lista (segunda ruta, sin escucha nueva)", () => {
    expect(fuenteChat).toMatch(/useEscuchaDelChat\(user\?\.id,\s*\{\s*"chat_messages:INSERT"/);
  });

  it("al volver la red o la ventana, se pone al día de una", () => {
    expect(fuenteChat).toMatch(/handleFocus = \(\) => \{[\s\S]{0,200}traerNuevosRef\.current/);
    expect(fuenteChat).toMatch(/alVolverLaRed = \(\) => void traerNuevosRef\.current/);
  });
});

describe("dedupe por id: lo que llega por dos lados no se duplica", () => {
  it("el mismo mensaje por el canal en vivo, la lista y el repaso queda UNA vez", () => {
    const optimistas = new Set<string>();
    let lista: ChatMessage[] = [msg("a")];
    lista = mezclarMensajesNuevos(lista, [msg("b")], optimistas); // canal en vivo
    lista = mezclarMensajesNuevos(lista, [msg("b")], optimistas); // canal de la lista
    lista = mezclarMensajesNuevos(lista, [msg("a"), msg("b"), msg("c")], optimistas); // repaso
    expect(lista.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sin nada nuevo devuelve el MISMO arreglo (no re-renderiza)", () => {
    const lista = [msg("a"), msg("b")];
    expect(mezclarMensajesNuevos(lista, [msg("b")], new Set())).toBe(lista);
  });

  it("dos filas iguales en el mismo lote entran una sola vez", () => {
    const lista = mezclarMensajesNuevos([], [msg("x"), msg("x")], new Set());
    expect(lista.map((m) => m.id)).toEqual(["x"]);
  });

  it("mi fila real reemplaza a su burbuja optimista en vez de duplicarla", () => {
    const optimistas = new Set(["tmp-1"]);
    const burbuja = msg("tmp-1", { sender_id: "yo", content: "listo" });
    const real = msg("real-1", { sender_id: "yo", content: "listo", created_at: "2026-11-19T15:06:01.000Z" });
    const lista = mezclarMensajesNuevos([burbuja], [real], optimistas);
    expect(lista.map((m) => m.id)).toEqual(["real-1"]);
    expect(optimistas.has("tmp-1")).toBe(false);
    // Y si después llega otra vez por la otra ruta, no se duplica.
    expect(mezclarMensajesNuevos(lista, [real], optimistas).map((m) => m.id)).toEqual(["real-1"]);
  });

  it("la fila de MI integración no se come mi burbuja optimista", () => {
    const optimistas = new Set(["tmp-1"]);
    const burbuja = msg("tmp-1", { sender_id: "yo", content: "listo" });
    const deApi = msg("api-1", { sender_id: "yo", content: "listo", api_key_id: "k1" } as Partial<ChatMessage>);
    const lista = mezclarMensajesNuevos([burbuja], [deApi], optimistas);
    expect(lista.map((m) => m.id)).toEqual(["tmp-1", "api-1"]);
  });
});

describe("el latido del socket descubre la muerte en silencio", () => {
  it("el cliente late cada ≤10 s (no los 25 s de fábrica) y avisa cada latido", () => {
    expect(LATIDO_REALTIME_MS).toBeLessThanOrEqual(10_000);
    expect(LATIDO_SIN_RESPUESTA_MS).toBeLessThanOrEqual(LATIDO_REALTIME_MS);
    expect(fuenteCliente).toMatch(/heartbeatIntervalMs:\s*LATIDO_REALTIME_MS/);
    expect(fuenteCliente).toMatch(/heartbeatCallback:\s*alLatidoDelSocket/);
  });

  it("latido sin respuesta → la salud pasa a reconectando (enciende el repaso); ok → en vivo", async () => {
    vi.useFakeTimers();
    const soltar = registrarEnElCanalDelChat("yo-1", { current: {} });
    await vi.advanceTimersByTimeAsync(1);
    expect(saludDelChatAhora()).toBe("en-vivo");

    // El canal sigue SUBSCRIBED, pero el socket no contesta el latido.
    alLatidoDelSocket("sent");
    await vi.advanceTimersByTimeAsync(LATIDO_SIN_RESPUESTA_MS - 100);
    expect(socketSinLatido()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(socketSinLatido()).toBe(true);
    expect(saludDelChatAhora()).toBe("reconectando");

    // Contesta: se vuelve a confiar.
    alLatidoDelSocket("ok");
    expect(saludDelChatAhora()).toBe("en-vivo");

    // Un latido que contesta a tiempo no enciende nada.
    alLatidoDelSocket("sent");
    await vi.advanceTimersByTimeAsync(500);
    alLatidoDelSocket("ok");
    await vi.advanceTimersByTimeAsync(LATIDO_SIN_RESPUESTA_MS);
    expect(saludDelChatAhora()).toBe("en-vivo");

    // realtime-js declara el timeout: caído.
    alLatidoDelSocket("timeout");
    expect(saludDelChatAhora()).toBe("reconectando");
    alLatidoDelSocket("ok");

    soltar();
    await vi.advanceTimersByTimeAsync(1);
    expect(saludDelChatAhora()).toBe("conectando");
  });
});
