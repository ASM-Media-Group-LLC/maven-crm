// Cobros con Stripe (vagón 7, 19/11/2026): firma del webhook, la máquina de estados
// (gracia de 7 días → bloqueada), las cuentas de los créditos de Argos y lo que puede
// hacer Grace. deno test --allow-read supabase/functions/cobros-stripe/
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  aFormulario,
  type Cobro,
  cuentaDeRecarga,
  debeBloquear,
  decidir,
  firmaStripe,
  leerEvento,
  opcionesEspeciales,
  paramsCheckoutRecarga,
  paramsCheckoutSuscripcion,
  paramsSuscripcionSinTarjeta,
  planDe,
  PRECIOS_BASE,
  preciosDeFilas,
  validarRegistro,
  verificarFirmaStripe,
} from "./logica.ts";

const AHORA = new Date("2026-11-20T12:00:00Z");
const DIA = 86_400_000;
const SECRETO = "whsec_prueba";

// ─── Firma ───────────────────────────────────────────────────────────────────

Deno.test("firma: la que calcula Stripe pasa; otra, vieja o sin secreto no", async () => {
  const cuerpo = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const t = 1_800_000_000;
  const v1 = await firmaStripe(cuerpo, SECRETO, t);
  assertEquals((await verificarFirmaStripe(cuerpo, `t=${t},v1=${v1}`, SECRETO, t + 10)).ok, true);
  // Varias v1 (rotación del secreto): basta con una.
  assertEquals((await verificarFirmaStripe(cuerpo, `t=${t},v1=${"0".repeat(64)},v1=${v1}`, SECRETO, t)).ok, true);
  assertEquals((await verificarFirmaStripe(cuerpo + " ", `t=${t},v1=${v1}`, SECRETO, t)).motivo, "firma_no_coincide");
  assertEquals((await verificarFirmaStripe(cuerpo, `t=${t},v1=${v1}`, "otro", t)).motivo, "firma_no_coincide");
  assertEquals((await verificarFirmaStripe(cuerpo, `t=${t},v1=${v1}`, SECRETO, t + 301)).motivo, "fuera_de_tiempo");
  assertEquals((await verificarFirmaStripe(cuerpo, `t=${t},v1=${v1}`, undefined, t)).motivo, "sin_secreto");
  assertEquals((await verificarFirmaStripe(cuerpo, null, SECRETO, t)).motivo, "cabecera_invalida");
  assertEquals((await verificarFirmaStripe(cuerpo, `v1=${v1}`, SECRETO, t)).motivo, "cabecera_invalida");
});

Deno.test("firma: vector conocido (HMAC-SHA256 en hex de `${t}.${payload}`)", async () => {
  // printf '1.{}' | openssl dgst -sha256 -hmac 'k'
  assertEquals(await firmaStripe("{}", "k", 1), "3dd49b2593d0f9a349e9e71c4bde3e2b862c2be4003fe9b4ba81332029310158");
});

// ─── Máquina de estados ──────────────────────────────────────────────────────

const activa = (cobro: Cobro = {}) => ({ estado: "activa" as const, cobro });

Deno.test("pago fallido: 7 días de gracia, y un reintento no la alarga", () => {
  const d1 = decidir(activa({ estado_pago: "al_dia" }), { tipo: "factura_fallida", invoiceId: "in_1" }, AHORA);
  assertEquals(d1.cobro.estado_pago, "pago_fallido");
  assertEquals(d1.cobro.gracia_hasta, new Date(AHORA.getTime() + 7 * DIA).toISOString());
  assertEquals(d1.avisar, "pago_fallido");
  assertEquals(d1.estado, undefined, "no se bloquea en el momento");
  const luego = new Date(AHORA.getTime() + 3 * DIA);
  const d2 = decidir(activa({ estado_pago: "pago_fallido", gracia_hasta: d1.cobro.gracia_hasta as string }), { tipo: "factura_fallida", invoiceId: "in_1" }, luego);
  assertEquals(d2.cobro.gracia_hasta, d1.cobro.gracia_hasta, "Stripe reintenta: la gracia sigue siendo la del primer fallo");
  assertEquals(d2.avisar, undefined, "y no se avisa dos veces");
});

