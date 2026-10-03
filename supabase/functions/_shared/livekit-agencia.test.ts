// Pruebas de la guarda de agencia de las salas de LiveKit (livekit-agencia.ts),
// con una base falsa en memoria que entiende lo que la guarda le pide a
// supabase-js: select / eq / in / gte / lte / limit / maybeSingle. Que la guarda
// diga lo MISMO que la base (agencia_de_sala_livekit) lo prueba el banco
// supabase/tests/meet_por_agencia.ts contra un Postgres de verdad.
//
// Al final, lee el código de las cinco edges: la guarda está puesta antes de
// actuar, en cada acción.
//
//   deno test --allow-read supabase/functions/_shared/livekit-agencia.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  agenciaDeGrabacion, agenciaDePersona, agenciaDeReunion, agenciaDeSala, type Base, deLaAgencia, destinatariosAlParar,
  estaEnLaSala, familiaDeSala, revisarSala, SALA_INVALIDA, SALA_NO_ENCONTRADA, salaValida, SIN_AGENCIA,
} from "./livekit-agencia.ts";

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
        gte(c: string, v: string) { filas = filas.filter((f) => String(f[c]) >= v); return q; },
        lte(c: string, v: string) { filas = filas.filter((f) => String(f[c]) <= v); return q; },
        limit(n: number) { filas = filas.slice(0, n); return q; },
        recortar() {
          if (cols === "*") return filas;
          const ks = cols.split(",").map((s) => s.trim());
          return filas.map((f) => Object.fromEntries(ks.filter((k) => k in f).map((k) => [k, f[k]])));
        },
        maybeSingle() { consultas.push(tabla); return Promise.resolve({ data: q.recortar()[0] ?? null, error: null }); },
        then(ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) {
          consultas.push(tabla);
          return Promise.resolve({ data: q.recortar(), error: null }).then(ok, mal);
        },
      };
      return q;
    },
  };
}

const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANA, BETO, OLGA, SINAG] = [1, 2, 3, 4].map(id);
const SA = "5a000000-0000-4000-8000-000000000001", SB = "b5000000-0000-4000-8000-000000000001";
const CA = "ca000000-0000-4000-8000-000000000001", CB = "cb000000-0000-4000-8000-000000000001";
const CBORRADA = "cd000000-0000-4000-8000-000000000001";
const [GA, GB, GVIEJA] = [41, 42, 43].map(id);

const personas = [{ user_id: ANA, tenant_id: A }, { user_id: BETO, tenant_id: A }, { user_id: OLGA, tenant_id: B }];

// Después de la migración: las filas tienen tenant_id.
const conMigracion = () => baseFalsa({
  tenant_members: personas,
  cowork_sessions: [{ id: SA, created_by: ANA, tenant_id: A }, { id: SB, created_by: OLGA, tenant_id: B }],
  meet_rooms: [
    { id: id(11), livekit_room_name: "meet_aaaa", created_by: ANA, tenant_id: A },
    { id: id(12), livekit_room_name: "meet_bbbb", created_by: OLGA, tenant_id: B },
  ],
  chat_conversations: [{ id: CA, created_by: ANA, tenant_id: A }, { id: CB, created_by: OLGA, tenant_id: B }],
  calls: [
    { id: id(21), room_id: `call-${CA}`, caller_id: ANA, tenant_id: A },
    { id: id(22), room_id: `call-${CBORRADA}`, caller_id: OLGA, tenant_id: B },
  ],
  meeting_recordings: [
    { id: GA, room_name: "meet_aaaa", started_by: ANA, tenant_id: A },
    { id: GB, room_name: "meet_bbbb", started_by: OLGA, tenant_id: B },
  ],
});
// Antes de la migración: sin tenant_id en reuniones, llamadas ni grabaciones (y
// las sesiones de Cowork sin la de 20261001213000, si todavía no se aplicó).
const sinMigracion = () => baseFalsa({
  tenant_members: personas,
  cowork_sessions: [{ id: SA, created_by: ANA }, { id: SB, created_by: OLGA }],
  meet_rooms: [
    { id: id(11), livekit_room_name: "meet_aaaa", created_by: ANA },
    { id: id(12), livekit_room_name: "meet_bbbb", created_by: OLGA },
  ],
  chat_conversations: [{ id: CA, created_by: ANA, tenant_id: A }, { id: CB, created_by: OLGA, tenant_id: B }],
  calls: [
    { id: id(21), room_id: `call-${CA}`, caller_id: ANA },
    { id: id(22), room_id: `call-${CBORRADA}`, caller_id: OLGA },
    { id: id(23), room_id: "call-vieja", caller_id: ANA }, { id: id(24), room_id: "call-vieja", caller_id: BETO },
    { id: id(25), room_id: "call-mezclada", caller_id: ANA }, { id: id(26), room_id: "call-mezclada", caller_id: OLGA },
  ],
  meeting_recordings: [
    { id: GA, room_name: "meet_aaaa", started_by: ANA },
    { id: GB, room_name: "meet_bbbb", started_by: OLGA },
    { id: GVIEJA, room_name: "meet_ya_no_existe", started_by: OLGA },
  ],
});

