import { TODAS_LAS_CLAVES } from "./catalogo";

export interface FuncionesPosicion {
  uid: string;
  aplica: boolean;
  total: boolean;
  bloqueada: boolean;
  checks: Record<string, boolean>;
}

const claves = new Set(TODAS_LAS_CLAVES);

/** null conserva el sistema anterior; false nunca debe caer al nivel del rol. */
export function decisionPosicion(estado: FuncionesPosicion | undefined, clave: string): boolean | null {
  if (estado?.bloqueada) return false;
  if (!estado?.aplica || !claves.has(clave)) return null;
  return estado.total || estado.checks[clave] === true;
}

/** Los módulos sin casilla propia se abren si alguna de sus funciones está concedida. */
export function accesoPosicion(estado: FuncionesPosicion | undefined, modulo: string, submodulo?: string): boolean | null {
  const exacta = decisionPosicion(estado, `${modulo}|${submodulo ?? "*"}`);
  if (exacta !== null || submodulo || !estado?.aplica) return exacta;
  const funciones = TODAS_LAS_CLAVES.filter((c) => c.startsWith(`${modulo}|`));
  return funciones.length ? funciones.some((c) => decisionPosicion(estado,c) === true) : null;
}