Deno.test("bloqueo: solo activa, fallando y con la gracia vencida", () => {
  const gracia = new Date(AHORA.getTime() + 7 * DIA).toISOString();
  const c: Cobro = { estado_pago: "pago_fallido", gracia_hasta: gracia };
  assertEquals(debeBloquear("activa", c, AHORA), false);
  assertEquals(debeBloquear("activa", c, new Date(AHORA.getTime() + 7 * DIA)), true);
  assertEquals(debeBloquear("activa", { ...c, estado_pago: "cancelada" }, new Date(AHORA.getTime() + 8 * DIA)), true);
  assertEquals(debeBloquear("activa", { ...c, estado_pago: "al_dia" }, new Date(AHORA.getTime() + 8 * DIA)), false);
  assertEquals(debeBloquear("pausada", c, new Date(AHORA.getTime() + 8 * DIA)), false, "pausada por Maven: no es cosa del cobro");
  assertEquals(debeBloquear("bloqueada", c, new Date(AHORA.getTime() + 8 * DIA)), false, "ya bloqueada");
  assertEquals(debeBloquear("activa", { estado_pago: "pago_fallido" }, AHORA), false, "sin fecha de gracia no se bloquea");
});

Deno.test("factura pagada: al día, sin gracia, desbloquea y acredita el plan del mes", () => {
  const d = decidir({ estado: "bloqueada", cobro: { estado_pago: "pago_fallido", gracia_hasta: "2026-11-01T00:00:00Z" } },
    { tipo: "factura_pagada", invoiceId: "in_9", montoCentavos: 29900 }, AHORA);
  assertEquals(d.cobro.estado_pago, "al_dia");
  assertEquals(d.cobro.gracia_hasta, null);
  assertEquals(d.cobro.bloqueada_at, null);
  assertEquals(d.estado, "activa");
  assertEquals(d.acreditarPlan, { referencia: "in_9" });
  assertEquals(d.avisar, "pago_recuperado");
  // La factura de 0 de la prueba no la saca de «prueba» ni avisa.
  const p = decidir(activa({ estado_pago: "prueba" }), { tipo: "factura_pagada", invoiceId: "in_0", montoCentavos: 0 }, AHORA);
  assertEquals(p.cobro.estado_pago, "prueba");
  assertEquals(p.estado, undefined);
  assertEquals(p.avisar, undefined);
});

Deno.test("registro completado: prueba de 14 días, activa, aviso al dueño", () => {
  const d = decidir({ estado: "activa", cobro: { estado_pago: "pendiente_checkout", origen: "registro" } },
    { tipo: "registro_completado", customer: "cus_1", subscription: "sub_1", diasPrueba: 14 }, AHORA);
  assertEquals(d.cobro.estado_pago, "prueba");
  assertEquals(d.cobro.prueba_hasta, new Date(AHORA.getTime() + 14 * DIA).toISOString());
  assertEquals(d.cobro.stripe_subscription_id, "sub_1");
  assertEquals(d.estado, "activa");
  assertEquals(d.avisar, "cliente_nuevo");
});

Deno.test("suscripción: past_due empieza gracia; active la cierra; canceled también da gracia", () => {
  const f = decidir(activa({ estado_pago: "al_dia" }), { tipo: "suscripcion_cambio", subscription: "sub_1", status: "past_due", trialEnd: null }, AHORA);
  assertEquals(f.cobro.estado_pago, "pago_fallido");
  assert(typeof f.cobro.gracia_hasta === "string");
  const ok = decidir({ estado: "bloqueada", cobro: { estado_pago: "pago_fallido", gracia_hasta: "x" } },
    { tipo: "suscripcion_cambio", subscription: "sub_1", status: "active", trialEnd: null }, AHORA);
  assertEquals(ok.cobro.estado_pago, "al_dia");
  assertEquals(ok.cobro.gracia_hasta, null);
  assertEquals(ok.estado, "activa");
  const t = decidir(activa(), { tipo: "suscripcion_cambio", subscription: "sub_1", status: "trialing", trialEnd: 1_800_000_000 }, AHORA);
  assertEquals(t.cobro.prueba_hasta, new Date(1_800_000_000 * 1000).toISOString());
  const del = decidir(activa({ estado_pago: "al_dia" }), { tipo: "suscripcion_borrada", subscription: "sub_1" }, AHORA);
  assertEquals(del.cobro.estado_pago, "cancelada");
  assertEquals(del.avisar, "cancelada");
  assert(debeBloquear("activa", del.cobro as Cobro, new Date(AHORA.getTime() + 7 * DIA)));
  // Un estado raro no cambia el estado_pago.
  const raro = decidir(activa({ estado_pago: "al_dia" }), { tipo: "suscripcion_cambio", subscription: "sub_1", status: "nuevo_de_stripe", trialEnd: null }, AHORA);
  assertEquals(raro.cobro.estado_pago, undefined);
});

