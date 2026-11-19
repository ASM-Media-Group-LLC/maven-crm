// COBROS DE MAVEN CON STRIPE — solo en el EDIFICIO (maven-agencias, ezeigddgkaemxpshghmu).
// Kash no cobra por aquí y esta función NO se publica en Kash (infra/casas/funciones-solo-edificio.txt).
// Decisión de Alvaro (19/11/2026, tanda 8): cuenta de Stripe de Lumina, cobros a nombre de Maven.
//
// Acciones (POST {accion, …}):
//   registro            público (con tope por IP): crea la cuenta, el cliente (activa, una
//                       agencia), su admin y el Checkout de Stripe (14 días gratis, tarjeta
//                       obligatoria, setup USD 3.000 como pago único) → {url}.
//   checkout-registro   admin del cliente: vuelve a abrir el Checkout si no terminó de poner la tarjeta.
//   portal              admin del cliente (o el dueño): portal de Stripe (tarjeta y facturas) → {url}.
//   checkout-recarga    admin del cliente (o el dueño): recarga de Argos (paga 25 → 50 de crédito) → {url}.
//   suscribir-cliente   dueño o Grace: alta con opciones especiales (días gratis, sin tarjeta,
//                       sin setup; precio a la medida SOLO el dueño).
//   preparar-productos  solo el dueño: crea (si faltan) «Maven Equipo/Empresa/Setup/Argos recarga».
//   webhook             Stripe (con la cabecera Stripe-Signature): verifica la firma, cada evento
//                       una vez (stripe_eventos), y aplica: plan al día / pago fallido → 7 días
//                       de gracia → bloqueada / recarga → argos_acreditar / factura pagada →
//                       crédito del plan del mes (argos_acreditar_plan_de).
//
// Secretos (los pone Alvaro en el edificio; esta función no los lee de ningún otro lado):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Usa además APP_URL, RESEND_API_KEY y
//   NOTIFICATION_FROM_EMAIL (ya están en el edificio).
// verify_jwt = false (config.toml): Stripe no manda JWT; las demás acciones revisan la sesión aquí.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsFor } from "../_shared/cors.ts";
import {
  type Aviso,
  type Cobro,
  cuentaDeRecarga,
  decidir,
  type EstadoOrg,
  esPlan,
  leerEvento,
  montoDeProducto,
  type NombrePlan,
  opcionesEspeciales,
  paramsCheckoutRecarga,
  paramsCheckoutSuscripcion,
  paramsSuscripcionSinTarjeta,
  planDe,
  type Precios,
  preciosDeFilas,
  PRODUCTOS_MAVEN,
  validarRegistro,
  verificarFirmaStripe,
} from "./logica.ts";
import { ErrorStripe, type Json, stripe } from "./stripe.ts";

const cors = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" });

const responder = (req: Request, cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const appUrl = () => (Deno.env.get("APP_URL") || "https://app.maven-ai.me").replace(/\/+$/, "");

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface Org {
  id: string;
  nombre: string;
  estado: EstadoOrg;
  plan: Json;
  cobro: Cobro;
}

interface Quien {
  id: string;
  email: string | null;
  nivel: "dueno" | "admin" | null;
  orgs: string[];
}

async function huella(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ipDe = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";

async function quienLlama(db: SupabaseClient, req: Request): Promise<Quien | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const [{ data: plat }, { data: orgs }] = await Promise.all([
    db.from("plataforma_admins").select("nivel").eq("user_id", data.user.id).maybeSingle(),
    db.from("organizacion_admins").select("organizacion_id").eq("user_id", data.user.id),
  ]);
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    nivel: (plat as { nivel?: "dueno" | "admin" } | null)?.nivel ?? null,
    orgs: ((orgs ?? []) as { organizacion_id: string }[]).map((o) => o.organizacion_id),
  };
}

/** El cliente sobre el que actúa: el pedido (si lo administra o es la plataforma) o el suyo. */
function orgPedida(q: Quien, pedida: unknown): string | null {
  const id = typeof pedida === "string" && /^[0-9a-f-]{36}$/i.test(pedida) ? pedida : null;
  if (id) return q.nivel || q.orgs.includes(id) ? id : null;
  return q.orgs[0] ?? null;
}

