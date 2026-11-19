import { useSyncExternalStore } from "react";

// ¿SE LE PUEDE MIRAR AHORA? (Marcar entrada, 19/11/2026). La pone TurnoEnMenu con
// lo que dice la base (mi_turno: antes de la fecha de corte o con la entrada
// marcada). La leen las capturas, los llamados de Argos y el vigía de apps.
// Arranca en true: si la consulta falla, Maven sigue como hoy y el candado real
// lo tiene el servidor (en_turno en las políticas y en monitor-vision).

let enTurno = true;
const oyentes = new Set<() => void>();

export function marcarEnTurno(v: boolean): void {
  if (v === enTurno) return;
  enTurno = v;
  for (const f of oyentes) f();
}

export function estaEnTurno(): boolean {
  return enTurno;
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

export function useEnTurno(): boolean {
  return useSyncExternalStore(suscribir, estaEnTurno, estaEnTurno);
}

// LA MISMA REGLA QUE EL SERVIDOR (en_turno, 19/11/2026: «nadie mira fuera del
// turno»). Quien no marca turno (dueño, admins, exentos) no se toca. Antes del
// corte cuenta solo DENTRO de su horario; desde el corte, con la entrada marcada.
export interface DatosTurno {
  aplica: boolean;
  obligatorio: boolean;
  abierta: boolean;
  turno_inicio: string | null;
  turno_fin: string | null;
}

export function calcularEnTurno(t: DatosTurno, ahora: number): boolean {
  if (!t.aplica) return true;
  if (t.obligatorio) return t.abierta;
  if (!t.turno_inicio || !t.turno_fin) return false;
  const ini = Date.parse(t.turno_inicio);
  const fin = Date.parse(t.turno_fin);
  return Number.isFinite(ini) && Number.isFinite(fin) && ahora >= ini && ahora < fin;
}
