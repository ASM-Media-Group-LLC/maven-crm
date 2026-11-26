// LA FUNCIÓN «PLATAFORMA» DEL EDIFICIO (maven-agencias, ezeigddgkaemxpshghmu).
// ⚠️ SOLO EDIFICIO: está en infra/casas/funciones-solo-edificio.txt; Kash no la publica.
//
// Lo que la base no puede hacer sola: crear la cuenta del Dueño de un cliente, mandarle
// la invitación por correo y dejarle poner su contraseña. Todo lo demás (la ficha,
// pausar, reactivar, extender la prueba) la pantalla lo llama directo a la base, donde
// viven los candados (infra/edificio/migraciones/20261125120500_nuevo_cliente.sql).
//
// Acciones (POST {accion, …}):
//   crear_cliente        Maven  → crear_cliente (con la sesión de quien llama: los candados
//                                 de la base deciden) + la cuenta del Dueño. Sin correo:
//                                 el cliente nace «En preparación».
//   poner_dueno          Maven  → la cuenta del Dueño (si falló al crear, o para cambiarlo
//                                 antes de activar).
//   activar_e_invitar    Maven  → activar_organizacion (con la sesión de quien llama) y
//                                 la invitación al Dueño.
//   reenviar_invitacion  Maven  → un enlace nuevo (el anterior deja de servir).
//   canjear_enlace       nadie  → «Crear mi contraseña»: usa el enlace (una vez, 7 días)
//                                 y pone la contraseña. Con tope por IP.
//
// La invitación devuelve también el enlace: si el correo no sale (falta la llave de
// Resend, o el proveedor falla), Maven lo copia y se lo manda al Dueño por WhatsApp.
// Solo lo ve quien es de Maven (Alvaro o Grace), que de todas formas crea esa cuenta.
//
// verify_jwt = false (config.toml): «canjear_enlace» lo llama alguien que todavía no
// tiene sesión. Las demás revisan la sesión adentro.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsFor } from "../_shared/cors.ts";
import {
  claveDeError, contrasenaValida, correoDeInvitacion, correoValido, enlaceDeInvitacion, idiomaDe, type Idioma, nombreValido,
  TOPE_CANJE_POR_IP, tokenValido, uuidValido, VENTANA_CANJE_MIN,
} from "./logica.ts";

const cors = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" });

// Siempre 200 con {ok}: así supabase-js entrega el cuerpo y la pantalla traduce la clave.
const responder = (req: Request, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status: 200, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bien = (req: Request, data: unknown) => responder(req, { ok: true, data });
const mal = (req: Request, error: string, detalle?: string) => responder(req, { ok: false, error, ...(detalle ? { detalle } : {}) });

const appUrl = () => (Deno.env.get("APP_URL") || "https://app.maven-ai.me").replace(/\/+$/, "");

function servicio(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** El cliente con la sesión de quien llama: la base decide qué puede (sus candados). */
function comoQuienLlama(jwt: string): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

class Fallo extends Error {
  constructor(public clave: string, detalle?: string) {
    super(detalle ? `${clave}: ${detalle}` : clave);
  }
}

async function huella(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Quién llama, si es de Maven (dueño o admin de la plataforma). */
async function deMaven(db: SupabaseClient, jwt: string): Promise<{ id: string; nivel: "dueno" | "admin" } | null> {
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: p } = await db.from("plataforma_admins").select("nivel").eq("user_id", data.user.id).maybeSingle();
  const nivel = (p as { nivel?: "dueno" | "admin" } | null)?.nivel;
  return nivel ? { id: data.user.id, nivel } : null;
}

/** La cuenta de un correo en el edificio, si ya existe (la base es chica: se busca por páginas). */
async function cuentaPorCorreo(db: SupabaseClient, correo: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Fallo("no_disponible", `cuentas: ${error.message}`);
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === correo);
    if (u) return u.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** La cuenta del Dueño (sin contraseña: la pone él con el enlace) y su lugar en el cliente. */
async function ponerDueno(db: SupabaseClient, org: string, nombre: string, correo: string, idioma: Idioma): Promise<{ user_id: string; correo: string }> {
  const { data: o, error: eo } = await db.from("organizaciones").select("id, estado").eq("id", org).maybeSingle();
  if (eo) throw new Fallo("no_disponible", eo.message);
  if (!o) throw new Fallo("cliente_no_existe");
  if ((o as { estado: string }).estado !== "preparacion") throw new Fallo("estado_invalido", "el Dueño se cambia antes de activar");

  let userId = await cuentaPorCorreo(db, correo);
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email: correo,
      email_confirm: true,
      user_metadata: { full_name: nombre, idioma },
    });
    if (error || !data?.user) throw new Fallo("no_disponible", `crear la cuenta: ${error?.message ?? "sin cuenta"}`);
    userId = data.user.id;
  }

  // Un solo Dueño por cliente: si había otro (antes de activar), deja de serlo.
  const { data: antes } = await db.from("organizacion_admins").select("user_id").eq("organizacion_id", org).eq("principal", true);
  for (const a of (antes ?? []) as { user_id: string }[]) {
    if (a.user_id !== userId) {
      const { error } = await db.rpc("quitar_admin_organizacion", { _org: org, _user: a.user_id });
      if (error) throw new Fallo(claveDeError(error.message), error.message);
    }
  }
  const { error: ea } = await db.rpc("agregar_admin_organizacion", { _org: org, _user: userId, _principal: true });
  if (ea) throw new Fallo(claveDeError(ea.message), ea.message);

  // Su empresa en foco: current_tenant_id() le devuelve el único espacio de su cliente.
  const { data: t } = await db.from("tenants").select("id").eq("organizacion_id", org).is("archivada_at", null).limit(1).maybeSingle();
  if (t) {
    const { data: foco } = await db.from("agencia_en_foco").select("tenant_id").eq("user_id", userId).maybeSingle();
    if (!foco) await db.from("agencia_en_foco").insert({ user_id: userId, tenant_id: (t as { id: string }).id });
  }
  return { user_id: userId, correo };
}

