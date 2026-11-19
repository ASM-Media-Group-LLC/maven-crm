// HORARIO DE LA SEMANA de una persona (Alvaro, 19/11/2026): un solo horario por
// persona, día por día, con sus descansos. La base sale de su puesto (turno o
// rol); RR. HH. o su supervisor lo ajusta y lo confirma. Lógica pura.

/** 0 = domingo … 6 = sábado (como la base). entrada/salida «HH:MM»; null = descanso. */
export interface DiaHorario { dia: number; entrada: string | null; salida: string | null }

export interface FilaEquipoHorario {
  user_id: string;
  nombre: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  puesto: string | null;
  equipo: string | null;
  base_entrada: string | null;
  base_salida: string | null;
  turno: string | null;
  semana: Array<{ dia: number; entrada: string | null; salida: string | null }> | null;
  confirmado_at: string | null;
  confirmado_por: string | null;
}

/** Lunes primero, domingo al final (como se lee una semana de trabajo). */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;

export const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

/** La semana con la que arranca el editor: la que ya tiene, o la base de su puesto
 *  todos los días (para que RR. HH. marque los descansos y confirme). */
export function semanaInicial(f: Pick<FilaEquipoHorario, "semana" | "base_entrada" | "base_salida">): DiaHorario[] {
  if (f.semana && f.semana.length > 0) {
    const porDia = new Map(f.semana.map((d) => [d.dia, d]));
    return ORDEN_DIAS.map((dia) => {
      const d = porDia.get(dia);
      return { dia, entrada: hhmm(d?.entrada), salida: hhmm(d?.salida) };
    });
  }
  const e = hhmm(f.base_entrada), s = hhmm(f.base_salida);
  return ORDEN_DIAS.map((dia) => ({ dia, entrada: e && s ? e : null, salida: e && s ? s : null }));
}

export const trabaja = (d: DiaHorario) => !!d.entrada && !!d.salida;

/** ¿Todos los días que trabaja tienen la misma hora? (si sí, el editor simple basta). */
export function mismaHoraTodos(dias: DiaHorario[]): { entrada: string; salida: string } | null {
  const lab = dias.filter(trabaja);
  if (lab.length === 0) return null;
  const { entrada, salida } = lab[0];
  return lab.every((d) => d.entrada === entrada && d.salida === salida) ? { entrada: entrada!, salida: salida! } : null;
}

/** Cambia la hora de todos los días de trabajo de una vez. */
export function ponerHoraATodos(dias: DiaHorario[], entrada: string, salida: string): DiaHorario[] {
  return dias.map((d) => (trabaja(d) ? { ...d, entrada, salida } : d));
}

/** Prende o apaga un día (descanso ↔ trabajo con la hora de los demás o la base). */
export function alternarDia(dias: DiaHorario[], dia: number, horaPorDefecto: { entrada: string; salida: string } | null): DiaHorario[] {
  return dias.map((d) => {
    if (d.dia !== dia) return d;
    if (trabaja(d)) return { ...d, entrada: null, salida: null };
    const h = mismaHoraTodos(dias) ?? horaPorDefecto;
    return h ? { ...d, entrada: h.entrada, salida: h.salida } : { ...d, entrada: "08:00", salida: "16:00" };
  });
}

export type ErrorSemana = "sinDias" | "incompleto";
/** Qué le falta para poder confirmarse (null = está bien). */
export function validarSemana(dias: DiaHorario[]): ErrorSemana | null {
  if (dias.some((d) => (d.entrada == null) !== (d.salida == null))) return "incompleto";
  if (!dias.some(trabaja)) return "sinDias";
  return null;
}

/** Lo que se manda a horario_guardar. */
export function aGuardar(dias: DiaHorario[]): Array<{ dia: number; entrada: string | null; salida: string | null }> {
  return [...dias].sort((a, b) => a.dia - b.dia).map((d) => ({ dia: d.dia, entrada: trabaja(d) ? d.entrada : null, salida: trabaja(d) ? d.salida : null }));
}

/** ¿Cambió algo respecto a lo guardado? */
export function cambio(antes: DiaHorario[], ahora: DiaHorario[]): boolean {
  return JSON.stringify(aGuardar(antes)) !== JSON.stringify(aGuardar(ahora));
}
