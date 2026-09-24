// Tests de /me con un cliente falso: lo que importa es que NUNCA responda datos si
// la base no reconoce la sesión como la de la persona de la llave.

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type Contexto, servirMe } from "./recursos-como-usuario.ts";

const AGENCIA = "30869615-f579-4981-8a1f-dbebc61eae2d";
const OTRA_AGENCIA = "0e8f6c1a-2b3d-4e5f-8a9b-1c2d3e4f5a6b";
const PERSONA = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";

const CTX: Contexto = {
  agenciaDeLaLlave: AGENCIA,
  actuaComo: PERSONA,
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-09-24T23:00:00+00:00" },
};

type Resp = { data: unknown; error: { message: string } | null };

/** Cliente falso: lo que "la base" responde a current_tenant_id() y al perfil. */
function clienteFalso(agencia: Resp, perfil: Resp): SupabaseClient {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: () => Promise.resolve(perfil),
  };
  return {
    rpc: (nombre: string) => {
      assertEquals(nombre, "current_tenant_id");
      return Promise.resolve(agencia);
    },
    from: (tabla: string) => {
      assertEquals(tabla, "profiles");
      return consulta;
    },
  } as unknown as SupabaseClient;
}

const ok = (data: unknown): Resp => ({ data, error: null });
const PERFIL = ok({ id: PERSONA, full_name: "Persona de prueba", avatar_url: null });

Deno.test("/me: la sesión es de la agencia de la llave → responde quién es", async () => {
  const r = await servirMe(clienteFalso(ok(AGENCIA), PERFIL), CTX, null);
  assert(r.ok);
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.agency_id, AGENCIA);
  assertEquals(c.acts_as, { id: PERSONA, name: "Persona de prueba", avatar_url: null });
  assertEquals(c.rate_limit.remaining, 999);
});

Deno.test("/me: si la base ve OTRA agencia o a nadie, 503 y ningún dato", async () => {
  // Otra agencia: la sesión no es la que creemos. Nadie (null): auth.uid() no
  // reconoció el `sub`. En los dos casos, lo que haya en `perfil` no se entrega.
  for (const agencia of [OTRA_AGENCIA, null]) {
    const r = await servirMe(clienteFalso(ok(agencia), PERFIL), CTX, null);
    assert(!r.ok && r.estado === 503, `con agencia=${agencia} respondió`);
    assert(!("cuerpo" in r));
  }
});

Deno.test("/me: si la base rechaza la sesión (secreto equivocado), 503", async () => {
  const rechazo: Resp = { data: null, error: { message: "JWSError JWSInvalidSignature" } };
  for (const [agencia, perfil] of [[rechazo, PERFIL], [ok(AGENCIA), rechazo]] as const) {
    const r = await servirMe(clienteFalso(agencia, perfil), CTX, null);
    assert(!r.ok && r.estado === 503);
  }
});

Deno.test("/me: si la persona no ve su propio perfil, 503", async () => {
  const r = await servirMe(clienteFalso(ok(AGENCIA), ok(null)), CTX, null);
  assert(!r.ok && r.estado === 503);
});

Deno.test("/me/loquesea: 404 sin tocar la base", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  const r = await servirMe(explota, CTX, "loquesea");
  assert(!r.ok && r.estado === 404);
});
