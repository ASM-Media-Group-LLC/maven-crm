// Recursos del API pública que se sirven COMO la persona de la llave.
//
// ⚠️ LA REGLA DE ESTE ARCHIVO: acá no existe service_role. Cada handler recibe
// SOLO el cliente con la sesión de esa persona (./como-usuario.ts) y todo lo que
// consulta pasa por la RLS y los triggers de la base, igual que en la app. Si un
// dato no se puede leer así, no se sirve desde acá. El test lo verifica leyendo
// este archivo: solo puede importar TIPOS, cada handler tiene que estar definido
// acá mismo, y no puede aparecer nada con "admin", service_role ni createClient.
//
// Cada recurso de acá está declarado `como_usuario` en ./aislamiento.ts, y el test
// exige que las dos listas coincidan.
//
// Todo entra por `servirComoUsuario`, que ANTES de cualquier handler verifica, en
// este orden: (1) que la llave tenga el scope del recurso, sin tocar la base; (2)
// que la base vea la sesión como alguien de la agencia de la llave. Un handler nuevo
// no puede olvidarse de ninguna de las dos porque no le tocan a él.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Contexto = {
  /** De qué agencia es la llave (api_keys.tenant_id). */
  agenciaDeLaLlave: string;
  /** Como quién actúa (api_keys.acts_as_user_id). */
  actuaComo: string;
  /** Los scopes de la llave. */
  scopes: string[];
  /** El camino después del recurso: /messenger/conversations/X → ["conversations", "X"]. */
  ruta: string[];
  /** Los parámetros de la URL, como texto. Cada handler valida los suyos. */
  consulta: Record<string, string>;
  /** Lo que se sabe de la llave misma. */
  llave: { conWhitelist: boolean; venceEl: string | null };
  /** Lo que queda del cupo de esta hora, para devolverlo en el cuerpo. */
  cupo: { limite: number; restantes: number; reinicio: string };
};

export type Resultado =
  | { ok: true; cuerpo: unknown }
  /** Culpa del que llama (400), sin permiso (403) o no existe / no la ve (404). */
  | { ok: false; estado: 400 | 403 | 404; error: string; mensaje: string }
  /** Un fallo NUESTRO: se loguea `detalle` y el cliente ve un 503 genérico. */
  | { ok: false; estado: 503; detalle: string };

export type Handler = (yo: SupabaseClient, ctx: Contexto) => Promise<Resultado>;

/** GET /me — quién es esta llave. Sirve para probar en vivo que la sesión fabricada
 *  funciona: `servirComoUsuario` ya verificó que la base la ve como alguien de la
 *  agencia de la llave. */
export const servirMe: Handler = async (yo, ctx) => {
  const sub = ctx.ruta[0] ?? null;
  if (sub) return { ok: false, estado: 404, error: "not_found", mensaje: `Sub-recurso de me desconocido: ${sub}` };

  const perfil = await yo.from("profiles").select("id, full_name, avatar_url").eq("id", ctx.actuaComo).maybeSingle();
  if (perfil.error) return { ok: false, estado: 503, detalle: `perfil: ${perfil.error.message}` };
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

/** El scope que hace falta para cada recurso (null = ninguno). El test exige que
 *  las claves sean exactamente las de RECURSOS_COMO_USUARIO: un recurso nuevo sin
 *  su scope no llega a desplegarse. */
export const SCOPE_REQUERIDO: Record<string, string | null> = {
  me: null,
};

/** Arma la entrada: verifica la sesión y recién ahí despacha.
 *
 *  Es una FÁBRICA para que los tests prueben recursos que no existen (un "privado"
 *  con scope) sin que la entrada de producción acepte mapas inyectados: el router
 *  usa `servirComoUsuario`, ya armada con los mapas de este archivo y de 3
 *  argumentos, y el test prohíbe que index.ts nombre la fábrica o los mapas.
 *
 *  current_tenant_id() lee auth.uid(): si la base no reconociera la sesión (secreto
 *  equivocado, `sub` que no es nadie) o viera a la persona en OTRA agencia (se mudó;
 *  o está en dos y la base elige la otra), no coincide con la agencia de la llave y
 *  se responde 503 sin tocar ningún dato. Una lectura, antes de cualquier handler. */
export function crearServidorComoUsuario(
  handlers: Record<string, Handler>,
  scopeRequerido: Record<string, string | null>,
) {
  return async (recurso: string, yo: SupabaseClient, ctx: Contexto): Promise<Resultado> => {
    if (!Object.hasOwn(handlers, recurso) || !Object.hasOwn(scopeRequerido, recurso)) {
      return { ok: false, estado: 503, detalle: `sin handler o sin scope declarado: ${recurso}` };
    }
    // (1) El scope, ANTES de tocar la base: sin él no se gasta ni una consulta.
    const scope = scopeRequerido[recurso];
    if (scope !== null && !ctx.scopes.includes(scope)) {
      return { ok: false, estado: 403, error: "forbidden", mensaje: `Falta el scope ${scope}` };
    }
    // (2) Que la base vea la sesión como alguien de la agencia de la llave.
    const agencia = await yo.rpc("current_tenant_id");
    if (agencia.error) return { ok: false, estado: 503, detalle: `current_tenant_id: ${agencia.error.message}` };
    if (agencia.data !== ctx.agenciaDeLaLlave) {
      return {
        ok: false,
        estado: 503,
        detalle: `la sesión fabricada no es de la agencia de la llave (base: ${agencia.data ?? "nadie"})`,
      };
    }
    return handlers[recurso](yo, ctx);
  };
}

/** La única entrada desde el router. */
export const servirComoUsuario = crearServidorComoUsuario(RECURSOS_COMO_USUARIO, SCOPE_REQUERIDO);