Deno.test("familiaDeSala: cowork_, meet_, call-; nada más", () => {
  assertEquals(familiaDeSala("cowork_hub_5a000000"), "cowork");
  assertEquals(familiaDeSala("meet_ab12cd34ef56"), "meet");
  assertEquals(familiaDeSala(`call-${CA}`), "llamada");
  assertEquals(familiaDeSala("sala-rara"), null);
  assertEquals(familiaDeSala("Meet_x"), null);
  assert(salaValida("meet_x") && !salaValida("") && !salaValida(" meet_x") && !salaValida(7) && !salaValida("x".repeat(201)));
});

for (const [nombre, db] of [["con la migración", conMigracion], ["antes de la migración", sinMigracion]] as const) {
  Deno.test(`agenciaDeSala ${nombre}: cada familia a su agencia`, async () => {
    const d = db();
    assertEquals(await agenciaDeSala(d, "cowork_hub_5a000000"), A);
    assertEquals(await agenciaDeSala(d, "cowork_5a000000_3"), A);
    assertEquals(await agenciaDeSala(d, "cowork_meet_b5000000_3b000000"), B);
    assertEquals(await agenciaDeSala(d, "cowork_1on1_5a000000_4a000000"), A);
    assertEquals(await agenciaDeSala(d, "cowork_ffffffff_0"), null, "sesión que no existe");
    assertEquals(await agenciaDeSala(d, "cowork_xyz"), null, "sin los 8 caracteres");
    assertEquals(await agenciaDeSala(d, "meet_aaaa"), A);
    assertEquals(await agenciaDeSala(d, "meet_bbbb"), B);
    assertEquals(await agenciaDeSala(d, "meet_nada"), null);
    assertEquals(await agenciaDeSala(d, `call-${CA}`), A, "llamada de grupo o 1:1: la agencia de su conversación");
    assertEquals(await agenciaDeSala(d, `call-${CB}`), B, "aunque no haya ninguna fila en calls (grupos)");
    assertEquals(await agenciaDeSala(d, `call-${CBORRADA}`), B, "conversación borrada: la de sus llamadas");
    assertEquals(await agenciaDeSala(d, `call-${id(99)}`), null);
    assertEquals(await agenciaDeSala(d, "sala-rara"), null);
  });
}

Deno.test("agenciaDeSala: la llamada sin conversación se resuelve solo si todas sus filas dicen la misma agencia", async () => {
  const d = sinMigracion();
  assertEquals(await agenciaDeSala(d, "call-vieja"), A);
  assertEquals(await agenciaDeSala(d, "call-mezclada"), null);
});

Deno.test("una sesión de Cowork se busca por el rango de su prefijo, no por las demás", async () => {
  const d = baseFalsa({
    tenant_members: personas,
    cowork_sessions: [
      { id: "5a000000-ffff-4fff-bfff-ffffffffffff", created_by: ANA, tenant_id: A },
      { id: "5a000001-0000-4000-8000-000000000000", created_by: OLGA, tenant_id: B },
      { id: "59ffffff-ffff-4fff-bfff-ffffffffffff", created_by: OLGA, tenant_id: B },
    ],
  });
  assertEquals(await agenciaDeSala(d, "cowork_5a000000_0"), A);
  // Dos sesiones de agencias distintas con el mismo prefijo: no se sabe (se niega).
  const dos = baseFalsa({
    tenant_members: personas,
    cowork_sessions: [{ id: SA, created_by: ANA, tenant_id: A }, { id: "5a000000-1111-4000-8000-000000000001", created_by: OLGA, tenant_id: B }],
  });
  assertEquals(await agenciaDeSala(dos, "cowork_5a000000_0"), null);
});

Deno.test("revisarSala: lo mío pasa; lo de otra agencia y lo que no existe contestan IGUAL", async () => {
  const d = conMigracion();
  assertEquals(await revisarSala(d, A, "meet_aaaa"), { ok: true, familia: "meet", agencia: A });
  assertEquals(await revisarSala(d, A, `call-${CA}`), { ok: true, familia: "llamada", agencia: A });
  assertEquals(await revisarSala(d, B, "cowork_b5000000_0"), { ok: true, familia: "cowork", agencia: B });
  const ajena = await revisarSala(d, A, "meet_bbbb");
  const inexistente = await revisarSala(d, A, "meet_nada");
  assertEquals(ajena, { ok: false, status: 404, error: SALA_NO_ENCONTRADA });
  assertEquals(ajena, inexistente);
  assertEquals(await revisarSala(d, B, `call-${CA}`), { ok: false, status: 404, error: SALA_NO_ENCONTRADA });
  assertEquals(await revisarSala(d, B, "cowork_hub_5a000000"), { ok: false, status: 404, error: SALA_NO_ENCONTRADA });
  assertEquals(await revisarSala(d, A, "sala-rara"), { ok: false, status: 404, error: SALA_NO_ENCONTRADA });
});

