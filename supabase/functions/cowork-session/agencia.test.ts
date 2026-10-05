// Pruebas de la guarda de agencia de cowork-session (agencia.ts), con una base
// falsa en memoria que entiende lo que la guarda le pide a supabase-js:
// select / eq / in / limit / maybeSingle.
//
//   deno test --allow-read supabase/functions/cowork-session/agencia.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { agenciaDeSesion, DE_OTRA_SESION, idsDelPedido, NO_ENCONTRADA, revisarPedido, topeDeLaTabla, type Base } from "./agencia.ts";

type Fila = Record<string, unknown>;
function baseFalsa(tablas: Record<string, Fila[]>): Base & { consultas: string[] } {
  const consultas: string[] = [];
  return {
    consultas,
    from(tabla: string) {
      let filas = [...(tablas[tabla] ?? [])];
      let cols = "*";
      const q = {
        select(c: string) { cols = c; return q; },
        eq(c: string, v: unknown) { filas = filas.filter((f) => f[c] === v); return q; },
        in(c: string, vs: unknown[]) { filas = filas.filter((f) => vs.includes(f[c])); return q; },
        limit(n: number) { filas = filas.slice(0, n); return q; },
        recortar() {
          if (cols === "*") return filas;
          const ks = cols.split(",").map((s) => s.trim());
          return filas.map((f) => Object.fromEntries(ks.filter((k) => k in f).map((k) => [k, f[k]])));
        },
        maybeSingle() { consultas.push(tabla); return Promise.resolve({ data: q.recortar()[0] ?? null, error: null }); },
        then(ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) { consultas.push(tabla); return Promise.resolve({ data: q.recortar(), error: null }).then(ok, mal); },
      };
      return q;
    },
  };
}

const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANA, BETO, OLGA] = [1, 2, 3].map(id);
const [SA, SA2, SB] = [11, 12, 13].map(id);
const [RA, RA2, RB] = [21, 22, 23].map(id);
const [MA, MB] = [31, 32].map(id);
const [HA, HB, PA, PB] = [41, 42, 43, 44].map(id);

// Después de la migración: las sesiones tienen tenant_id.
const conMigracion = () => baseFalsa({
  tenant_members: [{ user_id: ANA, tenant_id: A }, { user_id: BETO, tenant_id: A }, { user_id: OLGA, tenant_id: B }],
  cowork_sessions: [
    { id: SA, created_by: ANA, tenant_id: A }, { id: SA2, created_by: BETO, tenant_id: A }, { id: SB, created_by: OLGA, tenant_id: B },
  ],
  cowork_rooms: [{ id: RA, session_id: SA }, { id: RA2, session_id: SA2 }, { id: RB, session_id: SB }],
  cowork_meets: [{ id: MA, session_id: SA }, { id: MB, session_id: SB }],
  cowork_host_requests: [{ id: HA, session_id: SA }, { id: HB, session_id: SB }],
  cowork_screenshare_requests: [{ id: PA, session_id: SA }, { id: PB, session_id: SB }],
  cowork_break_limits: [
    { tenant_id: A, kind: "bano", label: "Baño", minutos: 10 }, { tenant_id: B, kind: "bano", label: "Baño", minutos: 5 },
  ],
});
// Antes de la migración: sin tenant_id en sesiones ni topes.
const sinMigracion = () => baseFalsa({
  tenant_members: [{ user_id: ANA, tenant_id: A }, { user_id: OLGA, tenant_id: B }],
  cowork_sessions: [{ id: SA, created_by: ANA }, { id: SB, created_by: OLGA }],
  cowork_rooms: [{ id: RA, session_id: SA }, { id: RB, session_id: SB }],
  cowork_break_limits: [{ kind: "bano", label: "Baño", minutos: 10 }],
});

