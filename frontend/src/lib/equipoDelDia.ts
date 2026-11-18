// El equipo de una persona en el día (Expediente de Argos, 18/11/2026): de las
// muestras de equipo_salud (cada 5 min, desde la app), cuántas veces estuvo en
// rojo cada cosa y la última muestra. Para saber si se trabó por el equipo o por
// el internet.
import type { Cosa, Luz } from "@/lib/medidorEquipo";

export interface FilaEquipo { creado: string; datos: Record<string, unknown> }
export interface ResumenEquipo {
  muestras: number;
  rojos: Record<Cosa, number>;
  amarillos: Record<Cosa, number>;
  ultima: { creado: string; datos: Record<string, unknown> } | null;
}

const COSAS: Cosa[] = ["internet", "computador", "memoria"];

export function resumirEquipo(filas: FilaEquipo[]): ResumenEquipo {
  const rojos = { internet: 0, computador: 0, memoria: 0 };
  const amarillos = { internet: 0, computador: 0, memoria: 0 };
  for (const f of filas) {
    for (const c of COSAS) {
      const l = f.datos?.[c] as Luz | undefined;
      if (l === "rojo") rojos[c]++;
      else if (l === "amarillo") amarillos[c]++;
    }
  }
  const ultima = filas.length ? filas.reduce((a, b) => (a.creado > b.creado ? a : b)) : null;
  return { muestras: filas.length, rojos, amarillos, ultima };
}