Deno.test("recarga: se acredita lo pagado (25 → 50)", () => {
  const d = decidir(activa(), { tipo: "recarga_pagada", referencia: "cs_1", creditoUsd: 50 }, AHORA);
  assertEquals(d.acreditarRecarga, { usd: 50, referencia: "cs_1" });
  assertEquals(d.cobro, {});
});

// ─── Leer eventos de Stripe ──────────────────────────────────────────────────

Deno.test("leerEvento: checkout de registro, de recarga, facturas (API vieja y nueva) y lo que no nos importa", () => {
  const reg = leerEvento({ type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", customer: "cus_1", subscription: "sub_1", metadata: { organizacion_id: "o1", dias_prueba: "14" } } } });
  assertEquals(reg.organizacionId, "o1");
  assertEquals(reg.ev, { tipo: "registro_completado", customer: "cus_1", subscription: "sub_1", diasPrueba: 14 });
  const rec = leerEvento({ type: "checkout.session.completed", data: { object: { id: "cs_2", mode: "payment", payment_status: "paid", metadata: { tipo: "recarga", organizacion_id: "o1", credito_usd: "100" } } } });
  assertEquals(rec.ev, { tipo: "recarga_pagada", referencia: "cs_2", creditoUsd: 100 });
  const sinPagar = leerEvento({ type: "checkout.session.completed", data: { object: { id: "cs_3", mode: "payment", payment_status: "unpaid", metadata: { tipo: "recarga", credito_usd: "50" } } } });
  assertEquals(sinPagar.ev, null);
  const vieja = leerEvento({ type: "invoice.paid", data: { object: { id: "in_1", amount_paid: 29900, customer: "cus_1", subscription_details: { metadata: { organizacion_id: "o1" } } } } });
  assertEquals(vieja.organizacionId, "o1");
  assertEquals(vieja.ev, { tipo: "factura_pagada", invoiceId: "in_1", montoCentavos: 29900 });
  const nueva = leerEvento({ type: "invoice.payment_failed", data: { object: { id: "in_2", customer: "cus_1", parent: { subscription_details: { metadata: { organizacion_id: "o2" } } } } } });
  assertEquals(nueva.organizacionId, "o2");
  assertEquals(nueva.ev, { tipo: "factura_fallida", invoiceId: "in_2" });
  const sinOrg = leerEvento({ type: "invoice.paid", data: { object: { id: "in_3", customer: "cus_9" } } });
  assertEquals(sinOrg.organizacionId, null, "sin metadata: la edge lo busca por el customer");
  assertEquals(sinOrg.customer, "cus_9");
  assertEquals(leerEvento({ type: "charge.refunded", data: { object: {} } }).ev, null);
});

// ─── Precios, créditos y opciones del dueño ─────────────────────────────────

Deno.test("recarga de Argos: 25 → 50 por unidad, de 1 al tope", () => {
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, 1), { cantidad: 1, pagaUsd: 25, creditoUsd: 50 });
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, 4), { cantidad: 4, pagaUsd: 100, creditoUsd: 200 });
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, undefined), { cantidad: 1, pagaUsd: 25, creditoUsd: 50 });
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, 0), null);
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, 21), null);
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, 1.5), null);
  assertEquals(cuentaDeRecarga(PRECIOS_BASE, "x"), null);
  // Si el dueño cambia el precio en la tabla, la cuenta lo sigue.
  const p = preciosDeFilas([{ clave: "recarga_argos", valor: { paga_usd: 30, credito_usd: 60 } }]);
  assertEquals(cuentaDeRecarga(p, 2), { cantidad: 2, pagaUsd: 60, creditoUsd: 120 });
});