Deno.test("idsDelPedido: cada id a su tipo; «hub» no es una sala; requestId según la acción", () => {
  assertEquals(idsDelPedido("issueLiveKitToken", { sessionId: SA, roomId: "hub" }), { sessionId: SA, roomIds: [] });
  assertEquals(idsDelPedido("crearMeetGrupal", { sessionId: SA, roomIds: [RA, RA2, 7] }).roomIds, [RA, RA2]);
  assertEquals(idsDelPedido("approveScreenShare", { requestId: PA }).pedidoDePantalla, PA);
  assertEquals(idsDelPedido("claimScreenShareToken", { requestId: PA }).pedidoDePantalla, PA);
  for (const a of ["joinOneOnOne", "ackHostRequest", "resolveHostRequest"]) assertEquals(idsDelPedido(a, { requestId: HA }).pedidoDeAnfitrion, HA);
  assertEquals(idsDelPedido("terminarMeetGrupal", { meetId: MA }).meetId, MA);
});

Deno.test("la sesión de mi agencia pasa; la de otra agencia «no existe»", async () => {
  const db = conMigracion();
  assertEquals(await revisarPedido(db, A, "latido", { sessionId: SA }), { ok: true });
  assertEquals(await revisarPedido(db, A, "joinSession", { sessionId: SB, role: "host" }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, B, "endSession", { sessionId: SA }), { ok: false, status: 404, error: NO_ENCONTRADA });
});

Deno.test("una cuenta sin agencia no toca ninguna sesión", async () => {
  const r = await revisarPedido(conMigracion(), null, "latido", { sessionId: SA });
  assertEquals(r, { ok: false, status: 404, error: NO_ENCONTRADA });
});

Deno.test("una sesión que no existe la contesta la acción; un id que no es uuid es «no encontrada»", async () => {
  const db = conMigracion();
  assertEquals(await revisarPedido(db, A, "joinSession", { sessionId: id(99) }), { ok: true });
  assertEquals(await revisarPedido(db, A, "joinSession", { sessionId: "nada" }), { ok: false, status: 404, error: NO_ENCONTRADA });
});

Deno.test("HUECO DE HOY: un anfitrión no pide token de una sala de otra sesión, ni de su misma agencia", async () => {
  const db = conMigracion();
  for (const purpose of ["join_room", "preview_room", "monitor_room", "incognito_room"]) {
    assertEquals(await revisarPedido(db, A, "issueLiveKitToken", { sessionId: SA, purpose, roomId: RA2 }), { ok: false, status: 400, error: DE_OTRA_SESION }, purpose);
    assertEquals(await revisarPedido(db, A, "issueLiveKitToken", { sessionId: SA, purpose, roomId: RA }), { ok: true }, purpose);
  }
  // Y una sala de otra agencia con su propia sesión: «no existe».
  assertEquals(await revisarPedido(db, A, "issueLiveKitToken", { sessionId: SB, purpose: "join_room", roomId: RB }), { ok: false, status: 404, error: NO_ENCONTRADA });
});

Deno.test("HUECO DE HOY: los pedidos de anfitrión y de pantalla no apuntan a una sala de otra sesión", async () => {
  const db = conMigracion();
  for (const action of ["requestHost", "requestScreenShare"]) {
    assertEquals(await revisarPedido(db, A, action, { sessionId: SA, roomId: RA2 }), { ok: false, status: 400, error: DE_OTRA_SESION }, action);
    assertEquals(await revisarPedido(db, A, action, { sessionId: SA, roomId: RA }), { ok: true }, action);
  }
});

Deno.test("el meet grupal: todas las salas y el meet tienen que ser de la sesión", async () => {
  const db = conMigracion();
  assertEquals(await revisarPedido(db, A, "crearMeetGrupal", { sessionId: SA, roomIds: [RA, RA2] }), { ok: false, status: 400, error: DE_OTRA_SESION });
  assertEquals(await revisarPedido(db, A, "issueLiveKitToken", { sessionId: SA, purpose: "join_meet_grupal", meetId: MB }), { ok: false, status: 400, error: DE_OTRA_SESION });
  assertEquals(await revisarPedido(db, B, "terminarMeetGrupal", { meetId: MA }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, A, "terminarMeetGrupal", { meetId: MA }), { ok: true });
});

