// Fase 2 del reemplazo de Hubstaff: la comparación por persona que ve el
// admin. Puro, para poder probarlo sin pantalla.

export interface FilaDia {
  dia: string;
  profile_id: string;
  nombre: string | null;
  hubstaff_seg: number;
  hubstaff_actividad: number | null;
  cowork_activo_seg: number;
  cowork_pausa_seg: number;
  cowork_sin_camara_seg: number;
  cowork_sin_pantalla_seg: number;
  cowork_fuera_seg: number;
  cowork_en_sala_seg: number;
  cowork_sesiones: number;
}

export interface ResumenPersona {
  profile_id: string;
  nombre: string;
  hubstaff_seg: number;
  cowork_activo_seg: number;
  cowork_en_sala_seg: number;
  cowork_pausa_seg: number;
  cowork_sin_camara_seg: number;
  cowork_sin_pantalla_seg: number;
  cowork_fuera_seg: number;
  /** Cuánto del tiempo de Hubstaff explica el reloj de Cowork (0-1). null si no hay Hubstaff. */
  cobertura: number | null;
  diasHubstaff: number;
  diasCowork: number;
  dias: FilaDia[];
}

export interface Totales {
  personas: number;
  hubstaff_seg: number;
  cowork_activo_seg: number;
  cobertura: number | null;
  /** Personas con Hubstaff pero sin un solo segundo de Cowork: los que todavía no pasan por ahí. */
  sinCowork: number;
}

export function agregarPorPersona(filas: FilaDia[]): ResumenPersona[] {
  const mapa = new Map<string, ResumenPersona>();
  for (const f of filas) {
    let r = mapa.get(f.profile_id);
    if (!r) {
      r = {
        profile_id: f.profile_id, nombre: f.nombre || "Sin nombre",
        hubstaff_seg: 0, cowork_activo_seg: 0, cowork_en_sala_seg: 0, cowork_pausa_seg: 0,
        cowork_sin_camara_seg: 0, cowork_sin_pantalla_seg: 0, cowork_fuera_seg: 0,
        cobertura: null, diasHubstaff: 0, diasCowork: 0, dias: [],
      };
      mapa.set(f.profile_id, r);
    }
    r.hubstaff_seg += f.hubstaff_seg;
    r.cowork_activo_seg += f.cowork_activo_seg;
    r.cowork_en_sala_seg += f.cowork_en_sala_seg;
    r.cowork_pausa_seg += f.cowork_pausa_seg;
    r.cowork_sin_camara_seg += f.cowork_sin_camara_seg;
    r.cowork_sin_pantalla_seg += f.cowork_sin_pantalla_seg;
    r.cowork_fuera_seg += f.cowork_fuera_seg;
    if (f.hubstaff_seg > 0) r.diasHubstaff++;
    if (f.cowork_en_sala_seg > 0) r.diasCowork++;
    r.dias.push(f);
  }
  for (const r of mapa.values()) {
    r.cobertura = r.hubstaff_seg > 0 ? Math.min(r.cowork_activo_seg / r.hubstaff_seg, 9.99) : null;
    r.dias.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  }
  // Primero quien más horas de Hubstaff tiene: es a quien más le importa la comparación.
  return [...mapa.values()].sort((a, b) => b.hubstaff_seg - a.hubstaff_seg || a.nombre.localeCompare(b.nombre));
}

export function totales(personas: ResumenPersona[]): Totales {
  const hubstaff_seg = personas.reduce((s, p) => s + p.hubstaff_seg, 0);
  const cowork_activo_seg = personas.reduce((s, p) => s + p.cowork_activo_seg, 0);
  return {
    personas: personas.length,
    hubstaff_seg,
    cowork_activo_seg,
    cobertura: hubstaff_seg > 0 ? cowork_activo_seg / hubstaff_seg : null,
    sinCowork: personas.filter((p) => p.hubstaff_seg > 0 && p.cowork_en_sala_seg === 0).length,
  };
}

/** "7h 32m" — y "0m" para el cero, nunca "—": el cero aquí es un dato. */
export function horas(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

export function porcentaje(x: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}
