import type { CambiosDeFicha, Faltante, Ficha, FichaDelCliente, PlanOrganizacion } from "./tipos";
import { PLANES, formatoUsd } from "./planes";

// LA FICHA DEL CLIENTE (tanda 25/11): al preparar un cliente, Maven le pregunta a Alvaro
// con botones, una por una (no hay números fijos de prueba ni de gracia), y no deja
// activar hasta que todo esté contestado, el setup pagado o regalado y, si se pidió, el
// contrato firmado. Las reglas viven en el edificio (ficha_faltantes / guardar_ficha en
// infra/edificio/migraciones/20261125120500_nuevo_cliente.sql); aquí está la misma
// cuenta para la maqueta y las preguntas que muestra la pantalla.

export const CLAVES_DE_DINERO = ["dias_prueba", "dias_gracia", "forma_cobro", "setup_usd", "setup_estado", "silla_extra_usd"] as const;

/** Lo que falta para activar. El mismo orden y las mismas claves que ficha_faltantes. */
export function faltantesDe(p: { tieneDueno: boolean; plan: Partial<PlanOrganizacion> | null; ficha: Ficha }): Faltante[] {
  const f = p.ficha ?? {};
  const plan = p.plan ?? {};
  const faltan: Faltante[] = [];
  if (!p.tieneDueno) faltan.push("dueno");
  if (!plan.nombre || !((plan.personas ?? 0) > 0)) faltan.push("plan");
  if (plan.precio_usd === undefined) faltan.push("precio");
  if (f.dias_prueba === undefined) faltan.push("dias_prueba");
  if (f.dias_gracia === undefined) faltan.push("dias_gracia");
  if (f.forma_cobro === undefined) faltan.push("forma_cobro");
  if (f.setup_usd === undefined) faltan.push("setup");
  else if (f.setup_usd > 0 && f.setup_estado !== "pagado" && f.setup_estado !== "regalado") faltan.push("setup_sin_pagar");
  if (f.silla_extra_usd === undefined) faltan.push("silla_extra");
  if (f.montaje === undefined) faltan.push("montaje");
  if (f.pide_contrato === undefined) faltan.push("contrato");
  else if (f.pide_contrato && !f.contrato_firmado_at) faltan.push("contrato_sin_firmar");
  return faltan;
}

/** guardar_ficha en la maqueta: los mismos cambios sobre el plan y la ficha. */
export function aplicarCambiosDeFicha(plan: Partial<PlanOrganizacion> | null, ficha: Ficha, c: CambiosDeFicha): { plan: Partial<PlanOrganizacion>; ficha: Ficha } {
  const p: Partial<PlanOrganizacion> = { ...(plan ?? {}) };
  const f: Ficha = { ...ficha };
  if (c.plan_nombre) { p.nombre = c.plan_nombre; p.argos_usd_mes = c.plan_nombre === "equipo" ? PLANES.equipo.argos_usd_mes : PLANES.empresa.argos_usd_mes; }
  if (c.personas !== undefined) p.personas = c.personas;
  if (c.precio_usd !== undefined) p.precio_usd = c.precio_usd;
  if (c.dias_prueba !== undefined) f.dias_prueba = c.dias_prueba;
  if (c.dias_gracia !== undefined) f.dias_gracia = c.dias_gracia;
  if (c.forma_cobro !== undefined) f.forma_cobro = c.forma_cobro;
  if (c.setup_usd !== undefined) f.setup_usd = c.setup_usd;
  if (c.setup_estado !== undefined) f.setup_estado = c.setup_estado;
  if (f.setup_usd === 0) delete f.setup_estado;
  else if (f.setup_usd !== undefined && !f.setup_estado) f.setup_estado = "pendiente";
  if (c.silla_extra_usd !== undefined) f.silla_extra_usd = c.silla_extra_usd;
  if (c.montaje !== undefined) f.montaje = c.montaje;
  if (c.pide_contrato !== undefined) { f.pide_contrato = c.pide_contrato; if (!c.pide_contrato) delete f.contrato_firmado_at; }
  if (c.contrato_firmado !== undefined) {
    if (c.contrato_firmado) f.contrato_firmado_at = f.contrato_firmado_at ?? new Date().toISOString();
    else delete f.contrato_firmado_at;
  }
  return { plan: p, ficha: f };
}

// ─── Las preguntas que ve Alvaro (y las que no son de dinero, Grace) ───────────

export interface Opcion {
  /** Clave de texto (t) de la etiqueta del botón. */
  etiqueta: string;
  vars?: Record<string, string | number>;
  cambios: CambiosDeFicha;
  recomendada?: boolean;
}

export interface Pregunta {
  k: "plan" | "precio" | "dias_prueba" | "dias_gracia" | "setup" | "setup_estado" | "forma_cobro" | "silla_extra" | "montaje" | "contrato" | "contrato_firmado";
  /** Solo la contesta el dueño de la plataforma. */
  dinero: boolean;
  opciones: Opcion[];
  /** «Otro»: un número que escribe Alvaro. */
  otro?: { campo: "personas" | "precio_usd" | "dias_prueba" | "dias_gracia" | "setup_usd" | "silla_extra_usd"; min: number; max: number; extra?: CambiosDeFicha };
  /** Qué faltantes resuelve: si alguno está en la lista, la pregunta está por contestar. */
  resuelve: Faltante[];
}

