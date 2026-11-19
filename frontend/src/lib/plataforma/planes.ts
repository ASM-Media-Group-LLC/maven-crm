import type { ClaveDePlan, PlanOrganizacion, Yo } from "./tipos";

// Los precios de la portada (spec, decisiones del 19/11): Equipo USD 299 hasta 20
// personas, Empresa USD 599 hasta 50, Enterprise a la medida. Setup desde USD 3.000.
// Argos trae crédito cada mes: Equipo USD 20, Empresa USD 50. Recarga: pagas USD 25
// y recibes USD 50 de crédito.
export const PLANES: Record<Exclude<ClaveDePlan, "enterprise">, Required<Pick<PlanOrganizacion, "nombre" | "personas" | "precio_usd" | "argos_usd_mes">>> = {
  equipo: { nombre: "equipo", personas: 20, precio_usd: 299, argos_usd_mes: 20 },
  empresa: { nombre: "empresa", personas: 50, precio_usd: 599, argos_usd_mes: 50 },
};

export const SETUP_USD = 3000;
export const RECARGA_PAGAS_USD = 25;
export const RECARGA_RECIBES_USD = 50;
export const DIAS_DE_PRUEBA = 14;
export const DIAS_DE_GRACIA = 7;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** ¿Quien mira puede ver precios y cobros? Solo el dueño de la plataforma y el admin
 *  del propio cliente; nunca Grace, y nadie mientras se «muestra a un cliente». */
export function vePrecios(yo: Pick<Yo, "tipo"> | null | undefined, mostrandoACliente: boolean): boolean {
  if (!yo || mostrandoACliente) return false;
  return yo.tipo === "dueno" || yo.tipo === "admin_cliente";
}

/** El plan como lo puede ver quien llama (arbol_plan_visible del edificio). */
export function planVisible(plan: PlanOrganizacion | null, conPrecios: boolean): PlanOrganizacion | null {
  if (!plan) return null;
  if (conPrecios) return plan;
  const { precio_usd: _p, setup_usd: _s, argos_usd_mes: _a, ...resto } = plan;
  return resto;
}

export const formatoUsd = (n: number, decimales = 0) =>
  `USD ${n.toLocaleString("en-US", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const correoValido = (c: string) => EMAIL_RE.test(c.trim());
