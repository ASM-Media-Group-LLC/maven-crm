// Reglas puras de limpieza-storage (guarda: frontend/src/test/monitor/limpiezaStorage.test.ts).
//
// Sin imports a propósito: la prueba de vitest lo importa tal cual.
//
// Cada regla es UNA de las limpiezas viejas que hacía pg_cron con
// `delete from storage.objects` (Supabase ya no lo deja: storage.protect_delete).
// Qué archivos vencen NO se decide aquí: lo dice la base con la retención
// escrita en SQL (limpieza_storage_vencidos), así nadie puede pedir desde
// afuera "borra lo de ayer". Aquí solo se borra por la API de Storage, de a
// lotes de hasta 1000, y después se ordenan las filas (limpieza_storage_filas).

export const REGLAS = {
  // Fotos de las faltas del monitor de cámara (monitor_eventos.captura_path) y
  // cualquier archivo suelto del buzón, a los 7 días. Los pantallazos de Argos
  // que aún no se mudaron al NAS (fila en monitor_capturas con en_nas = false)
  // NO entran: esos los maneja argos-al-nas (buzón → NAS → borrado a los 30 días).
  monitor_faltas_7d: { bucket: "monitor-capturas" },
  // Todo lo del buzón monitor-capturas con más de 30 días, y las filas de
  // monitor_capturas de esa edad que nunca llegaron al NAS.
  monitor_capturas_30d: { bucket: "monitor-capturas" },
  // Videos de Argos (argos-clips) con más de 30 días y su fila en argos_clips.
  argos_clips_30d: { bucket: "argos-clips" },
} as const;

export type Regla = keyof typeof REGLAS;

export const esRegla = (x: unknown): x is Regla =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(REGLAS, x);

/** La API de Storage acepta hasta 1000 rutas por llamada. */
export const LOTE_MAX = 1000;

export interface Pasos {
  /** Los archivos vencidos de la regla (la retención la pone la base). null = falló. */
  vencidos(regla: Regla, limite: number): Promise<{ rutas: string[] | null; error: string | null }>;
  /** Borra por la API de Storage. `borrados` = los que Storage confirmó. */
  borrar(bucket: string, rutas: string[]): Promise<{ borrados: number; error: string | null }>;
  /** Lo que la regla hace con las filas una vez borrados los archivos. */
  filas(regla: Regla): Promise<{ resumen: unknown; error: string | null }>;
  ahora(): number;
}

export interface Resultado {
  regla: Regla;
  bucket: string;
  archivos: number;
  vueltas: number;
  /** true = no quedó nada vencido por borrar en esta corrida. */
  completa: boolean;
  filas: unknown;
  errores: string[];
}

export interface Opciones {
  lote?: number;
  /** Tope de vueltas por corrida: lo que sobre sale al día siguiente. */
  maxVueltas?: number;
  /** Tiempo máximo de la corrida (la edge tiene reloj de pared). */
  presupuestoMs?: number;
}

/**
 * Borra los archivos vencidos de una regla, de a lotes, y después ordena las
 * filas. Si Storage o la base fallan, se dice como fallo (nunca como «no había
 * nada») y las filas NO se tocan: igual que la limpieza vieja, que era todo o
 * nada en una transacción. Lo pendiente se reintenta en la próxima corrida.
 */
export async function limpiar(regla: Regla, pasos: Pasos, opciones: Opciones = {}): Promise<Resultado> {
  const lote = Math.min(Math.max(1, Math.floor(opciones.lote ?? LOTE_MAX)), LOTE_MAX);
  const maxVueltas = Math.max(1, opciones.maxVueltas ?? 30);
  const presupuestoMs = opciones.presupuestoMs ?? 100_000;
  const { bucket } = REGLAS[regla];
  const t0 = pasos.ahora();
  const errores: string[] = [];
  let archivos = 0;
  let vueltas = 0;
  let completa = false;

  while (vueltas < maxVueltas && pasos.ahora() - t0 < presupuestoMs) {
    const v = await pasos.vencidos(regla, lote);
    if (v.error !== null || v.rutas === null) {
      errores.push(`no se pudo saber qué venció: ${v.error ?? "sin respuesta"}`);
      break;
    }
    if (v.rutas.length === 0) { completa = true; break; }
    vueltas++;
    const b = await pasos.borrar(bucket, v.rutas);
    if (b.error !== null) { errores.push(`Storage no borró el lote: ${b.error}`); break; }
    // Sin esto, un archivo que Storage no quiere borrar haría dar vueltas en
    // falso hasta el tope, pidiendo siempre el mismo lote.
    if (b.borrados === 0) { errores.push(`Storage no borró ninguno de ${v.rutas.length} archivos`); break; }
    archivos += b.borrados;
    if (v.rutas.length < lote) { completa = true; break; }
  }

  let filas: unknown = null;
  if (errores.length === 0) {
    const f = await pasos.filas(regla);
    if (f.error !== null) errores.push(`las filas no se ordenaron: ${f.error}`);
    else filas = f.resumen;
  }
  return { regla, bucket, archivos, vueltas, completa, filas, errores };
}
