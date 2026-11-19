// La lógica pura de los cobros (sin red ni base): firma del webhook de Stripe, qué le
// pasa al cliente con cada evento (gracia de 7 días y bloqueo), cuentas de los créditos
// de Argos, las opciones especiales del dueño y los parámetros de Stripe Checkout.
// La prueban cobros-stripe/logica.test.ts (Deno) y el banco del árbol (la misma regla
// de bloqueo en SQL: cobros_debe_bloquear). Solo para el EDIFICIO; Kash no cobra por aquí.

export type EstadoPago =
  | "pendiente_checkout" // se registró solo y todavía no puso la tarjeta: no entra
  | "esperando_tarjeta" //  alta del dueño con tarjeta: el link está mandado, entra igual
  | "prueba" //             14 días gratis (o los días que dio el dueño)
  | "al_dia"
  | "pago_fallido" //       7 días de gracia; después, bloqueada
  | "cancelada" //          suscripción terminada; misma gracia
  | "por_fuera"; //         el dueño cobra por fuera (sin Stripe)

export type EstadoOrg = "preparacion" | "activa" | "pausada" | "archivada" | "bloqueada";

export interface Cobro {
  estado_pago?: EstadoPago;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_status?: string;
  prueba_hasta?: string;
  gracia_hasta?: string;
  ultimo_pago_at?: string;
  bloqueada_at?: string;
  origen?: "registro" | "dueno";
  dias_gratis?: number;
  sin_tarjeta?: boolean;
  sin_setup?: boolean;
  precio_a_medida?: number;
  [k: string]: unknown;
}

export const GRACIA_DIAS = 7;
export const PRUEBA_DIAS = 14;
const DIA_MS = 86_400_000;

// ─── Firma del webhook (Stripe-Signature: t=…,v1=…) ──────────────────────────

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** La firma v1 que Stripe calcula: HMAC-SHA256(secreto, `${t}.${payload}`) en hex. */
export async function firmaStripe(payload: string, secreto: string, t: number): Promise<string> {
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", llave, enc.encode(`${t}.${payload}`)));
}

export function leerCabeceraFirma(cabecera: string | null): { t: number | null; v1: string[] } {
  const out = { t: null as number | null, v1: [] as string[] };
  for (const parte of (cabecera ?? "").split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === "t" && /^\d+$/.test(v)) out.t = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) out.v1.push(v.toLowerCase());
  }
  return out;
}

/** Comparación en tiempo constante (mismo largo siempre: 64 hex). */
function igualesSinPrisa(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verificarFirmaStripe(
  payload: string,
  cabecera: string | null,
  secreto: string | undefined,
  ahoraSeg: number,
  toleranciaSeg = 300,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!secreto) return { ok: false, motivo: "sin_secreto" };
  const { t, v1 } = leerCabeceraFirma(cabecera);
  if (t === null || v1.length === 0) return { ok: false, motivo: "cabecera_invalida" };
  if (Math.abs(ahoraSeg - t) > toleranciaSeg) return { ok: false, motivo: "fuera_de_tiempo" };
  const esperada = await firmaStripe(payload, secreto, t);
  // Se comparan TODAS (Stripe manda varias mientras se rota el secreto).
  let alguna = false;
  for (const f of v1) alguna = igualesSinPrisa(f, esperada) || alguna;
  return alguna ? { ok: true } : { ok: false, motivo: "firma_no_coincide" };
}

// ─── El estado del cliente con cada evento ───────────────────────────────────

export function estadoPagoDeSuscripcion(status: string | null | undefined): EstadoPago | null {
  switch (status) {
    case "trialing": return "prueba";
    case "active": return "al_dia";
    case "past_due":
    case "unpaid":
    case "paused": return "pago_fallido";
    case "canceled":
    case "incomplete_expired": return "cancelada";
    case "incomplete": return "pendiente_checkout";
    default: return null;
  }
}