Deno.test("revisarSala: sin agencia no toca ninguna sala, ni consulta nada", async () => {
  const d = conMigracion();
  assertEquals(await revisarSala(d, null, "meet_aaaa"), { ok: false, status: 403, error: SIN_AGENCIA });
  assertEquals(d.consultas, []);
  assertEquals(await revisarSala(d, A, ""), { ok: false, status: 400, error: SALA_INVALIDA });
  assertEquals(await revisarSala(d, A, { room: "meet_aaaa" }), { ok: false, status: 400, error: SALA_INVALIDA });
});

Deno.test("agenciaDePersona: uno por persona; sin agencia o id raro, null", async () => {
  const d = conMigracion();
  assertEquals(await agenciaDePersona(d, ANA), A);
  assertEquals(await agenciaDePersona(d, OLGA), B);
  assertEquals(await agenciaDePersona(d, SINAG), null);
  assertEquals(await agenciaDePersona(d, "' or 1=1"), null);
  assertEquals(await agenciaDePersona(d, null), null);
});

Deno.test("agenciaDeReunion: la columna con la migración; antes, la de quien la creó", async () => {
  assertEquals(await agenciaDeReunion(conMigracion(), { id: id(11), created_by: OLGA, tenant_id: A }), A);
  assertEquals(await agenciaDeReunion(sinMigracion(), { id: id(11), created_by: OLGA }), B);
  assertEquals(await agenciaDeReunion(sinMigracion(), { id: id(11), created_by: SINAG }), null);
});

Deno.test("agenciaDeGrabacion: la columna; antes, la de su sala o la de quien grabó; undefined si no existe", async () => {
  assertEquals(await agenciaDeGrabacion(conMigracion(), GA), A);
  assertEquals(await agenciaDeGrabacion(conMigracion(), GB), B);
  assertEquals(await agenciaDeGrabacion(sinMigracion(), GA), A);
  assertEquals(await agenciaDeGrabacion(sinMigracion(), GVIEJA), B, "sala que ya no existe: la de quien grabó");
  assertEquals(await agenciaDeGrabacion(conMigracion(), id(98)), undefined);
  assertEquals(await agenciaDeGrabacion(conMigracion(), "nada"), undefined);
});

Deno.test("deLaAgencia: solo gente de esa agencia, sin repetir ni ids raros", async () => {
  const d = conMigracion();
  assertEquals(await deLaAgencia(d, A, [ANA, OLGA, BETO, ANA, SINAG, "x", 7]), [ANA, BETO]);
  assertEquals(await deLaAgencia(d, B, [ANA]), []);
});

Deno.test("estaEnLaSala: identidades de livekit-token y de cowork-session, sin confundir prefijos", () => {
  assert(estaEnLaSala([`${ANA}_ab12cd34`], ANA));
  assert(estaEnLaSala([ANA], ANA));
  assert(estaEnLaSala([`${ANA}__preview`], ANA));
  assert(!estaEnLaSala([`${BETO}_x`, "guest_123", "EG_abc"], ANA));
  assert(!estaEnLaSala([`${ANA.slice(0, 35)}9_x`], ANA));
  assert(!estaEnLaSala([], ANA));
});

Deno.test("HUECO DE HOY: quien para una grabación ajena ya no se agrega como destinatario", () => {
  // Beto para la grabación de Ana y se pone a sí mismo (y a Olga, de otra agencia).
  assertEquals(destinatariosAlParar({ quienPara: BETO, quienGrabo: ANA, pedidos: [BETO, OLGA], deLaAgencia: [BETO] }),
    { destinatarios: [ANA], ignorados: 2 });
  // Ana, que la grabó, elige: entra Beto (de su agencia), no Olga; Ana queda siempre.
  assertEquals(destinatariosAlParar({ quienPara: ANA, quienGrabo: ANA, pedidos: [BETO, OLGA, BETO], deLaAgencia: [BETO] }),
    { destinatarios: [BETO, ANA], ignorados: 1 });
  assertEquals(destinatariosAlParar({ quienPara: ANA, quienGrabo: ANA, pedidos: [], deLaAgencia: [] }),
    { destinatarios: [ANA], ignorados: 0 });
});

