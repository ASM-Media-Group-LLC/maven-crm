// Una llave de API ACTÚA COMO un usuario real.
//
// POR QUÉ. Decisión del 24/09/2026: cada llave queda atada a una persona y consulta
// la base COMO ella. Así la RLS y los triggers se aplican exactamente como si esa
// persona usara la app: ve sus conversaciones y nada más, escribe solo a su nombre,
// edita y borra solo lo suyo. Las paredes las pone la BASE, no este código.
//
// La alternativa —consultar con service_role y filtrar a mano— es la que hace
// public-api con los recursos viejos, y para el Messenger es inaceptable: dos de sus
// guardias (trg_guard_chat_message_update, trg_guard_chat_participant_update) se
// APARTAN cuando no hay usuario. Con service_role, una llave podría mandar a nombre
// de cualquiera, editar mensajes ajenos y hacerse admin de grupos.
//
// CÓMO. Se fabrica un JWT de sesión para ese usuario — {sub, role: "authenticated"}
// con 60 segundos de vida — y se consulta con él. Es el camino documentado por
// Supabase para esto ("JWT Signing Keys": `sub` es "a user you want to impersonate").
// Hoy Maven firma las sesiones con el esquema clásico HS256 (su JWKS público está
// vacío), así que se firma con ese secreto.
//
// ⚠️ EL SECRETO ES UNA LLAVE MAESTRA: quien lo tenga fabrica la sesión de cualquier
// usuario. Es el mismo alcance que ya tiene SUPABASE_SERVICE_ROLE_KEY en casi todas
// las funciones, pero igual: vive SOLO en los secretos de las edge functions
// (MAVEN_JWT_SECRET), nunca se loguea, y los tokens duran 60 s y no se guardan.
//
// ⚠️ SI MAVEN MIGRA A "JWT SIGNING KEYS", el secreto legacy deja de valer. Esta es
// la ÚNICA función que firma: el cambio es importar una clave ES256 propia (`supabase
// gen signing-key --algorithm ES256`) y firmar acá con ella.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SEGUNDOS_DE_VIDA = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const texto = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));

/** Fabrica el JWT de sesión de `userId`, firmado HS256 con `secreto`. Pura: el
 *  reloj entra por parámetro para poder testearla. */
export async function fabricarToken(
  userId: string,
  secreto: string,
  ahoraSeg: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!secreto) throw new Error("falta el secreto de firma");
  // Defensa: el `sub` tiene que ser un id de usuario. Un sub raro produce una
  // sesión que auth.uid() no reconoce como nadie, y eso es peor que fallar acá.
  if (!UUID.test(userId)) throw new Error("el usuario no es un id válido");

  const header = texto({ alg: "HS256", typ: "JWT" });
  const payload = texto({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: ahoraSeg,
    exp: ahoraSeg + SEGUNDOS_DE_VIDA,
  });
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(firma))}`;
}

/** ¿Está cargado el secreto? Sin él, los recursos que actúan como usuario no se
 *  pueden servir, y el resto del API sigue igual. */
export function comoUsuarioConfigurado(): boolean {
  return !!Deno.env.get("MAVEN_JWT_SECRET");
}

/** Cliente de Supabase que consulta COMO `userId`: con la RLS y los triggers de la
 *  app. `null` si falta el secreto — el llamador responde 503, nunca cae a service_role.
 *
 *  `fetch` es opcional: el despachador de webhooks (messenger-webhooks) le pasa uno
 *  con plazo por pedido, para que una base lenta no le estire la corrida. */
export async function clienteComoUsuario(
  userId: string,
  opciones: { fetch?: typeof fetch } = {},
): Promise<SupabaseClient | null> {
  const secreto = Deno.env.get("MAVEN_JWT_SECRET");
  if (!secreto) return null;
  const token = await fabricarToken(userId, secreto);
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` }, ...(opciones.fetch ? { fetch: opciones.fetch } : {}) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