export type Evento =
  | { tipo: "registro_completado"; customer: string | null; subscription: string | null; diasPrueba: number }
  | { tipo: "recarga_pagada"; referencia: string; creditoUsd: number }
  | { tipo: "factura_pagada"; invoiceId: string; montoCentavos: number }
  | { tipo: "factura_fallida"; invoiceId: string }
  | { tipo: "suscripcion_cambio"; subscription: string; status: string; trialEnd: number | null }
  | { tipo: "suscripcion_borrada"; subscription: string };

export type Aviso = "cliente_nuevo" | "pago_fallido" | "pago_recuperado" | "cancelada";

export interface Decision {
  /** Lo que se junta con organizaciones.cobro (null = se borra la llave). */
  cobro: Record<string, unknown>;
  /** Solo activa ↔ bloqueada; la base no toca a un cliente pausado o archivado por Maven. */
  estado?: "activa" | "bloqueada";
  acreditarPlan?: { referencia: string };
  acreditarRecarga?: { usd: number; referencia: string };
  avisar?: Aviso;
}

const enDias = (ahora: Date, dias: number) => new Date(ahora.getTime() + dias * DIA_MS).toISOString();
const seg = (s: number | null) => (s ? new Date(s * 1000).toISOString() : undefined);
const fallando = (c: Cobro) => c.estado_pago === "pago_fallido" || c.estado_pago === "cancelada";

/** Empieza la gracia, o deja la que ya corría (un reintento de Stripe no la alarga). */
function conGracia(actual: Cobro, ahora: Date, graciaDias: number): string {
  return fallando(actual) && actual.gracia_hasta ? actual.gracia_hasta : enDias(ahora, graciaDias);
}

/** Qué le pasa al cliente con este evento. Pura: la aplica la edge. */
export function decidir(
  actual: { estado: EstadoOrg; cobro: Cobro },
  ev: Evento,
  ahora: Date,
  graciaDias = GRACIA_DIAS,
): Decision {
  const c = actual.cobro ?? {};
  const reabrir = actual.estado === "bloqueada" ? { estado: "activa" as const } : {};
  switch (ev.tipo) {
    case "registro_completado": {
      const prueba = ev.diasPrueba > 0;
      return {
        cobro: {
          stripe_customer_id: ev.customer ?? c.stripe_customer_id ?? null,
          stripe_subscription_id: ev.subscription ?? c.stripe_subscription_id ?? null,
          estado_pago: prueba ? "prueba" : "al_dia",
          prueba_hasta: prueba ? enDias(ahora, ev.diasPrueba) : null,
          gracia_hasta: null,
          bloqueada_at: null,
        },
        estado: "activa",
        avisar: c.origen === "registro" ? "cliente_nuevo" : undefined,
      };
    }
    case "recarga_pagada":
      return { cobro: {}, acreditarRecarga: { usd: ev.creditoUsd, referencia: ev.referencia } };
    case "factura_pagada": {
      // La factura de 0 al empezar la prueba no la saca de «prueba».
      const sigueEnPrueba = ev.montoCentavos === 0 && c.estado_pago === "prueba";
      return {
        cobro: {
          estado_pago: sigueEnPrueba ? "prueba" : "al_dia",
          ultimo_pago_at: ev.montoCentavos > 0 ? ahora.toISOString() : c.ultimo_pago_at ?? null,
          gracia_hasta: null,
          bloqueada_at: null,
        },
        ...reabrir,
        acreditarPlan: { referencia: ev.invoiceId },
        avisar: fallando(c) || actual.estado === "bloqueada" ? "pago_recuperado" : undefined,
      };
    }
    case "factura_fallida":
      return {
        cobro: { estado_pago: "pago_fallido", gracia_hasta: conGracia(c, ahora, graciaDias) },
        avisar: fallando(c) ? undefined : "pago_fallido",
      };
    case "suscripcion_cambio": {
      const ep = estadoPagoDeSuscripcion(ev.status);
      const base: Record<string, unknown> = {
        stripe_status: ev.status,
        stripe_subscription_id: ev.subscription,
        prueba_hasta: ev.status === "trialing" ? seg(ev.trialEnd) ?? c.prueba_hasta ?? null : null,
      };
      if (ep === "pago_fallido" || ep === "cancelada") {
        return {
          cobro: { ...base, estado_pago: ep, gracia_hasta: conGracia(c, ahora, graciaDias) },
          avisar: fallando(c) ? undefined : ep === "cancelada" ? "cancelada" : "pago_fallido",
        };
      }
      if (ep === "prueba" || ep === "al_dia") {
        return { cobro: { ...base, estado_pago: ep, gracia_hasta: null, bloqueada_at: null }, ...reabrir };
      }
      return { cobro: base };
    }
    case "suscripcion_borrada":
      return {
        cobro: { stripe_status: "canceled", estado_pago: "cancelada", gracia_hasta: conGracia(c, ahora, graciaDias) },
        avisar: c.estado_pago === "cancelada" ? undefined : "cancelada",
      };
  }
}