/** Las preguntas de la ficha, en orden, para ESTE cliente (algunas dependen de otras). */
export function preguntasDe(f: Pick<FichaDelCliente, "plan" | "ficha">): Pregunta[] {
  const plan = f.plan ?? {};
  const ficha = f.ficha ?? {};
  const ps: Pregunta[] = [
    {
      k: "plan", dinero: false, resuelve: ["plan"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.planEquipo", vars: { n: PLANES.equipo.personas }, cambios: { plan_nombre: "equipo", personas: PLANES.equipo.personas } },
        { etiqueta: "plataforma.ficha.op.planEmpresa", vars: { n: PLANES.empresa.personas }, cambios: { plan_nombre: "empresa", personas: PLANES.empresa.personas } },
      ],
      otro: { campo: "personas", min: 1, max: 10000, extra: { plan_nombre: "enterprise" } },
    },
    {
      k: "precio", dinero: true, resuelve: ["precio"],
      opciones: plan.nombre === "equipo" || plan.nombre === "empresa"
        ? [{ etiqueta: "plataforma.ficha.op.precioLista", vars: { usd: formatoUsd(PLANES[plan.nombre].precio_usd) }, cambios: { precio_usd: PLANES[plan.nombre].precio_usd }, recomendada: true }]
        : [],
      otro: { campo: "precio_usd", min: 0, max: 1000000 },
    },
    {
      k: "dias_prueba", dinero: true, resuelve: ["dias_prueba"],
      opciones: [0, 7, 14, 30].map((d) => ({ etiqueta: d === 0 ? "plataforma.ficha.op.sinPrueba" : "plataforma.ficha.op.dias", vars: { n: d }, cambios: { dias_prueba: d } })),
      otro: { campo: "dias_prueba", min: 0, max: 365 },
    },
    {
      k: "dias_gracia", dinero: true, resuelve: ["dias_gracia"],
      opciones: [0, 3, 7, 14].map((d) => ({ etiqueta: d === 0 ? "plataforma.ficha.op.sinGracia" : "plataforma.ficha.op.dias", vars: { n: d }, cambios: { dias_gracia: d } })),
      otro: { campo: "dias_gracia", min: 0, max: 90 },
    },
    {
      k: "setup", dinero: true, resuelve: ["setup"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.setupLista", vars: { usd: formatoUsd(3000) }, cambios: { setup_usd: 3000 } },
        { etiqueta: "plataforma.ficha.op.sinSetup", cambios: { setup_usd: 0 } },
      ],
      otro: { campo: "setup_usd", min: 1, max: 1000000 },
    },
  ];
  ps.push(
    {
      k: "forma_cobro", dinero: true, resuelve: ["forma_cobro"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.cobroLink", cambios: { forma_cobro: "link" }, recomendada: true },
        { etiqueta: "plataforma.ficha.op.cobroFactura", cambios: { forma_cobro: "factura" } },
        { etiqueta: "plataforma.ficha.op.cobroSuscripcion", cambios: { forma_cobro: "suscripcion" } },
      ],
    },
    {
      k: "silla_extra", dinero: true, resuelve: ["silla_extra"],
      opciones: [{ etiqueta: "plataforma.ficha.op.sillaExtra", vars: { usd: formatoUsd(15) }, cambios: { silla_extra_usd: 15 }, recomendada: true }],
      otro: { campo: "silla_extra_usd", min: 0, max: 10000 },
    },
    {
      k: "montaje", dinero: false, resuelve: ["montaje"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.montajeMaven", cambios: { montaje: "maven" } },
        { etiqueta: "plataforma.ficha.op.montajeCliente", cambios: { montaje: "cliente" } },
      ],
    },
    {
      k: "contrato", dinero: false, resuelve: ["contrato"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.contratoSi", cambios: { pide_contrato: true } },
        { etiqueta: "plataforma.ficha.op.contratoNo", cambios: { pide_contrato: false } },
      ],
    },
  );
  if ((ficha.setup_usd ?? 0) > 0) {
    ps.push({
      k: "setup_estado", dinero: true, resuelve: ["setup_sin_pagar"],
      opciones: [
        { etiqueta: "plataforma.ficha.op.setupPagado", cambios: { setup_estado: "pagado" } },
        { etiqueta: "plataforma.ficha.op.setupRegalado", cambios: { setup_estado: "regalado" } },
      ],
    });
  }
  if (ficha.pide_contrato) {
    ps.push({
      k: "contrato_firmado", dinero: false, resuelve: ["contrato_sin_firmar"],
      opciones: [{ etiqueta: "plataforma.ficha.op.contratoFirmado", cambios: { contrato_firmado: true } }],
    });
  }
  return ps;
}

/** ¿La pregunta está por contestar en esta ficha? */
export const porContestar = (p: Pregunta, faltan: Faltante[]) => p.resuelve.some((k) => faltan.includes(k));
