// Pruebas de la sala fija por persona (sala-fija.ts). Correr:
//   deno test --allow-read --allow-env supabase/functions/cowork-session/sala-fija.test.ts
//
// EL BUG (18/11/2026, videos del supervisor): en «Chatters Kash» cada chatter
// tiene su sala (Plus 1, Plus 2…), pero al abrir Cowork el servidor metía a los
// nuevos en la PRIMERA sala («Masivo 1»), y el supervisor no podía dejar a nadie
// en su sala si no estaba conectado.
import { assert, assertEquals } from "jsr:@std/assert";
import { decidirAsignarSala, elegirSalaPorDefecto, guardarSalaFija, leerSalaFija } from "./sala-fija.ts";

const salas = [
  { id: "masivo-1", sort_order: 0 },
  { id: "plus-2", sort_order: 2 },
  { id: "plus-1", sort_order: 1 },
];

Deno.test("la sala fija manda sobre la última y la primera", () => {
  assertEquals(elegirSalaPorDefecto({ fija: "plus-2", ultima: "plus-1", salas }), "plus-2");
});

Deno.test("EL BUG: sin fija ni historial cae en la primera por orden (como antes)", () => {
  assertEquals(elegirSalaPorDefecto({ fija: null, ultima: null, salas }), "masivo-1");
});

Deno.test("sin fija, reanuda la última sala", () => {
  assertEquals(elegirSalaPorDefecto({ fija: null, ultima: "plus-1", salas }), "plus-1");
});

Deno.test("si su sala fija se cerró, sigue con la regla de antes", () => {
  assertEquals(elegirSalaPorDefecto({ fija: "cerrada", ultima: "plus-1", salas }), "plus-1");
  assertEquals(elegirSalaPorDefecto({ fija: "cerrada", ultima: "otra-cerrada", salas }), "masivo-1");
});

Deno.test("sesión sin salas: null", () => {
  assertEquals(elegirSalaPorDefecto({ fija: "plus-1", ultima: null, salas: [] }), null);
});

Deno.test("asignar sala: conectado se mueve, desconectado o sin membresía solo queda fijo", () => {
  assertEquals(decidirAsignarSala({ rolMiembro: "participant", tieneSalaActiva: true, mismaAgencia: true }), "mover");
  assertEquals(decidirAsignarSala({ rolMiembro: "participant", tieneSalaActiva: false, mismaAgencia: true }), "solo-fija");
  assertEquals(decidirAsignarSala({ rolMiembro: null, tieneSalaActiva: false, mismaAgencia: true }), "solo-fija");
});

Deno.test("asignar sala: a un anfitrión no, y a alguien de otra agencia tampoco", () => {
  assertEquals(decidirAsignarSala({ rolMiembro: "host", tieneSalaActiva: false, mismaAgencia: true }), "es-anfitrion");
  assertEquals(decidirAsignarSala({ rolMiembro: null, tieneSalaActiva: false, mismaAgencia: false }), "fuera");
});

// Base falsa mínima: la tabla puede no existir todavía (migración a mano).
function base(opts: { falla?: boolean; filas?: Record<string, unknown>[] }) {
  const escrito: Record<string, unknown>[] = [];
  const db = {
    escrito,
    from(_t: string) {
      const q = {
        select() { return q; },
        eq() { return q; },
        maybeSingle() {
          return Promise.resolve(opts.falla
            ? { data: null, error: { message: "relation \"cowork_sala_fija\" does not exist" } }
            : { data: opts.filas?.[0] ?? null, error: null });
        },
        upsert(fila: Record<string, unknown>) {
          if (opts.falla) return Promise.resolve({ error: { message: "no existe" } });
          escrito.push(fila);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return db;
}

Deno.test("leer: sin tabla o con fallo devuelve null (nadie se queda sin entrar)", async () => {
  assertEquals(await leerSalaFija(base({ falla: true }), "s", "u"), null);
  assertEquals(await leerSalaFija(base({ filas: [{ room_id: "plus-1" }] }), "s", "u"), "plus-1");
});

Deno.test("guardar: escribe quién la fijó y avisa si no pudo", async () => {
  const db = base({});
  assert(await guardarSalaFija(db, { sessionId: "s", userId: "u", roomId: "plus-1", por: "sup" }));
  assertEquals(db.escrito[0].room_id, "plus-1");
  assertEquals(db.escrito[0].asignado_por, "sup");
  assertEquals(await guardarSalaFija(base({ falla: true }), { sessionId: "s", userId: "u", roomId: "r", por: "sup" }), false);
});

// Guarda de código: las tres puertas dejan la sala fija.
const fuente = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
const bloque = (accion: string) => {
  const i = fuente.indexOf(`action === "${accion}"`);
  const resto = fuente.slice(i + 10);
  return resto.slice(0, resto.indexOf('if (action === "'));
};

Deno.test("joinSession prefiere la sala fija y solo el enlace (porEnlace) mueve", () => {
  const b = bloque("joinSession");
  assert(b.includes("leerSalaFija(admin, sessionId, userId)"));
  assert(b.includes("body.porEnlace === true"));
  assert(/porEnlace && currentAssignment && currentAssignment\.room_id !== salaPedida/.test(b));
  assert(b.includes("guardarSalaFija(admin"));
});

Deno.test("joinByCode y asignarSala guardan la sala fija", () => {
  assert(bloque("joinByCode").includes("guardarSalaFija(admin"));
  const a = bloque("asignarSala");
  assert(a.includes("soloFija: true"));
  assert(a.includes("guardarSalaFija(admin, { sessionId, userId: target, roomId, por: userId })"));
});