/** La misma regla que cobros_debe_bloquear() en la base. */
export function debeBloquear(estado: EstadoOrg, cobro: Cobro, ahora: Date): boolean {
  return estado === "activa" && fallando(cobro) && !!cobro.gracia_hasta && new Date(cobro.gracia_hasta).getTime() <= ahora.getTime();
}

// ─── Leer el evento de Stripe ────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

export interface EventoLeido {
  ev: Evento | null;
  /** organizacion_id que pusimos en la metadata (si viene). */
  organizacionId: string | null;
  customer: string | null;
}

const idDe = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && typeof (v as Obj).id === "string" ? (v as Obj).id : null);

/** Toma el evento crudo de Stripe y lo pasa a uno de los nuestros (o null si no nos importa). */
export function leerEvento(evento: Obj): EventoLeido {
  const o: Obj = evento?.data?.object ?? {};
  const md: Obj = o.metadata ?? {};
  const customer = idDe(o.customer);
  const base = { organizacionId: typeof md.organizacion_id === "string" ? md.organizacion_id : null, customer };
  switch (evento?.type) {
    case "checkout.session.completed": {
      if (md.tipo === "recarga") {
        if (o.payment_status !== "paid") return { ...base, ev: null };
        const credito = Number(md.credito_usd);
        if (!Number.isFinite(credito) || credito <= 0) return { ...base, ev: null };
        return { ...base, ev: { tipo: "recarga_pagada", referencia: String(o.id), creditoUsd: credito } };
      }
      if (o.mode !== "subscription") return { ...base, ev: null };
      const dias = Number(md.dias_prueba ?? 0);
      return {
        ...base,
        ev: { tipo: "registro_completado", customer, subscription: idDe(o.subscription), diasPrueba: Number.isFinite(dias) ? dias : 0 },
      };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      // La metadata de la suscripción viaja en la factura (API vieja y nueva «basil»).
      const mdSub: Obj = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
      const org = base.organizacionId ?? (typeof mdSub.organizacion_id === "string" ? mdSub.organizacion_id : null);
      const ev: Evento = evento.type === "invoice.paid"
        ? { tipo: "factura_pagada", invoiceId: String(o.id), montoCentavos: Number(o.amount_paid ?? 0) }
        : { tipo: "factura_fallida", invoiceId: String(o.id) };
      return { organizacionId: org, customer, ev };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return {
        ...base,
        ev: { tipo: "suscripcion_cambio", subscription: String(o.id), status: String(o.status ?? ""), trialEnd: typeof o.trial_end === "number" ? o.trial_end : null },
      };
    case "customer.subscription.deleted":
      return { ...base, ev: { tipo: "suscripcion_borrada", subscription: String(o.id) } };
    default:
      return { ...base, ev: null };
  }
}

// ─── Precios y créditos ──────────────────────────────────────────────────────

export type NombrePlan = "equipo" | "empresa";

export interface Precios {
  plan_equipo: { precio_usd: number; personas: number; argos_usd_mes: number };
  plan_empresa: { precio_usd: number; personas: number; argos_usd_mes: number };
  setup: { usd: number };
  recarga_argos: { paga_usd: number; credito_usd: number; max_por_compra?: number };
  prueba: { dias: number };
  gracia: { dias: number };
  stripe: {
    productos?: Partial<Record<NombrePlan | "setup" | "recarga", string>>;
    precios?: Partial<Record<NombrePlan | "setup" | "recarga", string>>;
  };
}

export const PRECIOS_BASE: Precios = {
  plan_equipo: { precio_usd: 299, personas: 20, argos_usd_mes: 20 },
  plan_empresa: { precio_usd: 599, personas: 50, argos_usd_mes: 50 },
  setup: { usd: 3000 },
  recarga_argos: { paga_usd: 25, credito_usd: 50, max_por_compra: 20 },
  prueba: { dias: PRUEBA_DIAS },
  gracia: { dias: GRACIA_DIAS },
  stripe: {},
};

/** Las filas de precios_plataforma → Precios (lo que falte, de la portada). */
export function preciosDeFilas(filas: { clave: string; valor: unknown }[]): Precios {
  const p: Precios = structuredClone(PRECIOS_BASE);
  for (const f of filas ?? []) {
    if (f.clave in p && f.valor && typeof f.valor === "object") {
      // deno-lint-ignore no-explicit-any
      (p as any)[f.clave] = { ...(p as any)[f.clave], ...(f.valor as Obj) };
    }
  }
  return p;
}

export function esPlan(v: unknown): v is NombrePlan {
  return v === "equipo" || v === "empresa";
}

/** El plan que se guarda en organizaciones.plan. */
export function planDe(precios: Precios, nombre: NombrePlan, precioAMedidaUsd?: number | null) {
  const p = nombre === "equipo" ? precios.plan_equipo : precios.plan_empresa;
  return {
    nombre,
    precio_usd: precioAMedidaUsd && precioAMedidaUsd > 0 ? precioAMedidaUsd : p.precio_usd,
    personas: p.personas,
    argos_usd_mes: p.argos_usd_mes,
  };
}

/** Recarga de Argos: paga 25 → 50 de crédito por unidad (margen 2x). */
export function cuentaDeRecarga(precios: Precios, cantidad: unknown): { cantidad: number; pagaUsd: number; creditoUsd: number } | null {
  const n = Number(cantidad ?? 1);
  const max = precios.recarga_argos.max_por_compra ?? 20;
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return {
    cantidad: n,
    pagaUsd: Math.round(n * precios.recarga_argos.paga_usd * 100) / 100,
    creditoUsd: Math.round(n * precios.recarga_argos.credito_usd * 100) / 100,
  };
}

// ─── Opciones especiales del dueño (y de Grace, sin precios) ────────────────

export interface OpcionesEspeciales {
  dias_gratis: number;
  sin_tarjeta: boolean;
  sin_setup: boolean;
  precio_a_medida: number | null;
}

export function opcionesEspeciales(
  nivel: "dueno" | "admin",
  pedido: Obj,
): { ok: true; opciones: OpcionesEspeciales } | { ok: false; error: string } {
  const dias = pedido.dias_gratis == null || pedido.dias_gratis === "" ? 0 : Number(pedido.dias_gratis);
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) return { ok: false, error: "dias_gratis_invalidos" };
  const precio = pedido.precio_a_medida_usd == null || pedido.precio_a_medida_usd === "" ? null : Number(pedido.precio_a_medida_usd);
  if (precio !== null) {
    // Precios: solo el dueño de la plataforma (Grace no; decisión del 19/11, tanda 5).
    if (nivel !== "dueno") return { ok: false, error: "solo_dueno_precio" };
    if (!Number.isFinite(precio) || precio <= 0 || precio > 100_000) return { ok: false, error: "precio_invalido" };
  }
  return {
    ok: true,
    opciones: {
      dias_gratis: dias,
      sin_tarjeta: pedido.sin_tarjeta === true,
      sin_setup: pedido.sin_setup === true,
      precio_a_medida: precio === null ? null : Math.round(precio * 100) / 100,
    },
  };
}

