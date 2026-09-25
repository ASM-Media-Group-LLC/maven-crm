// Tests de lo que actúa como usuario, con un cliente falso. Lo que importa: NUNCA
// se responde con datos si la base no reconoce la sesión como alguien de la agencia
// de la llave, y eso se verifica antes de cualquier handler.

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Contexto,
  type Handler,
  crearServidorComoUsuario,
  RECURSOS_COMO_USUARIO,
  SCOPE_REQUERIDO,
  servirComoUsuario,
  servirMe,
} from "./recursos-como-usuario.ts";

const AGENCIA = "30869615-f579-4981-8a1f-dbebc61eae2d";
const OTRA_AGENCIA = "0e8f6c1a-2b3d-4e5f-8a9b-1c2d3e4f5a6b";
const PERSONA = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";

const CTX: Contexto = {
  agenciaDeLaLlave: AGENCIA,
  actuaComo: PERSONA,
  scopes: [],
  ruta: [],
  consulta: {},
  llave: { conWhitelist: false, venceEl: null },
  baseDeArchivos: "https://proyecto.supabase.co",
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-09-24T23:00:00+00:00" },
  idioma: "es",
};

type Resp = { data: unknown; error: { message: string } | null };

/** Cliente falso: lo que "la base" responde a current_tenant_id() y al perfil.
 *  Cuenta las lecturas de perfil para probar que no se tocan datos si la sesión no
 *  es la que tiene que ser. */
function clienteFalso(agencia: Resp, perfil: Resp) {
  const lecturas = { perfil: 0 };
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: () => { lecturas.perfil++; return Promise.resolve(perfil); },
  };
  const cliente = {
    rpc: (nombre: string) => {
      assertEquals(nombre, "current_tenant_id");
      return Promise.resolve(agencia);
    },
    from: (tabla: string) => {
      assertEquals(tabla, "profiles");
      return consulta;
    },
  } as unknown as SupabaseClient;
  return { cliente, lecturas };
}

const ok = (data: unknown): Resp => ({ data, error: null });
const PERFIL = ok({ id: PERSONA, full_name: "Persona de prueba", avatar_url: null });

Deno.test("/me: la sesión es de la agencia de la llave → responde quién es", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await servirComoUsuario("me", cliente, CTX);
  assert(r.ok);
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.agency_id, AGENCIA);
  assertEquals(c.acts_as, { id: PERSONA, name: "Persona de prueba", avatar_url: null });
  assertEquals(c.rate_limit.remaining, 999);
});

Deno.test("si la base ve OTRA agencia o a nadie, 503 para TODO handler y sin leer datos", async () => {
  // Otra agencia: la persona se mudó, o está en dos y la base elige la otra. Nadie
  // (null): auth.uid() no reconoció el `sub`. En los dos casos ningún handler corre.
  // Con TODOS los scopes y una llave en regla: lo único que falla es la agencia.
  const conTodo: Contexto = {
    ...CTX,
    scopes: Object.values(SCOPE_REQUERIDO).filter((s): s is string => !!s),
    llave: { conWhitelist: true, venceEl: "2026-12-01T00:00:00Z" },
  };
  for (const recurso of Object.keys(RECURSOS_COMO_USUARIO)) {
    for (const agencia of [OTRA_AGENCIA, null]) {
      const { cliente, lecturas } = clienteFalso(ok(agencia), PERFIL);
      const r = await servirComoUsuario(recurso, cliente, conTodo);
      assert(!r.ok && r.estado === 503, `${recurso} con agencia=${agencia} respondió`);
      assertEquals(lecturas.perfil, 0, `${recurso} leyó datos con una sesión ajena`);
    }
  }
});

Deno.test("si la base rechaza la sesión (secreto equivocado), 503", async () => {
  const rechazo: Resp = { data: null, error: { message: "JWSError JWSInvalidSignature" } };
  for (const [agencia, perfil] of [[rechazo, PERFIL], [ok(AGENCIA), rechazo]] as const) {
    const { cliente } = clienteFalso(agencia, perfil);
    const r = await servirComoUsuario("me", cliente, CTX);
    assert(!r.ok && r.estado === 503);
  }
});

Deno.test("un recurso sin handler, o heredado de Object.prototype, da 503 sin tocar la base", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  for (const r of ["no_existe", "constructor", "toString", "__proto__"]) {
    const v = await servirComoUsuario(r, explota, CTX);
    assert(!v.ok && v.estado === 503, `"${r}" pasó`);
  }
});

Deno.test("/me: si la persona no ve su propio perfil, 503", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), ok(null));
  const r = await servirComoUsuario("me", cliente, CTX);
  assert(!r.ok && r.estado === 503);
});

Deno.test("/me/loquesea: 404 sin tocar datos", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  const r = await servirMe(explota, { ...CTX, ruta: ["loquesea"] });
  assert(!r.ok && r.estado === 404);
});

// ─── El scope, antes de tocar la base ───────────────────────────────────────

const PRIVADO: Handler = () => Promise.resolve({ ok: true, cuerpo: { secreto: true } });
const conPrivado = crearServidorComoUsuario({ privado: PRIVADO }, { privado: "privado:read" });

Deno.test("sin el scope del recurso: 403 y NI UNA consulta a la base", async () => {
  // Con la llave de hoy (actúa como el CEO) y sin esto, cualquier recurso nuevo le
  // quedaba abierto a las 3 llaves aunque no tuvieran su permiso.
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  for (const scopes of [[], ["creators:read"], ["privado:reads"], ["PRIVADO:READ"]]) {
    const r = await conPrivado("privado", explota, { ...CTX, scopes });
    assert(!r.ok && r.estado === 403, `con scopes=${JSON.stringify(scopes)} pasó`);
  }
});

Deno.test("con el scope: sigue y verifica la agencia antes del handler", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await conPrivado("privado", cliente, { ...CTX, scopes: ["privado:read"] });
  assert(r.ok);
  const otra = clienteFalso(ok(OTRA_AGENCIA), PERFIL).cliente;
  const r2 = await conPrivado("privado", otra, { ...CTX, scopes: ["privado:read"] });
  assert(!r2.ok && r2.estado === 503, "con el scope pero otra agencia, pasó");
});

Deno.test("un recurso con handler pero sin scope declarado: 503, no se sirve", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  const r = await crearServidorComoUsuario({ privado: PRIVADO }, {})("privado", explota, { ...CTX, scopes: ["privado:read"] });
  assert(!r.ok && r.estado === 503);
});

Deno.test("/me no pide scope (cualquier llave puede preguntar quién es)", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await servirComoUsuario("me", cliente, { ...CTX, scopes: [] });
  assert(r.ok);
});

Deno.test("la entrada de producción no acepta mapas inyectados (3 argumentos)", () => {
  assertEquals(servirComoUsuario.length, 3);
});