async function leerOrg(db: SupabaseClient, id: string): Promise<Org | null> {
  const { data, error } = await db.from("organizaciones").select("id, nombre, estado, plan, cobro").eq("id", id).maybeSingle();
  if (error) throw new Error(`no se pudo leer el cliente: ${error.message}`);
  return (data as Org | null) ?? null;
}

async function leerPrecios(db: SupabaseClient): Promise<Precios> {
  const { data, error } = await db.from("precios_plataforma").select("clave, valor");
  if (error) throw new Error(`no se pudieron leer los precios: ${error.message}`);
  return preciosDeFilas((data ?? []) as { clave: string; valor: unknown }[]);
}

async function rpc<T = unknown>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    e.code = error.code;
    throw e;
  }
  return data as T;
}

const actualizarCobro = (db: SupabaseClient, org: string, cobro: Record<string, unknown>, estado?: "activa" | "bloqueada") =>
  rpc(db, "cobros_actualizar", { _org: org, _cobro: cobro, _estado: estado ?? null });

/** El cliente de Stripe del cliente de Maven (se crea una vez). */
async function asegurarCustomer(db: SupabaseClient, org: Org, correo: string | null): Promise<string> {
  if (org.cobro?.stripe_customer_id) return org.cobro.stripe_customer_id;
  const c = await stripe("POST", "customers", new URLSearchParams({
    name: org.nombre,
    ...(correo ? { email: correo } : {}),
    "metadata[maven]": "1",
    "metadata[organizacion_id]": org.id,
  }), { idem: `maven-customer-${org.id}` });
  await actualizarCobro(db, org.id, { stripe_customer_id: c.id });
  org.cobro = { ...org.cobro, stripe_customer_id: c.id };
  return c.id as string;
}

// ─── Avisos por correo (Resend; si no hay llave, no sale nada y no frena) ────

async function correosDe(db: SupabaseClient, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of [...new Set(ids)].slice(0, 20)) {
    const { data } = await db.auth.admin.getUserById(id);
    if (data?.user?.email) out.push(data.user.email);
  }
  return out;
}

const TEXTOS: Record<Aviso, (org: string) => { asunto: string; cuerpo: string; alCliente: boolean }> = {
  cliente_nuevo: (o) => ({ asunto: `Cliente nuevo en Maven: ${o}`, cuerpo: `${o} se registró desde la portada y puso su tarjeta. Empieza su prueba de 14 días.`, alCliente: false }),
  pago_fallido: (o) => ({
    asunto: `${o}: no se pudo cobrar el plan de Maven`,
    cuerpo: `No pudimos cobrar el plan de Maven de ${o}. Tienes 7 días para actualizar la tarjeta; después, la cuenta se bloquea (no se borra nada). Entra a Maven y toca «Pagar ahora».`,
    alCliente: true,
  }),
  pago_recuperado: (o) => ({ asunto: `${o}: pago recibido`, cuerpo: `Recibimos el pago del plan de Maven de ${o}. Todo sigue funcionando.`, alCliente: true }),
  cancelada: (o) => ({
    asunto: `${o}: la suscripción de Maven terminó`,
    cuerpo: `La suscripción de Maven de ${o} terminó. Tienes 7 días para reactivarla; después, la cuenta se bloquea (no se borra nada).`,
    alCliente: true,
  }),
};