/** Manda el correo por Resend. false si no hay llave o el proveedor falla (no rompe). */
async function mandarCorreo(para: string, c: { asunto: string; html: string; texto: string }): Promise<boolean> {
  const llave = Deno.env.get("RESEND_API_KEY");
  if (!llave) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("CORREO_REMITENTE") || "Maven <noreply@envios.maven-ai.me>",
        to: [para], subject: c.asunto, html: c.html, text: c.texto,
      }),
    });
    if (!r.ok) console.error("[plataforma] resend:", r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error("[plataforma] resend:", String(e));
    return false;
  }
}

/** Enlace nuevo («Crear mi contraseña», 7 días, una vez) + correo al Dueño. */
async function invitarDueno(db: SupabaseClient, org: string, quien: string) {
  const { data: o, error: eo } = await db.from("organizaciones").select("id, nombre, idioma, estado").eq("id", org).maybeSingle();
  if (eo) throw new Fallo("no_disponible", eo.message);
  if (!o) throw new Fallo("cliente_no_existe");
  const { data: a } = await db.from("organizacion_admins").select("user_id").eq("organizacion_id", org).eq("principal", true).maybeSingle();
  const userId = (a as { user_id?: string } | null)?.user_id;
  if (!userId) throw new Fallo("faltan_pendientes", "dueno");
  const { data: u, error: eu } = await db.auth.admin.getUserById(userId);
  if (eu || !u?.user?.email) throw new Fallo("no_disponible", "la cuenta del Dueño");
  const { data: token, error: et } = await db.rpc("crear_enlace_de_acceso", {
    _user: userId, _proposito: "invitacion", _tenant: null, _org: org, _creado_por: quien,
  });
  if (et || typeof token !== "string") throw new Fallo(claveDeError(et?.message), et?.message);
  const enlace = enlaceDeInvitacion(appUrl(), token);
  const org_ = o as { nombre: string; idioma: string | null };
  const nombre = String((u.user.user_metadata as { full_name?: string } | null)?.full_name || u.user.email);
  const enviado = await mandarCorreo(u.user.email, correoDeInvitacion({ idioma: idiomaDe(org_.idioma), nombre, empresa: org_.nombre, enlace }));
  return { invitado: u.user.email, enlace, correo_enviado: enviado };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    if (req.method !== "POST") return mal(req, "metodo");
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = typeof b.accion === "string" ? b.accion : "";
    const db = servicio();

    try {
      // ── Sin sesión: «Crear mi contraseña» ─────────────────────────────────
      if (accion === "canjear_enlace") {
        const token = tokenValido(b.token);
        const clave = contrasenaValida(b.contrasena);
        if (!token) return mal(req, "enlace_no_existe");
        if (!clave) return mal(req, "contrasena_corta");
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
        const { data: puede, error: errTope } = await db.rpc("puerta_contar", {
          _clave: `canje:${await huella(ip)}`, _tope: TOPE_CANJE_POR_IP, _minutos: VENTANA_CANJE_MIN,
        });
        if (errTope) return mal(req, "no_disponible");
        if (puede !== true) return mal(req, "demasiados_intentos");
        const { data: userId, error } = await db.rpc("usar_enlace_de_acceso", { _token: token, _proposito: null });
        if (error || typeof userId !== "string") return mal(req, claveDeError(error?.message));
        const { data: u, error: eu } = await db.auth.admin.updateUserById(userId, { password: clave, email_confirm: true });
        if (eu || !u?.user) return mal(req, "no_disponible", eu?.message);
        return bien(req, { correo: u.user.email });
      }

      // ── Lo demás: solo Maven (Alvaro o Grace) ─────────────────────────────
      const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      const yo = await deMaven(db, jwt);
      if (!yo) return mal(req, "sin_permiso");

      if (accion === "crear_cliente") {
        const nombre = nombreValido(b.nombre);
        const duenoNombre = nombreValido(b.dueno_nombre);
        const correo = correoValido(b.dueno_correo);
        const idioma = idiomaDe(b.idioma);
        if (!nombre) return mal(req, "nombre_invalido");
        if (!duenoNombre) return mal(req, "nombre_invalido", "dueno");
        if (!correo) return mal(req, "correo_invalido");
        const { data: org, error } = await comoQuienLlama(jwt).rpc("crear_cliente", { _nombre: nombre, _idioma: idioma, _es_demo: b.es_demo === true });
        if (error || typeof org !== "string") return mal(req, claveDeError(error?.message), error?.message);
        // Si la cuenta del Dueño falla, el cliente queda creado y «Pendientes» ofrece ponerlo otra vez.
        try {
          const d = await ponerDueno(db, org, duenoNombre, correo, idioma);
          return bien(req, { organizacion_id: org, dueno: d });
        } catch (e) {
          const f = e instanceof Fallo ? e : new Fallo("no_disponible", String(e));
          console.error("[plataforma] poner_dueno al crear:", f.message);
          return bien(req, { organizacion_id: org, dueno: null, error_dueno: f.clave });
        }
      }

      if (accion === "poner_dueno") {
        const org = uuidValido(b.organizacion_id);
        const duenoNombre = nombreValido(b.dueno_nombre);
        const correo = correoValido(b.dueno_correo);
        if (!org) return mal(req, "cliente_no_existe");
        if (!duenoNombre) return mal(req, "nombre_invalido", "dueno");
        if (!correo) return mal(req, "correo_invalido");
        // ¿Lo puede ver quien llama? (la base decide).
        const { error } = await comoQuienLlama(jwt).rpc("ficha_faltantes", { _org: org });
        if (error) return mal(req, claveDeError(error.message), error.message);
        const { data: o } = await db.from("organizaciones").select("idioma").eq("id", org).maybeSingle();
        return bien(req, await ponerDueno(db, org, duenoNombre, correo, idiomaDe((o as { idioma?: string } | null)?.idioma)));
      }

      if (accion === "activar_e_invitar") {
        const org = uuidValido(b.organizacion_id);
        if (!org) return mal(req, "cliente_no_existe");
        // Los candados (ficha contestada, setup pagado o regalado, contrato) son de la base.
        const { error } = await comoQuienLlama(jwt).rpc("activar_organizacion", { _org: org });
        if (error) return mal(req, claveDeError(error.message), error.message);
        try {
          return bien(req, await invitarDueno(db, org, yo.id));
        } catch (e) {
          // Activado pero sin invitación: «Reenviar invitación» lo arregla.
          const f = e instanceof Fallo ? e : new Fallo("no_disponible", String(e));
          console.error("[plataforma] invitar al activar:", f.message);
          return bien(req, { invitado: null, enlace: null, correo_enviado: false, error_invitacion: f.clave });
        }
      }

      if (accion === "reenviar_invitacion") {
        const org = uuidValido(b.organizacion_id);
        if (!org) return mal(req, "cliente_no_existe");
        const { error } = await comoQuienLlama(jwt).rpc("ficha_faltantes", { _org: org });
        if (error) return mal(req, claveDeError(error.message), error.message);
        return bien(req, await invitarDueno(db, org, yo.id));
      }

      return mal(req, "accion_desconocida");
    } catch (e) {
      const f = e instanceof Fallo ? e : new Fallo("no_disponible", String(e));
      console.error(`[plataforma] ${accion}:`, f.message);
      return mal(req, f.clave);
    }
  });
}