// ── La guarda está puesta donde tiene que estar ─────────────────────────────
const fuente = (f: string) => Deno.readTextFileSync(new URL(`../${f}/index.ts`, import.meta.url));
const primera = (s: string, re: RegExp) => s.search(re);
/** Los bloques `if (action === "x"...) {` hasta el siguiente `if (action ===` o el final. */
function bloques(s: string): { nombres: string[]; cuerpo: string }[] {
  const re = /if \(action === "(\w+)"(?: \|\| action === "(\w+)")?\) \{/g;
  const ms = [...s.matchAll(re)];
  return ms.map((m, i) => ({
    nombres: [m[1], m[2]].filter(Boolean),
    cuerpo: s.slice(m.index!, i + 1 < ms.length ? ms[i + 1].index! : s.length),
  }));
}

Deno.test("livekit-token: revisa la sala ANTES de firmar y no da salas de Cowork", () => {
  const s = fuente("livekit-token");
  const guarda = primera(s, /revisarSala\(/);
  assert(guarda > 0, "llama a revisarSala");
  assert(guarda < primera(s, /verifiedAdmin = /), "antes de decidir roomAdmin");
  assert(guarda < s.lastIndexOf("createLiveKitToken("), "antes de firmar el token");
  assert(/if \(!sala\.ok\)/.test(s) && /sala\.familia === "cowork"/.test(s));
});

Deno.test("livekit-moderate: una sola guarda, antes de cualquier acción (también «quién está»)", () => {
  const s = fuente("livekit-moderate");
  const llamadas = [...s.matchAll(/revisarSala\(/g)];
  assertEquals(llamadas.length, 1);
  assert(llamadas[0].index! < primera(s, /action === "/), "antes del primer `action ===`");
  assert(llamadas[0].index! < primera(s, /twirp\(lkUrl/), "antes de hablar con LiveKit");
  assert(/agenciaDePersona\(admin, targetUserId\) !== sala\.agencia/.test(s), "setCohost: el co-anfitrión es de la agencia");
});

Deno.test("meet-room: la agencia se mira antes de toda acción y en cada reunión que se lee", () => {
  const s = fuente("meet-room");
  assert(primera(s, /agenciaDePersona\(admin, userId\)/) < primera(s, /action === "/));
  const sinGuarda: string[] = [];
  for (const b of bloques(s)) {
    if (/from\("meet_rooms"\)\s*\.select/.test(b.cuerpo) && b.nombres[0] !== "create" && !/esDeMiAgencia\(/.test(b.cuerpo)) sinGuarda.push(b.nombres.join("|"));
  }
  assertEquals(sinGuarda, []);
  assert(bloques(s).length >= 8, `se encontraron las acciones (${bloques(s).length})`);
});

Deno.test("meet-guest: el token del invitado es de la sala del pedido y la admisión es de su agencia", () => {
  const s = fuente("meet-guest");
  const claim = bloques(s).find((b) => b.nombres.includes("claim"))!.cuerpo;
  assert(/agenciaDeReunion\(admin, room\)/.test(claim) && /agenciaDePersona\(admin, request\.decided_by\)/.test(claim));
  assert(claim.indexOf("agenciaDeReunion(") < claim.indexOf("createGuestToken("));
  assert(/room\.livekit_room_name/.test(claim.slice(claim.indexOf("createGuestToken("))), "la sala sale de la reunión del pedido");
});

Deno.test("recordings: toda acción de usuario mira la agencia; stop ya no deja elegir destinatarios a cualquiera", () => {
  const s = fuente("recordings");
  assert(primera(s, /agenciaDePersona\(admin, user\.id\)/) < primera(s, /action === "start"/));
  const deUsuario = ["start", "stop", "syncSizes", "download", "view", "recipients", "delete"];
  const sinGuarda: string[] = [];
  for (const b of bloques(s)) {
    if (!b.nombres.some((n) => deUsuario.includes(n))) continue;
    if (!/revisarSala\(|esDeMiAgencia\(|puedeVer\(/.test(b.cuerpo)) sinGuarda.push(b.nombres.join("|"));
  }
  assertEquals(sinGuarda, []);
  const stop = bloques(s).find((b) => b.nombres.includes("stop"))!.cuerpo;
  assert(/destinatariosAlParar\(/.test(stop) && !/\.\.\.\(recipients \?\? \[\]\)/.test(stop));
  assert(!/from\("user_roles"\)[\s\S]{0,120}puedeVer|async function puedeVer[\s\S]{0,400}user_roles/.test(s), "puedeVer ya no mira 'admin' sin agencia");
  const start = bloques(s).find((b) => b.nombres.includes("start"))!.cuerpo;
  assert(start.indexOf("estaEnLaSala(") < start.indexOf('.from("meeting_recordings")'), "start: estar en la sala antes de crear la fila");
});
