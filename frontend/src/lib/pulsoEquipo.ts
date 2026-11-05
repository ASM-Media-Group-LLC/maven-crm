// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11/2026).
// Responde de un vistazo, por JERARQUÍA: cuántos trabajan bien y cuántos están
// cometiendo errores AHORA, con una NOTA VIVA del equipo (0–100) y quién la está
// bajando. Las cajas van por equipo. Función pura y determinista (el guard la ata
// sin tocar la red); el hook usePulsoEquipo la alimenta con datos reales.

import type { EstadoVivo } from "@/hooks/useRondinVivo";

// Jerarquía por profiles.nivel. Un rango ve a TODOS los de rango INFERIOR (no a
// sus pares): dueño ve a todos, admin de admin para abajo, etc.
export const RANK_NIVEL: Record<string, number> = {
  dueno: 5, admin: 4, manager: 3, supervisor: 2, agente: 1,
};

/** ¿Este nivel puede ver el pulso de vigilancia? Supervisor para arriba. */
export function puedeVerPulso(nivel: string | null | undefined): boolean {
  return (RANK_NIVEL[nivel ?? ""] ?? 0) >= RANK_NIVEL.supervisor;
}

/** Los niveles que un viewer puede ver (todos los de rango estrictamente menor). */
export function nivelesVisibles(nivel: string | null | undefined): string[] {
  const r = RANK_NIVEL[nivel ?? ""] ?? 0;
  return Object.entries(RANK_NIVEL).filter(([, v]) => v < r).map(([k]) => k);
}

// Puntos vivos por estado (la "nota" de ese instante). ausente = offline: no
// cuenta para la nota viva (no está trabajando ahora, aparece en gris en su caja).
const PUNTOS: Record<EstadoVivo, number | null> = {
  trabajando: 100, presente: 70, pausa: 55,
  camara_apagada: 30, distraido: 30, no_mira: 30,
  celular: 15, se_fue: 15,
  ausente: null,
};
// Estados que son "cometiendo error ahora" (bajan y aparecen en "quién la baja").
export const ESTADOS_PROBLEMA: EstadoVivo[] = ["celular", "distraido", "no_mira", "camara_apagada", "se_fue"];
export function esProblema(e: EstadoVivo): boolean {
  return ESTADOS_PROBLEMA.includes(e);
}

export interface PersonaPulso {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  equipo: string;
  estado: EstadoVivo;
  /** ISO de cuándo arrancó el estado actual (para "hace X"). */
  desde: string | null;
  conectado: boolean;
  problema: boolean;
}

export interface CajaEquipo {
  equipo: string;
  miembros: PersonaPulso[];
  total: number;
  conectados: number;
  conProblema: number;
  /** Nota viva de la caja (0–100) o null si nadie conectado. */
  nota: number | null;
}

export interface Pulso {
  /** Nota viva del equipo completo (0–100) o null si nadie conectado. */
  notaViva: number | null;
  total: number;
  conectados: number;
  trabajando: number;
  conProblema: number;
  /** Los que están cometiendo error ahora, de peor a "menos mal". */
  quienLaBaja: PersonaPulso[];
  /** Cajas por equipo, las de peor pulso primero (y las que tienen problema arriba). */
  cajas: CajaEquipo[];
}

function promedio(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Arma el pulso a partir del roster visible (ya filtrado por jerarquía) y el
 *  estado en vivo de cada quien (del rondín). Quien no tiene estado = ausente. */
export function construirPulso(
  roster: Array<{ userId: string; nombre: string; avatarUrl: string | null; avatarSeed: string | null; equipo: string }>,
  estadoPor: Map<string, { estado: EstadoVivo; desde: string | null }>,
): Pulso {
  const personas: PersonaPulso[] = roster.map((r) => {
    const ev = estadoPor.get(r.userId);
    const estado: EstadoVivo = ev?.estado ?? "ausente";
    return {
      ...r,
      estado,
      desde: ev?.desde ?? null,
      conectado: estado !== "ausente",
      problema: esProblema(estado),
    };
  });

  const conectadas = personas.filter((p) => p.conectado);
  const puntosConectados = conectadas
    .map((p) => PUNTOS[p.estado])
    .filter((n): n is number => n != null);

  // Cajas por equipo.
  const porEquipo = new Map<string, PersonaPulso[]>();
  for (const p of personas) {
    const arr = porEquipo.get(p.equipo) ?? [];
    arr.push(p);
    porEquipo.set(p.equipo, arr);
  }
  const ordenEstado = (p: PersonaPulso) =>
    p.problema ? 0 : p.estado === "pausa" ? 1 : p.conectado ? 2 : 3;
  const cajas: CajaEquipo[] = [...porEquipo.entries()].map(([equipo, miembros]) => {
    const ms = [...miembros].sort((a, b) => ordenEstado(a) - ordenEstado(b) || a.nombre.localeCompare(b.nombre, "es"));
    const conectados = ms.filter((p) => p.conectado);
    return {
      equipo,
      miembros: ms,
      total: ms.length,
      conectados: conectados.length,
      conProblema: ms.filter((p) => p.problema).length,
      nota: promedio(conectados.map((p) => PUNTOS[p.estado]).filter((n): n is number => n != null)),
    };
  });
  // Cajas: primero las que tienen problema, luego por peor nota, luego por nombre.
  cajas.sort((a, b) =>
    (b.conProblema > 0 ? 1 : 0) - (a.conProblema > 0 ? 1 : 0)
    || (a.nota ?? 101) - (b.nota ?? 101)
    || a.equipo.localeCompare(b.equipo, "es"),
  );

  const quienLaBaja = personas
    .filter((p) => p.problema)
    .sort((a, b) => (PUNTOS[a.estado] ?? 0) - (PUNTOS[b.estado] ?? 0) || a.nombre.localeCompare(b.nombre, "es"));

  return {
    notaViva: promedio(puntosConectados),
    total: personas.length,
    conectados: conectadas.length,
    trabajando: personas.filter((p) => p.estado === "trabajando").length,
    conProblema: personas.filter((p) => p.problema).length,
    quienLaBaja,
    cajas,
  };
}
