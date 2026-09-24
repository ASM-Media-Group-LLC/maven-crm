// Recursos del API pública que se sirven COMO la persona de la llave.
//
// ⚠️ LA REGLA DE ESTE ARCHIVO: acá no existe service_role. Cada handler recibe
// SOLO el cliente con la sesión de esa persona (./como-usuario.ts) y todo lo que
// consulta pasa por la RLS y los triggers de la base, igual que en la app. Si un
// dato no se puede leer así, no se sirve desde acá. El test lo verifica leyendo
// este archivo: no puede aparecer `admin`, `service_role` ni `createClient`.
//
// Cada recurso de acá está declarado `como_usuario` en ./aislamiento.ts, y el test
// exige que las dos listas coincidan.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Contexto = {
  /** De qué agencia es la llave (api_keys.tenant_id). */
  agenciaDeLaLlave: string;
  /** Como quién actúa (api_keys.acts_as_user_id). */
  actuaComo: string;
  /** Lo que queda del cupo de esta hora, para devolverlo en el cuerpo. */
  cupo: { limite: number; restantes: number; reinicio: string };
};

export type Resultado =
  | { ok: true; cuerpo: unknown }
  | { ok: false; estado: 404; error: string; mensaje: string }
  /** Un fallo NUESTRO: se loguea `detalle` y el cliente ve un 503 genérico. */
  | { ok: false; estado: 503; detalle: string };

export type Handler = (yo: SupabaseClient, ctx: Contexto, sub: string | null) => Promise<Resultado>;

/** GET /me — quién es esta llave. Además de responder, PRUEBA que la sesión
 *  fabricada es de verdad la de esa persona: current_tenant_id() lee auth.uid(), así
 *  que si la base no reconociera la sesión (secreto equivocado, `sub` que no es
 *  nadie) la agencia no coincidiría y se responde 503, nunca datos. */
export const servirMe: Handler = async (yo, ctx, sub) => {
  if (sub) return { ok: false, estado: 404, error: "not_found", mensaje: `Sub-recurso de me desconocido: ${sub}` };

  const [agencia, perfil] = await Promise.all([
    yo.rpc("current_tenant_id"),
    yo.from("profiles").select("id, full_name, avatar_url").eq("id", ctx.actuaComo).maybeSingle(),
  ]);
  if (agencia.error) return { ok: false, estado: 503, detalle: `current_tenant_id: ${agencia.error.message}` };
  if (perfil.error) return { ok: false, estado: 503, detalle: `perfil: ${perfil.error.message}` };
  if (agencia.data !== ctx.agenciaDeLaLlave) {
    return {
      ok: false,
      estado: 503,
      detalle: `la sesión fabricada no es de la agencia de la llave (base: ${agencia.data ?? "nadie"})`,
    };
  }
  const p = perfil.data as { id: string; full_name: string | null; avatar_url: string | null } | null;
  if (!p) return { ok: false, estado: 503, detalle: "la sesión fabricada no ve el perfil de su propia persona" };

  return {
    ok: true,
    cuerpo: {
      object: "me",
      agency_id: ctx.agenciaDeLaLlave,
      // Todo lo que esta llave haga con permisos de usuario lo hace a nombre de esta
      // persona, con lo que esta persona puede ver y hacer en Maven. No cambia nunca.
      acts_as: { id: p.id, name: p.full_name ?? null, avatar_url: p.avatar_url ?? null },
      rate_limit: {
        limit_per_hour: ctx.cupo.limite,
        remaining: ctx.cupo.restantes,
        resets_at: ctx.cupo.reinicio,
      },
    },
  };
};

export const RECURSOS_COMO_USUARIO: Record<string, Handler> = {
  me: servirMe,
};