async function avisar(db: SupabaseClient, tipo: Aviso, org: Org): Promise<void> {
  const llave = Deno.env.get("RESEND_API_KEY");
  if (!llave) return;
  try {
    const t = TEXTOS[tipo](org.nombre);
    const [{ data: admins }, { data: duenos }] = await Promise.all([
      db.from("organizacion_admins").select("user_id").eq("organizacion_id", org.id),
      db.from("plataforma_admins").select("user_id").eq("nivel", "dueno"),
    ]);
    const ids = [
      ...(t.alCliente ? ((admins ?? []) as { user_id: string }[]).map((a) => a.user_id) : []),
      ...((duenos ?? []) as { user_id: string }[]).map((d) => d.user_id),
    ];
    const para = await correosDe(db, ids);
    if (para.length === 0) return;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@envios.maven-ai.me",
        to: para,
        subject: t.asunto,
        text: `${t.cuerpo}\n\n${appUrl()}`,
      }),
    });
    if (!res.ok) console.warn(`[cobros-stripe] aviso ${tipo} no salió: ${res.status}`);
  } catch (e) {
    console.warn(`[cobros-stripe] aviso ${tipo} falló:`, (e as Error).message);
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

async function webhook(req: Request, db: SupabaseClient): Promise<Response> {
  const crudo = await req.text();
  const firma = await verificarFirmaStripe(crudo, req.headers.get("stripe-signature"), Deno.env.get("STRIPE_WEBHOOK_SECRET"), Math.floor(Date.now() / 1000));
  if (!firma.ok) return responder(req, { error: "firma_invalida", motivo: firma.motivo }, 400);

  let evento: Json;
  try { evento = JSON.parse(crudo); } catch { return responder(req, { error: "json_invalido" }, 400); }
  const leido = leerEvento(evento);
  if (!leido.ev) return responder(req, { ok: true, ignorado: evento?.type ?? null });

  // La cuenta de Stripe es la de Lumina: un evento que no es de un cliente de Maven se ignora.
  let orgId = leido.organizacionId;
  if (!orgId && leido.customer) {
    const { data } = await db.from("organizaciones").select("id").eq("cobro->>stripe_customer_id", leido.customer).maybeSingle();
    orgId = (data as { id?: string } | null)?.id ?? null;
  }
  if (!orgId) return responder(req, { ok: true, ignorado: "no_es_de_maven" });

  const toma = await rpc<string>(db, "stripe_evento_tomar", { _id: String(evento.id), _tipo: String(evento.type) });
  if (toma === "repetido") return responder(req, { ok: true, repetido: true });

  try {
    const org = await leerOrg(db, orgId);
    if (!org) {
      await rpc(db, "stripe_evento_cerrar", { _id: evento.id, _org: null, _resultado: { ignorado: "cliente_no_existe" } });
      return responder(req, { ok: true, ignorado: "cliente_no_existe" });
    }
    const precios = await leerPrecios(db);
    const d = decidir({ estado: org.estado, cobro: org.cobro ?? {} }, leido.ev, new Date(), precios.gracia.dias);
    const resultado: Json = { evento: leido.ev.tipo };
    if (Object.keys(d.cobro).length > 0 || d.estado) {
      resultado.cobro = await actualizarCobro(db, org.id, d.cobro, d.estado);
    }
    if (d.acreditarPlan) {
      resultado.plan = await rpc(db, "argos_acreditar_plan_de", { _org: org.id, _referencia: d.acreditarPlan.referencia });
    }
    if (d.acreditarRecarga) {
      try {
        resultado.recarga = await rpc(db, "argos_acreditar", {
          _org: org.id, _tenant: null, _tipo: "recarga", _usd: d.acreditarRecarga.usd,
          _referencia: d.acreditarRecarga.referencia, _detalle: { stripe: true },
        });
      } catch (e) {
        // La misma recarga dos veces (índice argos_mov_recarga_ref_idx): ya estaba acreditada.
        if ((e as { code?: string }).code !== "23505") throw e;
        resultado.recarga = { ya_estaba: true };
      }
    }
    if (d.avisar) await avisar(db, d.avisar, org);
    await rpc(db, "stripe_evento_cerrar", { _id: evento.id, _org: org.id, _resultado: resultado });
    return responder(req, { ok: true });
  } catch (e) {
    const m = (e as Error).message;
    console.error("[cobros-stripe] webhook falló:", m);
    await rpc(db, "stripe_evento_cerrar", { _id: evento.id, _org: orgId, _resultado: null, _error: m }).catch(() => {});
    // 500: Stripe lo reintenta (y stripe_evento_tomar dice «reintento»).
    return responder(req, { error: "no_se_pudo_procesar" }, 500);
  }
}

// ─── Acciones ────────────────────────────────────────────────────────────────

async function registro(req: Request, db: SupabaseClient, b: Json): Promise<Response> {
  const v = validarRegistro(b);
  if (!v.ok) return responder(req, { error: v.error }, 400);
  const puede = await rpc<boolean>(db, "puerta_contar", { _clave: `registro:${await huella(ipDe(req))}`, _tope: 5, _minutos: 60 });
  if (!puede) return responder(req, { error: "demasiados_intentos" }, 429);

  const { plan, empresa, nombre, correo, contrasena, idioma } = v.datos;
  const precios = await leerPrecios(db);
  if (!precios.stripe.precios?.[plan]) return responder(req, { error: "cobros_sin_preparar" }, 503);

  const { data: creado, error: errAlta } = await db.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { full_name: nombre, idioma },
    app_metadata: { alta: "registro" },
  });
  if (errAlta || !creado?.user) {
    const ya = /already|registered|exists/i.test(errAlta?.message ?? "");
    return responder(req, { error: ya ? "correo_en_uso" : "no_se_pudo_crear_la_cuenta" }, ya ? 409 : 500);
  }
  const userId = creado.user.id;
  let orgId: string | null = null;
  try {
    await db.from("profiles").update({ full_name: nombre }).eq("id", userId);
    const p = planDe(precios, plan);
    orgId = await rpc<string>(db, "crear_organizacion", { _nombre: empresa, _tipo: "normal", _plan: p, _marca: { nombre: empresa }, _es_demo: false, _slug: null });
    await rpc(db, "crear_agencia", { _org: orgId, _nombre: empresa, _sillas: p.personas, _slug: null });
    await rpc(db, "agregar_admin_organizacion", { _org: orgId, _user: userId, _principal: true });
    await rpc(db, "activar_organizacion", { _org: orgId });
    await actualizarCobro(db, orgId, { origen: "registro", estado_pago: "pendiente_checkout", correo });
    const org = (await leerOrg(db, orgId))!;
    const customer = await asegurarCustomer(db, org, correo);
    const sesion = await stripe("POST", "checkout/sessions", paramsCheckoutSuscripcion({
      precios, plan, organizacionId: orgId, customer, appUrl: appUrl(),
      diasPrueba: precios.prueba.dias, sinSetup: false, precioAMedidaUsd: null, origen: "registro", idioma,
    }), { idem: `maven-registro-${orgId}` });
    return responder(req, { ok: true, url: sesion.url, organizacion_id: orgId });
  } catch (e) {
    console.error("[cobros-stripe] registro falló; se deshace:", (e as Error).message);
    if (orgId) {
      await db.from("organizaciones").update({ estado: "archivada", archivada_at: new Date().toISOString() }).eq("id", orgId);
    }
    await db.auth.admin.deleteUser(userId).catch(() => {});
    return responder(req, { error: "no_se_pudo_registrar" }, 500);
  }
}