// ─── Parámetros para la API de Stripe (form-urlencoded, con corchetes) ──────

type Valor = string | number | boolean | null | undefined | Valor[] | { [k: string]: Valor };

/** {a: {b: [ {c: 1} ]}} → a[b][0][c]=1, como lo pide Stripe. Salta null/undefined. */
export function aFormulario(obj: Record<string, Valor>, prefijo = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x !== null && typeof x === "object") aFormulario(x as Record<string, Valor>, `${clave}[${i}]`, out);
        else if (x !== null && x !== undefined) out.append(`${clave}[${i}]`, String(x));
      });
    } else if (typeof v === "object") {
      aFormulario(v as Record<string, Valor>, clave, out);
    } else {
      out.append(clave, String(v));
    }
  }
  return out;
}

const centavos = (usd: number) => Math.round(usd * 100);

/** La línea del plan: el precio de Stripe, o uno a la medida sobre el producto del plan. */
function lineaDelPlan(precios: Precios, plan: NombrePlan, precioAMedidaUsd: number | null): Record<string, Valor> {
  if (precioAMedidaUsd) {
    const producto = precios.stripe.productos?.[plan];
    if (!producto) throw new Error("faltan_productos_stripe");
    return {
      price_data: { currency: "usd", product: producto, unit_amount: centavos(precioAMedidaUsd), recurring: { interval: "month" } },
      quantity: 1,
    };
  }
  const precio = precios.stripe.precios?.[plan];
  if (!precio) throw new Error("faltan_productos_stripe");
  return { price: precio, quantity: 1 };
}