Deno.test("planes: Equipo 299/20 personas/USD 20 de Argos; Empresa 599/50/50; precio a la medida", () => {
  assertEquals(planDe(PRECIOS_BASE, "equipo"), { nombre: "equipo", precio_usd: 299, personas: 20, argos_usd_mes: 20 });
  assertEquals(planDe(PRECIOS_BASE, "empresa"), { nombre: "empresa", precio_usd: 599, personas: 50, argos_usd_mes: 50 });
  assertEquals(planDe(PRECIOS_BASE, "empresa", 450).precio_usd, 450);
});

Deno.test("opciones especiales: el dueño todo; Grace sin precio a la medida", () => {
  const dueno = opcionesEspeciales("dueno", { dias_gratis: 30, sin_tarjeta: true, sin_setup: true, precio_a_medida_usd: 450 });
  assertEquals(dueno, { ok: true, opciones: { dias_gratis: 30, sin_tarjeta: true, sin_setup: true, precio_a_medida: 450 } });
  assertEquals(opcionesEspeciales("dueno", { sin_setup: false }), { ok: true, opciones: { dias_gratis: 0, sin_tarjeta: false, sin_setup: true, precio_a_medida: null } });
  assertEquals(opcionesEspeciales("admin", { precio_a_medida_usd: 100 }), { ok: false, error: "solo_dueno_precio" });
  const grace = opcionesEspeciales("admin", { dias_gratis: 10, sin_setup: true });
  assertEquals(grace, { ok: true, opciones: { dias_gratis: 10, sin_tarjeta: false, sin_setup: true, precio_a_medida: null } });
  assertEquals(opcionesEspeciales("dueno", { dias_gratis: -1 }), { ok: false, error: "dias_gratis_invalidos" });
  assertEquals(opcionesEspeciales("dueno", { precio_a_medida_usd: 0 }), { ok: false, error: "precio_invalido" });
});

// ─── Parámetros de Stripe ────────────────────────────────────────────────────

const conIds = preciosDeFilas([{ clave: "stripe", valor: {
  productos: { equipo: "prod_eq", empresa: "prod_em", setup: "prod_se", recarga: "prod_re" },
  precios: { equipo: "price_eq", empresa: "price_em", setup: "price_se", recarga: "price_re" },
} }]);

Deno.test("aFormulario: corchetes como los pide Stripe y sin los vacíos", () => {
  const f = aFormulario({ a: 1, b: { c: "x", d: null }, e: [{ f: 2 }, "g"], h: undefined });
  assertEquals(f.toString(), "a=1&b%5Bc%5D=x&e%5B0%5D%5Bf%5D=2&e%5B1%5D=g");
});