async function conQuien(req: Request, db: SupabaseClient): Promise<Quien | Response> {
  const q = await quienLlama(db, req);
  return q ?? responder(req, { error: "sin_sesion" }, 401);
}

async function accionAutenticada(req: Request, db: SupabaseClient, accion: string, b: Json): Promise<Response> {
  const q = await conQuien(req, db);
  if (q instanceof Response) return q;

  if (accion === "preparar-productos") {
    if (q.nivel !== "dueno") return responder(req, { error: "solo_dueno" }, 403);
    return responder(req, await prepararProductos(db));
  }

  if (accion === "suscribir-cliente") return suscribirCliente(req, db, q, b);

  // portal, checkout-recarga, checkout-registro: el admin del cliente o la plataforma.
  const orgId = orgPedida(q, b.organizacion_id);
  if (!orgId) return responder(req, { error: "sin_cliente" }, 403);
  const org = await leerOrg(db, orgId);
  if (!org) return responder(req, { error: "cliente_no_existe" }, 404);
  const precios = await leerPrecios(db);

  if (accion === "portal") {
    if (!org.cobro?.stripe_customer_id) return responder(req, { error: "sin_cliente_stripe" }, 409);
    const s = await stripe("POST", "billing_portal/sessions", new URLSearchParams({
      customer: org.cobro.stripe_customer_id,
      return_url: `${appUrl()}/dashboard`,
    }));
    return responder(req, { ok: true, url: s.url });
  }

  if (accion === "checkout-recarga") {
    const r = cuentaDeRecarga(precios, b.cantidad);
    if (!r) return responder(req, { error: "cantidad_invalida" }, 400);
    const customer = await asegurarCustomer(db, org, q.email);
    const s = await stripe("POST", "checkout/sessions", paramsCheckoutRecarga({
      precios, organizacionId: org.id, customer, appUrl: appUrl(), cantidad: r.cantidad, creditoUsd: r.creditoUsd,
    }));
    return responder(req, { ok: true, url: s.url, paga_usd: r.pagaUsd, credito_usd: r.creditoUsd });
  }

  if (accion === "checkout-registro") {
    const ep = org.cobro?.estado_pago;
    if (ep !== "pendiente_checkout" && ep !== "esperando_tarjeta" && ep !== "cancelada") {
      return responder(req, { error: "ya_tiene_tarjeta" }, 409);
    }
    const plan: NombrePlan = esPlan(org.plan?.nombre) ? org.plan.nombre : "equipo";
    const customer = await asegurarCustomer(db, org, q.email);
    const s = await stripe("POST", "checkout/sessions", paramsCheckoutSuscripcion({
      precios, plan, organizacionId: org.id, customer, appUrl: appUrl(),
      diasPrueba: ep === "cancelada" ? 0 : Number(org.cobro?.dias_gratis ?? precios.prueba.dias),
      sinSetup: org.cobro?.sin_setup === true || ep === "cancelada",
      precioAMedidaUsd: org.cobro?.precio_a_medida ?? null,
      origen: org.cobro?.origen === "dueno" ? "dueno" : "registro",
    }));
    return responder(req, { ok: true, url: s.url });
  }

  return responder(req, { error: "accion_desconocida" }, 400);
}