/** Checkout de la suscripción (registro solo o alta del dueño con tarjeta). */
export function paramsCheckoutSuscripcion(a: {
  precios: Precios;
  plan: NombrePlan;
  organizacionId: string;
  customer: string;
  appUrl: string;
  diasPrueba: number;
  sinSetup: boolean;
  precioAMedidaUsd: number | null;
  origen: "registro" | "dueno";
  idioma?: string;
}): URLSearchParams {
  const lineas: Record<string, Valor>[] = [lineaDelPlan(a.precios, a.plan, a.precioAMedidaUsd)];
  if (!a.sinSetup) {
    const setup = a.precios.stripe.precios?.setup;
    if (!setup) throw new Error("faltan_productos_stripe");
    // Pago único: Stripe lo cobra en la primera factura (al poner la tarjeta, aun con prueba).
    lineas.push({ price: setup, quantity: 1 });
  }
  const md = { maven: "1", organizacion_id: a.organizacionId, plan: a.plan, origen: a.origen, dias_prueba: String(a.diasPrueba) };
  const base = a.appUrl.replace(/\/+$/, "");
  return aFormulario({
    mode: "subscription",
    customer: a.customer,
    client_reference_id: a.organizacionId,
    line_items: lineas,
    // Tarjeta SIEMPRE (también en la prueba): después de los 14 días se cobra solo.
    payment_method_collection: "always",
    subscription_data: {
      trial_period_days: a.diasPrueba > 0 ? a.diasPrueba : undefined,
      metadata: md,
    },
    metadata: md,
    allow_promotion_codes: false,
    locale: a.idioma && /^(es|en|de|fr|it|pt)$/.test(a.idioma) ? a.idioma : "auto",
    success_url: `${base}/bienvenido?sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: a.origen === "registro" ? `${base}/empezar?plan=${a.plan}&cancelado=1` : `${base}/dashboard`,
  });
}

/** Checkout de una recarga de Argos (pago único). */
export function paramsCheckoutRecarga(a: {
  precios: Precios;
  organizacionId: string;
  customer: string;
  appUrl: string;
  cantidad: number;
  creditoUsd: number;
}): URLSearchParams {
  const precio = a.precios.stripe.precios?.recarga;
  if (!precio) throw new Error("faltan_productos_stripe");
  const md = { maven: "1", tipo: "recarga", organizacion_id: a.organizacionId, credito_usd: String(a.creditoUsd), cantidad: String(a.cantidad) };
  const base = a.appUrl.replace(/\/+$/, "");
  return aFormulario({
    mode: "payment",
    customer: a.customer,
    client_reference_id: a.organizacionId,
    line_items: [{ price: precio, quantity: a.cantidad }],
    metadata: md,
    payment_intent_data: { metadata: md },
    success_url: `${base}/dashboard?recarga=ok`,
    cancel_url: `${base}/dashboard?recarga=cancelada`,
  });
}

/** Suscripción SIN tarjeta (alta del dueño): Stripe manda la factura por correo y se paga con link. */
export function paramsSuscripcionSinTarjeta(a: {
  precios: Precios;
  plan: NombrePlan;
  organizacionId: string;
  customer: string;
  diasPrueba: number;
  sinSetup: boolean;
  precioAMedidaUsd: number | null;
}): URLSearchParams {
  const linea = lineaDelPlan(a.precios, a.plan, a.precioAMedidaUsd);
  // En /v1/subscriptions el precio a la medida va en items[][price_data] igual que en Checkout.
  const item = linea.price_data ? { price_data: linea.price_data, quantity: 1 } : { price: linea.price as string, quantity: 1 };
  const setup = a.sinSetup ? null : a.precios.stripe.precios?.setup;
  if (!a.sinSetup && !setup) throw new Error("faltan_productos_stripe");
  const md = { maven: "1", organizacion_id: a.organizacionId, plan: a.plan, origen: "dueno", dias_prueba: String(a.diasPrueba) };
  return aFormulario({
    customer: a.customer,
    items: [item],
    collection_method: "send_invoice",
    days_until_due: 7,
    trial_period_days: a.diasPrueba > 0 ? a.diasPrueba : undefined,
    add_invoice_items: setup ? [{ price: setup, quantity: 1 }] : undefined,
    metadata: md,
  });
}

/** Lo que el dueño prepara una vez en Stripe (cuenta de Lumina, cobros con nombre Maven). */
export const PRODUCTOS_MAVEN = [
  { clave: "equipo", nombre: "Maven Equipo", lookup: "maven_equipo_mensual", mensual: true },
  { clave: "empresa", nombre: "Maven Empresa", lookup: "maven_empresa_mensual", mensual: true },
  { clave: "setup", nombre: "Maven Setup", lookup: "maven_setup", mensual: false },
  { clave: "recarga", nombre: "Maven Argos recarga", lookup: "maven_argos_recarga", mensual: false },
] as const;

export function montoDeProducto(precios: Precios, clave: (typeof PRODUCTOS_MAVEN)[number]["clave"]): number {
  switch (clave) {
    case "equipo": return centavos(precios.plan_equipo.precio_usd);
    case "empresa": return centavos(precios.plan_empresa.precio_usd);
    case "setup": return centavos(precios.setup.usd);
    case "recarga": return centavos(precios.recarga_argos.paga_usd);
  }
}

// ─── Registro solo: validación ───────────────────────────────────────────────

/** Dominios del equipo de Kash: esas cuentas viven en Kash y no se registran en el edificio
 *  (si no, la puerta las mandaría al edificio y dejarían de ver su Maven). */
export const DOMINIOS_DE_KASH = ["maven-ai.me", "asmtech.ai", "asmtech.me", "kashagency.me"];

export function validarRegistro(b: Obj):
  | { ok: true; datos: { plan: NombrePlan; empresa: string; nombre: string; correo: string; contrasena: string; idioma: string } }
  | { ok: false; error: string } {
  const plan = b?.plan;
  if (!esPlan(plan)) return { ok: false, error: "plan_invalido" };
  const empresa = String(b?.empresa ?? "").trim();
  const nombre = String(b?.nombre ?? "").trim();
  const correo = String(b?.correo ?? "").trim().toLowerCase();
  const contrasena = String(b?.contrasena ?? "");
  if (empresa.length < 2 || empresa.length > 120) return { ok: false, error: "empresa_invalida" };
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, error: "nombre_invalido" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 254) return { ok: false, error: "correo_invalido" };
  const dominio = correo.split("@")[1];
  if (DOMINIOS_DE_KASH.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return { ok: false, error: "correo_de_kash" };
  if (contrasena.length < 8 || contrasena.length > 128) return { ok: false, error: "contrasena_corta" };
  const idioma = /^(es|en|de|fr|it|pt)$/.test(String(b?.idioma ?? "")) ? String(b.idioma) : "es";
  return { ok: true, datos: { plan, empresa, nombre, correo, contrasena, idioma } };
}
