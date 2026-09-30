// EL CANAL DEL CHAT (hooks/canalDelChat.ts): uno por pestaña para todos.
//
// Lo que tiene que cumplir para poder reemplazar a los cuatro canales que había:
//  - un solo canal aunque se registren varios en la misma vuelta;
//  - cada evento llega a TODOS los que lo pidieron, una vez, con el callback
//    del último render (va por ref);
//  - si un oyente revienta, los demás reciben igual;
//  - revive solo (CLOSED / CHANNEL_ERROR / TIMED_OUT) con topic NUEVO, y al
//    revivir avisa `alRevivir` para que cada uno traiga lo que se perdió;
//  - el CLOSED de nuestro propio removeChannel no programa nada;
//  - volver del segundo plano (≥30 s) o recuperar la red → canal nuevo;
//  - React limpia y vuelve a registrar en la misma vuelta: eso NO cierra el canal;
//  - el último que se va lo cierra.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const base = vi.hoisted(() => {
  type Filtro = { event: string; schema: string; table: string; filter?: string };
  class CanalFalso {
    escuchas: { filtro: Filtro; cb: (p: unknown) => void }[] = [];
    removido = false;
    alEstado?: (s: string) => void;
    constructor(public topic: string) {}
    on(_type: string, filtro: Filtro, cb: (p: unknown) => void) {
      this.escuchas.push({ filtro, cb });
      return this;
    }
    subscribe(cb?: (s: string) => void) {
      this.alEstado = cb;
      return this;
    }
  }
  const canales: CanalFalso[] = [];
  const supabase = {
    channel(topic: string) {
      const c = new CanalFalso(topic);
      canales.push(c);
      return c;
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

import {
  registrarEnElCanalDelChat as registrarDeVerdad,
  ESCUCHAS_DEL_CHAT,
  type OyentesDelChat,
  type RefDeOyentes,
} from "@/hooks/canalDelChat";
import { MINIMO_OCULTO_MS } from "@/hooks/useReanudarAlVolver";

const vivos = () => base.canales.filter((c) => !c.removido);
const microtareas = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const ref = (o: OyentesDelChat) => ({ current: o });
// Todo lo registrado se suelta al final de cada caso, pase lo que pase: el
// estado del canal vive en el módulo y un caso que falla a la mitad no puede
// arrastrar a los siguientes.
const pendientes: (() => void)[] = [];
function registrarEnElCanalDelChat(userId: string, r: RefDeOyentes): () => void {
  const soltar = registrarDeVerdad(userId, r);
  pendientes.push(soltar);
  return soltar;
}

function emitir(tabla: string, evento: string, fila: Record<string, unknown>) {
  let entregas = 0;
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.filtro.table !== tabla || e.filtro.event !== evento) continue;
      const m = e.filtro.filter?.match(/^(\w+)=eq\.(.+)$/);
      if (m && String(fila[m[1]]) !== m[2]) continue;
      entregas++;
      e.cb({ new: fila, old: {} });
    }
  }
  return entregas;
}