/** Alta del dueño (o Grace) con opciones especiales. Grace no pone precios. */
async function suscribirCliente(req: Request, db: SupabaseClient, q: Quien, b: Json): Promise<Response> {
  if (!q.nivel) return responder(req, { error: "solo_plataforma" }, 403);
  const op = opcionesEspeciales(q.nivel, b);
  if (!op.ok) return responder(req, { error: op.error }, op.error === "solo_dueno_precio" ? 403 : 400);
  if (!esPlan(b.plan)) return responder(req, { error: "plan_invalido" }, 400);
  const org = typeof b.organizacion_id === "string" ? await leerOrg(db, b.organizacion_id) : null;
  if (!org) return responder(req, { error: "cliente_no_existe" }, 404);
  if (org.cobro?.stripe_subscription_id) return responder(req, { error: "ya_tiene_suscripcion" }, 409);
  const correo = typeof b.correo === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.correo.trim()) ? b.correo.trim().toLowerCase() : null;
  if (!correo) return responder(req, { error: "correo_invalido" }, 400);

  const precios = await leerPrecios(db);
  const { dias_gratis, sin_tarjeta, sin_setup, precio_a_medida } = op.opciones;
  // El plan del cliente (paquete + precio). El precio a la medida solo lo trae el dueño.
  const plan = planDe(precios, b.plan, precio_a_medida);
  const { error: errPlan } = await db.from("organizaciones").update({ plan: { ...org.plan, ...plan } }).eq("id", org.id);
  if (errPlan) return responder(req, { error: "no_se_pudo_guardar_el_plan", detalle: errPlan.message }, 500);
  await actualizarCobro(db, org.id, {
    origen: "dueno", correo, dias_gratis, sin_tarjeta, sin_setup, precio_a_medida, alta_por: q.id,
  });
  const customer = await asegurarCustomer(db, org, correo);

  if (sin_tarjeta) {
    const sub = await stripe("POST", "subscriptions", paramsSuscripcionSinTarjeta({
      precios, plan: b.plan, organizacionId: org.id, customer, diasPrueba: dias_gratis, sinSetup: sin_setup, precioAMedidaUsd: precio_a_medida,
    }), { idem: `maven-sub-${org.id}` });
    await actualizarCobro(db, org.id, {
      stripe_subscription_id: sub.id, stripe_status: sub.status,
      estado_pago: dias_gratis > 0 ? "prueba" : "al_dia",
      prueba_hasta: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    });
    return responder(req, { ok: true, sin_tarjeta: true, suscripcion: sub.id });
  }
  const s = await stripe("POST", "checkout/sessions", paramsCheckoutSuscripcion({
    precios, plan: b.plan, organizacionId: org.id, customer, appUrl: appUrl(),
    diasPrueba: dias_gratis, sinSetup: sin_setup, precioAMedidaUsd: precio_a_medida, origen: "dueno",
  }));
  // Con tarjeta: el link se le manda al cliente; mientras tanto entra igual (no es el registro solo).
  await actualizarCobro(db, org.id, { estado_pago: "esperando_tarjeta" });
  return responder(req, { ok: true, url: s.url });
}

