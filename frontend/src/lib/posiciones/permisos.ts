import { TODAS_LAS_CLAVES } from "./catalogo";

export interface FuncionesPosicion {
  uid: string;
  aplica: boolean;
  total: boolean;
  bloqueada: boolean;
  checks: Record<string, boolean>;
  denegadas?: string[];
  alcances?: Record<string, "all" | "subordinates" | "self" | "none" | null>;
}

const claves = new Set(TODAS_LAS_CLAVES);

/** Alcance efectivo de la función que abre la pantalla; nunca lo amplía otro permiso. */
export function alcancePosicion(estado: FuncionesPosicion | undefined, modulo: string): "all" | "subordinates" | "self" | null {
  if (estado?.bloqueada) return "self";
  if (!estado?.aplica) return null;
  const entrada: Record<string,string> = { "Cowork": "Cowork|*", "Scouter Assist": "Scouter Assist|Mis Tareas", "LeadGen": "LeadGen|Lista", "Promolog": "Promolog|Promos", "CRM": "Contactos|Contactos" };
  const clave = entrada[modulo] ?? `${modulo}|*`;
  if (decisionPosicion(estado,clave) !== true) return "self";
  const alcance = estado.alcances?.[clave];
  return alcance === "all" || alcance === "subordinates" ? alcance : "self";
}

/** null conserva el sistema anterior; false nunca debe caer al nivel del rol. */
export function decisionPosicion(estado: FuncionesPosicion | undefined, clave: string): boolean | null {
  if (estado?.bloqueada) return false;
  if (!estado?.aplica || !claves.has(clave)) return null;
  if (estado.denegadas?.includes(clave)) return false;
  return estado.total || estado.checks[clave] === true;
}

/** Los módulos sin casilla propia se abren si alguna de sus funciones está concedida. */
export function accesoPosicion(estado: FuncionesPosicion | undefined, modulo: string, submodulo?: string): boolean | null {
  const exacta = decisionPosicion(estado, `${modulo}|${submodulo ?? "*"}`);
  if (exacta !== null || submodulo || !estado?.aplica) return exacta;
  const funciones = TODAS_LAS_CLAVES.filter((c) => c.startsWith(`${modulo}|`));
  return funciones.length ? funciones.some((c) => decisionPosicion(estado,c) === true) : null;
}