Deno.test("checkout del registro: solo el plan, sin implementación automática ni con la opción antigua", () => {
  const f = paramsCheckoutSuscripcion({
    precios: conIds, plan: "empresa", organizacionId: "org-1", customer: "cus_1", appUrl: "https://app.maven-ai.me/",
    diasPrueba: 14, sinSetup: false, precioAMedidaUsd: null, origen: "registro", idioma: "es",
  });
  assertEquals(f.get("mode"), "subscription");
  assertEquals(f.get("payment_method_collection"), "always");
  assertEquals(f.get("subscription_data[trial_period_days]"), "14");
  assertEquals(f.get("line_items[0][price]"), "price_em");
  assertEquals(f.get("line_items[1][price]"), null, "no cobra la implementación aunque un cliente antiguo mande sinSetup=false");
  assertEquals(f.get("subscription_data[metadata][organizacion_id]"), "org-1");
  assertEquals(f.get("metadata[dias_prueba]"), "14");
  assertEquals(f.get("success_url"), "https://app.maven-ai.me/bienvenido?sesion={CHECKOUT_SESSION_ID}");
  assertEquals(f.get("cancel_url"), "https://app.maven-ai.me/empezar?plan=empresa&cancelado=1");
  // Sin setup y sin prueba (alta del dueño): no hay segunda línea ni días.
  const g = paramsCheckoutSuscripcion({
    precios: conIds, plan: "equipo", organizacionId: "org-1", customer: "cus_1", appUrl: "https://app.maven-ai.me",
    diasPrueba: 0, sinSetup: true, precioAMedidaUsd: 450, origen: "dueno",
  });
  assertEquals(g.get("line_items[1][price]"), null);
  assertEquals(g.get("subscription_data[trial_period_days]"), null);
  assertEquals(g.get("line_items[0][price_data][unit_amount]"), "45000");
  assertEquals(g.get("line_items[0][price_data][tax_behavior]"), "inclusive");
  assertEquals(g.get("line_items[0][price_data][product]"), "prod_eq");
  assertEquals(g.get("line_items[0][price_data][recurring][interval]"), "month");
  // Sin productos preparados no se arma nada a medias.
  assertThrows(() => paramsCheckoutSuscripcion({
    precios: PRECIOS_BASE, plan: "equipo", organizacionId: "o", customer: "c", appUrl: "x", diasPrueba: 14, sinSetup: false, precioAMedidaUsd: null, origen: "registro",
  }), Error, "faltan_productos_stripe");
});

Deno.test("checkout de la recarga y suscripción sin tarjeta", () => {
  const r = paramsCheckoutRecarga({ precios: conIds, organizacionId: "org-1", customer: "cus_1", appUrl: "https://app.maven-ai.me", cantidad: 2, creditoUsd: 100 });
  assertEquals(r.get("mode"), "payment");
  assertEquals(r.get("line_items[0][quantity]"), "2");
  assertEquals(r.get("metadata[tipo]"), "recarga");
  assertEquals(r.get("metadata[credito_usd]"), "100");
  assertEquals(r.get("payment_intent_data[metadata][organizacion_id]"), "org-1");
  const s = paramsSuscripcionSinTarjeta({ precios: conIds, plan: "equipo", organizacionId: "org-1", customer: "cus_1", diasPrueba: 30, sinSetup: false, precioAMedidaUsd: null });
  assertEquals(s.get("collection_method"), "send_invoice");
  assertEquals(s.get("days_until_due"), "7");
  assertEquals(s.get("trial_period_days"), "30");
  assertEquals(s.get("items[0][price]"), "price_eq");
  assertEquals(s.get("add_invoice_items[0][price]"), null, "tampoco agrega la implementación a las facturas sin tarjeta");
  const aMedida = paramsSuscripcionSinTarjeta({ precios: conIds, plan: "empresa", organizacionId: "org-1", customer: "cus_1", diasPrueba: 0, sinSetup: true, precioAMedidaUsd: 450 });
  assertEquals(aMedida.get("items[0][price_data][tax_behavior]"), "inclusive");
});

Deno.test("registro: valida y no deja registrar correos del equipo de Kash", () => {
  const ok = validarRegistro({ plan: "equipo", empresa: "Acme", nombre: "Ana", correo: " Ana@Acme.com ", contrasena: "12345678" });
  assert(ok.ok && ok.datos.correo === "ana@acme.com" && ok.datos.idioma === "es");
  assertEquals(validarRegistro({ plan: "enterprise", empresa: "Acme", nombre: "Ana", correo: "a@acme.com", contrasena: "12345678" }), { ok: false, error: "plan_invalido" });
  assertEquals(validarRegistro({ plan: "equipo", empresa: "Acme", nombre: "Ana", correo: "a@maven-ai.me", contrasena: "12345678" }), { ok: false, error: "correo_de_kash" });
  assertEquals(validarRegistro({ plan: "equipo", empresa: "Acme", nombre: "Ana", correo: "a@acme.com", contrasena: "corta" }), { ok: false, error: "contrasena_corta" });
  assertEquals(validarRegistro({ plan: "equipo", empresa: "A", nombre: "Ana", correo: "a@acme.com", contrasena: "12345678" }), { ok: false, error: "empresa_invalida" });
});