/** Crea en Stripe lo que falte (idempotente por lookup_key) y guarda los ids en precios_plataforma. */
async function prepararProductos(db: SupabaseClient): Promise<Json> {
  const precios = await leerPrecios(db);
  const productos: Record<string, string> = { ...(precios.stripe.productos ?? {}) } as Record<string, string>;
  const ids: Record<string, string> = { ...(precios.stripe.precios ?? {}) } as Record<string, string>;
  const hecho: Json = {};
  for (const p of PRODUCTOS_MAVEN) {
    const monto = montoDeProducto(precios, p.clave);
    const q = new URLSearchParams({ "lookup_keys[]": p.lookup, active: "true", "expand[]": "data.product" });
    const ya = (await stripe("GET", "prices", q)).data?.[0] as Json | undefined;
    if (ya && ya.unit_amount === monto && !!ya.recurring === p.mensual) {
      productos[p.clave] = typeof ya.product === "string" ? ya.product : ya.product.id;
      ids[p.clave] = ya.id;
      hecho[p.clave] = "ya_estaba";
      continue;
    }
    let producto = productos[p.clave] ?? (typeof ya?.product === "object" ? ya.product.id : ya?.product);
    if (!producto) {
      const buscado = await stripe("GET", "products/search", new URLSearchParams({ query: `metadata['maven_clave']:'${p.clave}'` }));
      producto = buscado.data?.[0]?.id;
    }
    if (!producto) {
      const nuevo = await stripe("POST", "products", new URLSearchParams({
        name: p.nombre, "metadata[maven]": "1", "metadata[maven_clave]": p.clave,
      }), { idem: `maven-producto-${p.clave}` });
      producto = nuevo.id;
    }
    const params = new URLSearchParams({
      product: producto!, currency: "usd", unit_amount: String(monto), lookup_key: p.lookup, transfer_lookup_key: "true",
      "metadata[maven]": "1", "metadata[maven_clave]": p.clave,
    });
    if (p.mensual) params.set("recurring[interval]", "month");
    const precio = await stripe("POST", "prices", params);
    productos[p.clave] = producto!;
    ids[p.clave] = precio.id;
    hecho[p.clave] = ya ? "precio_nuevo" : "creado";
  }
  const { error } = await db.from("precios_plataforma")
    .upsert({ clave: "stripe", valor: { productos, precios: ids }, actualizado_at: new Date().toISOString() }, { onConflict: "clave" });
  if (error) throw new Error(`no se guardaron los ids de Stripe: ${error.message}`);
  return { ok: true, hecho, productos, precios: ids };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return responder(req, { error: "metodo" }, 405);
  const db = admin();
  try {
    if (req.headers.get("stripe-signature")) return await webhook(req, db);
    const b = (await req.json().catch(() => ({}))) as Json;
    const accion = String(b.accion ?? "");
    if (accion === "registro") return await registro(req, db, b);
    if (["portal", "checkout-recarga", "checkout-registro", "suscribir-cliente", "preparar-productos"].includes(accion)) {
      return await accionAutenticada(req, db, accion, b);
    }
    return responder(req, { error: "accion_desconocida" }, 400);
  } catch (e) {
    if (e instanceof ErrorStripe) {
      console.error("[cobros-stripe] Stripe:", e.status, e.message);
      return responder(req, { error: e.codigo === "sin_llave" ? "cobros_sin_configurar" : "stripe", detalle: e.message }, e.status === 503 ? 503 : 502);
    }
    const m = (e as Error).message;
    console.error("[cobros-stripe]", m);
    return responder(req, { error: m === "faltan_productos_stripe" ? "cobros_sin_preparar" : "interno" }, m === "faltan_productos_stripe" ? 503 : 500);
  }
});