Deno.test("joinSession: una sala de otra sesión en la URL no impide entrar (la acción la ignora), pero la agencia sí", async () => {
  const db = conMigracion();
  assertEquals(await revisarPedido(db, A, "joinSession", { sessionId: SA, roomId: RA2 }), { ok: true });
  assertEquals(await revisarPedido(db, A, "joinSession", { sessionId: SB, roomId: RB }), { ok: false, status: 404, error: NO_ENCONTRADA });
});

Deno.test("sin sessionId (updateRoom, closeRoom, pedidos): se mira la sesión de lo que se nombra", async () => {
  const db = conMigracion();
  assertEquals(await revisarPedido(db, B, "updateRoom", { roomId: RA, name: "x" }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, B, "closeRoom", { roomId: RA }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, A, "closeRoom", { roomId: RA }), { ok: true });
  assertEquals(await revisarPedido(db, B, "approveScreenShare", { requestId: PA, approve: true }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, B, "ackHostRequest", { requestId: HA }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, B, "joinOneOnOne", { requestId: HB }), { ok: true });
});

Deno.test("antes de la migración la agencia de la sesión es la de quien la creó", async () => {
  const db = sinMigracion();
  assertEquals(await agenciaDeSesion(db, SA), A);
  assertEquals(await agenciaDeSesion(db, SB), B);
  assertEquals(await revisarPedido(db, B, "latido", { sessionId: SA }), { ok: false, status: 404, error: NO_ENCONTRADA });
  assertEquals(await revisarPedido(db, A, "issueLiveKitToken", { sessionId: SA, purpose: "join_room", roomId: RB }), { ok: false, status: 400, error: DE_OTRA_SESION });
  assertEquals(await revisarPedido(db, A, "latido", { sessionId: SA }), { ok: true });
});

Deno.test("el tope de pausa sale de la agencia de la sesión (y antes de la migración, de la única fila)", async () => {
  assertEquals(await topeDeLaTabla(conMigracion(), "bano", A), { minutos: 10, label: "Baño" });
  assertEquals(await topeDeLaTabla(conMigracion(), "bano", B), { minutos: 5, label: "Baño" });
  assertEquals(await topeDeLaTabla(conMigracion(), "break", A), null);
  assertEquals(await topeDeLaTabla(sinMigracion(), "bano", A), { minutos: 10, label: "Baño" });
});

// ── La guarda está puesta donde tiene que estar ─────────────────────────────
const FUENTE = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
const ACCIONES = [...FUENTE.matchAll(/action === "(\w+)"/g)].map((m) => ({ nombre: m[1], en: m.index! }));

Deno.test("index.ts corre revisarPedido una vez, antes de la primera acción", () => {
  const llamadas = [...FUENTE.matchAll(/revisarPedido\(/g)];
  assertEquals(llamadas.length, 1, "una sola llamada");
  assert(llamadas[0].index! < Math.min(...ACCIONES.map((a) => a.en)), "antes de cualquier `action ===`");
  assert(ACCIONES.length >= 30, `se encontraron las acciones (${ACCIONES.length})`);
});

Deno.test("toda acción que recibe requestId está clasificada (pantalla o anfitrión)", () => {
  const sinClasificar: string[] = [];
  const bloques = [...FUENTE.matchAll(/if \(action === "(\w+)"(?: \|\| action === "(\w+)")?\) \{([\s\S]*?)(?=\n    if \(action ===|\n    return err\(req, "Unknown action)/g)];
  for (const b of bloques) {
    const nombres = [b[1], b[2]].filter(Boolean);
    if (!/const \{[^}]*\brequestId\b[^}]*\} = body/.test(b[3])) continue;
    for (const n of nombres) if (!idsDelPedido(n, { requestId: HA }).pedidoDeAnfitrion && !idsDelPedido(n, { requestId: HA }).pedidoDePantalla) sinClasificar.push(n);
  }
  assertEquals(sinClasificar, []);
});

Deno.test("los topes de pausa ya no se leen solo por tipo", () => {
  assert(!/from\("cowork_break_limits"\)[\s\S]{0,80}\.eq\("kind"/.test(FUENTE), "index.ts usa topeDeLaTabla");
});