function ponerVisibilidad(v: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  base.canales.length = 0;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(async () => {
  pendientes.splice(0).forEach((soltar) => soltar());
  await microtareas();
  vi.useRealTimers();
});

describe("canal del chat", () => {
  it("varios en la misma vuelta → UN canal con una escucha por (tabla, evento)", async () => {
    const sueltos = [
      registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": () => {} })),
      registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": () => {}, "chat_participants:UPDATE": () => {} })),
      registrarEnElCanalDelChat("u1", ref({})),
    ];
    await microtareas();
    expect(vivos()).toHaveLength(1);
    const claves = vivos()[0].escuchas.map((e) => `${e.filtro.table}:${e.filtro.event}${e.filtro.filter ? ` [${e.filtro.filter}]` : ""}`);
    expect(claves.sort()).toEqual([
      "chat_conversations:DELETE",
      "chat_conversations:UPDATE [type=eq.group]",
      "chat_messages:DELETE",
      "chat_messages:INSERT",
      "chat_messages:UPDATE",
      "chat_participants:DELETE",
      "chat_participants:INSERT",
      "chat_participants:UPDATE [user_id=eq.u1]",
    ]);
    expect(claves).toHaveLength(Object.keys(ESCUCHAS_DEL_CHAT).length);
    sueltos.forEach((f) => f());
    await microtareas();
    expect(vivos()).toHaveLength(0);
  });

  it("cada evento llega una vez a cada uno que lo pidió, con el callback más nuevo", async () => {
    const a = vi.fn();
    const b1 = vi.fn();
    const b2 = vi.fn();
    const refB = ref({ "chat_messages:INSERT": b1 });
    const sa = registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": a }));
    const sb = registrarEnElCanalDelChat("u1", refB);
    await microtareas();
    refB.current = { "chat_messages:INSERT": b2 }; // otro render
    expect(emitir("chat_messages", "INSERT", { id: "m1" })).toBe(1); // UNA escucha en la base
    expect(a).toHaveBeenCalledTimes(1);
    expect(b1).not.toHaveBeenCalled();
    expect(b2).toHaveBeenCalledTimes(1);
    sa(); sb();
    await microtareas();
  });

  it("si un oyente revienta, los demás reciben igual", async () => {
    const bien = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s1 = registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": () => { throw new Error("boom"); } }));
    const s2 = registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": bien }));
    await microtareas();
    emitir("chat_messages", "INSERT", { id: "m1" });
    expect(bien).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    s1(); s2();
    await microtareas();
  });

  it("alSuscribir en cada SUBSCRIBED; quien llega tarde recibe el suyo; alRevivir solo tras una caída", async () => {
    const sus1 = vi.fn();
    const rev1 = vi.fn();
    const s1 = registrarEnElCanalDelChat("u1", ref({ alSuscribir: sus1, alRevivir: rev1 }));
    await microtareas();
    const [primero] = vivos();
    primero.alEstado?.("SUBSCRIBED");
    expect(sus1).toHaveBeenCalledTimes(1);
    expect(rev1).not.toHaveBeenCalled();

    // Llega otro con el canal ya conectado: su alSuscribir, sin canal nuevo.
    const sus2 = vi.fn();
    const s2 = registrarEnElCanalDelChat("u1", ref({ alSuscribir: sus2 }));
    await microtareas();
    expect(sus2).toHaveBeenCalledTimes(1);
    expect(sus1).toHaveBeenCalledTimes(1);
    expect(base.canales).toHaveLength(1);

    // Se cae: espera, canal NUEVO (otro topic), y al conectar avisa a los dos.
    primero.alEstado?.("CHANNEL_ERROR");
    expect(base.canales).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vivos()).toHaveLength(1);
    const [segundo] = vivos();
    expect(segundo).not.toBe(primero);
    expect(segundo.topic).not.toBe(primero.topic);
    segundo.alEstado?.("SUBSCRIBED");
    expect(sus1).toHaveBeenCalledTimes(2);
    expect(sus2).toHaveBeenCalledTimes(2);
    expect(rev1).toHaveBeenCalledTimes(1);

    // Un evento del canal viejo (tardío) ya no se reparte.
    const tarde = vi.fn();
    const s3 = registrarEnElCanalDelChat("u1", ref({ "chat_messages:INSERT": tarde }));
    await microtareas();
    primero.escuchas.find((e) => e.filtro.table === "chat_messages" && e.filtro.event === "INSERT")?.cb({ new: {}, old: {} });
    expect(tarde).not.toHaveBeenCalled();

    s1(); s2(); s3();
    await microtareas();
    expect(vivos()).toHaveLength(0);
  });

  it("caídas seguidas esperan cada vez más (1 s, 2 s, 4 s…)", async () => {
    const s = registrarEnElCanalDelChat("u1", ref({}));
    await microtareas();
    vivos()[0].alEstado?.("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(base.canales).toHaveLength(2);
    vivos()[0].alEstado?.("CLOSED");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(base.canales).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(base.canales).toHaveLength(3);
    s();
    await microtareas();
  });

  it("si el canal vuelve solo tras un CHANNEL_ERROR, no se rearma y avisa alRevivir", async () => {
    // realtime-js reintenta por su cuenta un canal con error. Si queda
    // SUBSCRIBED antes de la espera, el rearmado programado sobra: la lista de
    // useChat lo cancelaba con su canal propio y el compartido tiene que hacer
    // lo mismo (si no, cada error suelto era un canal nuevo y otra recarga).
    const rev = vi.fn();
    const s = registrarEnElCanalDelChat("u1", ref({ alRevivir: rev }));
    await microtareas();
    const [canal] = vivos();
    canal.alEstado?.("SUBSCRIBED");
    canal.alEstado?.("CHANNEL_ERROR");
    canal.alEstado?.("SUBSCRIBED");
    expect(rev).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(base.canales).toHaveLength(1);
    expect(vivos()).toEqual([canal]);
    s();
    await microtareas();
  });

  it("el CLOSED de nuestro propio removeChannel no programa nada", async () => {
    const s = registrarEnElCanalDelChat("u1", ref({}));
    await microtareas();
    s();
    await microtareas();
    expect(vivos()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(base.canales).toHaveLength(1);
  });

  it("limpiar y volver a registrar en la misma vuelta (re-render) NO cierra el canal", async () => {
    const r = ref({});
    const s1 = registrarEnElCanalDelChat("u1", r);
    await microtareas();
    const canal = vivos()[0];
    s1();
    const s2 = registrarEnElCanalDelChat("u1", r);
    await microtareas();
    expect(vivos()).toEqual([canal]);
    s2();
    await microtareas();
    expect(vivos()).toHaveLength(0);
  });

  it("volver tras ≥30 s oculto o recuperar la red → canal nuevo y alRevivir; UNA vez por pestaña", async () => {
    const rev = vi.fn();
    const s1 = registrarEnElCanalDelChat("u1", ref({ alRevivir: rev }));
    const s2 = registrarEnElCanalDelChat("u1", ref({ alRevivir: rev }));
    await microtareas();
    vivos()[0].alEstado?.("SUBSCRIBED");

    ponerVisibilidad("hidden");
    vi.advanceTimersByTime(MINIMO_OCULTO_MS + 1_000);
    ponerVisibilidad("visible");
    await microtareas();
    // Dos oyentes, un solo canal nuevo (antes cada hook rearmaba el suyo).
    expect(base.canales).toHaveLength(2);
    expect(vivos()).toHaveLength(1);
    vivos()[0].alEstado?.("SUBSCRIBED");
    expect(rev).toHaveBeenCalledTimes(2); // uno por oyente

    window.dispatchEvent(new Event("online"));
    await microtareas();
    expect(base.canales).toHaveLength(3);

    // Oculto poco: nada.
    ponerVisibilidad("hidden");
    vi.advanceTimersByTime(5_000);
    ponerVisibilidad("visible");
    await microtareas();
    expect(base.canales).toHaveLength(3);

    s1(); s2();
    await microtareas();
    // Cerrado: la vuelta ya no abre nada.
    window.dispatchEvent(new Event("online"));
    await microtareas();
    expect(base.canales).toHaveLength(3);
    expect(vivos()).toHaveLength(0);
  });

  it("filtra en el servidor lo que solo es mío: la lectura de otro y el updated_at de un directo no llegan", async () => {
    const participacion = vi.fn();
    const conversacion = vi.fn();
    const s = registrarEnElCanalDelChat("u1", ref({
      "chat_participants:UPDATE": participacion,
      "chat_conversations:UPDATE": conversacion,
    }));
    await microtareas();
    expect(emitir("chat_participants", "UPDATE", { user_id: "otro" })).toBe(0);
    expect(emitir("chat_participants", "UPDATE", { user_id: "u1" })).toBe(1);
    expect(emitir("chat_conversations", "UPDATE", { id: "c1", type: "direct" })).toBe(0);
    expect(emitir("chat_conversations", "UPDATE", { id: "g1", type: "group" })).toBe(1);
    expect(participacion).toHaveBeenCalledTimes(1);
    expect(conversacion).toHaveBeenCalledTimes(1);
    s();
    await microtareas();
  });

  it("cada cuenta tiene su canal (cambio de usuario en la misma pestaña)", async () => {
    const s1 = registrarEnElCanalDelChat("u1", ref({}));
    const s2 = registrarEnElCanalDelChat("u2", ref({}));
    await microtareas();
    expect(vivos().map((c) => c.topic.split("::")[0]).sort()).toEqual(["chat-u1", "chat-u2"]);
    s1();
    await microtareas();
    expect(vivos().map((c) => c.topic.split("::")[0])).toEqual(["chat-u2"]);
    s2();
    await microtareas();
  });
});
