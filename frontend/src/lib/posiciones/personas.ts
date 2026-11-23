import { CATALOGO_POSICIONES, TODAS_LAS_CLAVES, type AlcanceDatos } from "./catalogo";

export interface PosicionPersonal {
  id: string;
  nombre: string;
  activa: boolean;
  acceso_total: boolean;
  checks: Record<string, boolean>;
  alcances?: Record<string, AlcanceDatos>;
  updated_at: string;
}
export interface AccesosPersonales {
  user_id: string;
  revision: number;
  denegadas: string[];
}

/** A restriction belongs to the person and wins over every assigned position. */
export function accesosCombinados(posiciones: PosicionPersonal[], ids: string[], denegadas: string[]) {
  const activas = posiciones.filter(p => p.activa && ids.includes(p.id));
  const restricciones = new Set(denegadas);
  return Object.fromEntries(TODAS_LAS_CLAVES.map(clave => [clave,
    !restricciones.has(clave) && activas.some(p => p.acceso_total || p.checks[clave] === true),
  ]));
}

export function mismoConjunto(a: string[], b: string[]) {
  const left = new Set(a), right = new Set(b);
  return left.size === right.size && [...left].every(value => right.has(value));
}

/** El alcance pertenece a la función concedida; no se toma de otro puesto. */
export function alcancesCombinados(posiciones: PosicionPersonal[], ids: string[], denegadas: string[]) {
  const activas = posiciones.filter(p => p.activa && ids.includes(p.id));
  const restricciones = new Set(denegadas);
  const rango = { self: 1, subordinates: 2, all: 3 };
  const nombre = [null, "self", "subordinates", "all"] as const;
  return Object.fromEntries(CATALOGO_POSICIONES.flatMap(s => s.grupos.flatMap(g => g.filas.filter(f => f.datos === "tres").flatMap(f => f.funciones.map(fn => {
    const max = restricciones.has(fn.clave) ? 0 : Math.max(0, ...activas.filter(p => p.acceso_total || p.checks[fn.clave]).map(p => p.acceso_total ? 3 : rango[p.alcances?.[f.fila] ?? "all"]));
    return [fn.clave, nombre[max]];
  })))));
}
