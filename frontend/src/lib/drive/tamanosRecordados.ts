// El último tamaño conocido de cada carpeta, guardado en ESTE navegador (Jhon,
// 03/10: «se tarda bastante en mostrarme el tamaño»). Al volver a una carpeta se
// muestra al instante lo de la vez anterior y, mientras tanto, la base lo cuenta
// de nuevo: cuando llega, se reemplaza. Es solo para ver antes; la cifra buena
// siempre es la que vuelve de drive_tamanos.
//
// Por persona (la clave lleva su id): en un equipo compartido nadie ve los
// tamaños de carpetas de otro. ⚠️ En incógnito o con las cookies bloqueadas
// `localStorage` LANZA al leerlo: todo va en try/catch y sin él simplemente no
// se recuerda nada.

export interface TamanoRecordado { bytes: number; archivos: number; carpetas: number; completo: boolean }

/** Cuántas carpetas se recuerdan como mucho (las más recientes). ~60 bytes cada una. */
export const MAXIMO_RECORDADOS = 3000;

// id → [bytes, archivos, carpetas, completo (1/0), cuándo (ms)]
type Fila = [number, number, number, 0 | 1, number];

const clave = (userId: string) => `drive.tamanos.v1.${userId}`;

function leer(userId: string): Record<string, Fila> {
  try {
    const crudo = localStorage.getItem(clave(userId));
    const datos = crudo ? JSON.parse(crudo) : null;
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : {};
  } catch {
    return {};
  }
}

/** Todo lo recordado de esta persona (se lee una vez y se consulta en memoria). */
export function tamanosRecordados(userId: string | undefined): Map<string, TamanoRecordado> {
  const salida = new Map<string, TamanoRecordado>();
  if (!userId) return salida;
  for (const [id, f] of Object.entries(leer(userId))) {
    if (!Array.isArray(f) || f.length < 5) continue;
    salida.set(id, { bytes: Number(f[0]) || 0, archivos: Number(f[1]) || 0, carpetas: Number(f[2]) || 0, completo: f[3] !== 0 });
  }
  return salida;
}

/** Guarda los tamaños recién contados. Si pasa del máximo, se van los más viejos. */
export function recordarTamanos(userId: string | undefined, nuevos: ReadonlyMap<string, TamanoRecordado>): void {
  if (!userId || nuevos.size === 0) return;
  try {
    const datos = leer(userId);
    const ahora = Date.now();
    for (const [id, s] of nuevos) datos[id] = [s.bytes, s.archivos, s.carpetas, s.completo ? 1 : 0, ahora];
    let ids = Object.keys(datos);
    if (ids.length > MAXIMO_RECORDADOS) {
      ids = ids.sort((a, b) => (datos[b][4] ?? 0) - (datos[a][4] ?? 0)).slice(0, MAXIMO_RECORDADOS);
      const recortado: Record<string, Fila> = {};
      for (const id of ids) recortado[id] = datos[id];
      localStorage.setItem(clave(userId), JSON.stringify(recortado));
      return;
    }
    localStorage.setItem(clave(userId), JSON.stringify(datos));
  } catch {
    // Sin espacio o sin permiso: no se recuerda, y nada más.
  }
}
