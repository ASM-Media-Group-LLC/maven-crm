// Los MOMENTOS del día de una persona (Argos tipo Hubstaff, Alvaro 11/11/2026):
// cada pantallazo con la cámara de ese momento, las cámaras sueltas (cuando no
// compartía pantalla) y los videos que grabó Argos, en orden de tiempo y
// repartidos por hora. «Flojo» = Argos lo juzgó fuera de lugar y no se perdonó.

import { enRango } from "@/lib/argosJornada";

export interface FotoArgos {
  id: string;
  tipo: "pantalla" | "camara";
  url: string | null;
  at: string;
  veredicto: string | null;
  fueraDeLugar: boolean | null;
  caraVisible: boolean | null;
  perdonado: boolean;
}

export interface ClipArgos {
  id: string;
  url: string | null;
  motivo: string | null;
  desde: string;
  hasta: string | null;
  duracionSeg: number | null;
}

export interface Momento {
  id: string;
  at: number;
  pantalla: FotoArgos | null;
  camara: FotoArgos | null;
  /** Argos lo juzgó (tiene veredicto). */
  juzgado: boolean;
  /** Argos lo vio fuera de lugar y no se perdonó. */
  flojo: boolean;
}

export type Pieza = { tipo: "momento"; at: number; m: Momento } | { tipo: "clip"; at: number; c: ClipArgos };

const PAREJA_MS = 90_000;

/** Empareja cada pantallazo con la cámara más cercana (≤ 90 s); las cámaras que sobran son momentos solos. */
export function armarMomentos(fotos: FotoArgos[]): Momento[] {
  const t = (f: FotoArgos) => Date.parse(f.at);
  const pantallas = fotos.filter((f) => f.tipo === "pantalla").sort((a, b) => t(a) - t(b));
  const camaras = fotos.filter((f) => f.tipo === "camara").sort((a, b) => t(a) - t(b));
  const usadas = new Set<string>();
  const out: Momento[] = [];
  for (const p of pantallas) {
    let mejor: FotoArgos | null = null;
    let dist = Infinity;
    for (const c of camaras) {
      if (usadas.has(c.id)) continue;
      const d = Math.abs(t(c) - t(p));
      if (d < dist) { dist = d; mejor = c; }
    }
    if (mejor && dist <= PAREJA_MS) usadas.add(mejor.id); else mejor = null;
    out.push({
      id: p.id, at: t(p), pantalla: p, camara: mejor,
      juzgado: p.veredicto !== null,
      flojo: p.fueraDeLugar === true && !p.perdonado,
    });
  }
  for (const c of camaras) {
    if (usadas.has(c.id)) continue;
    out.push({ id: c.id, at: t(c), pantalla: null, camara: c, juzgado: false, flojo: false });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Momentos y videos de una franja [desde, hasta), en orden de tiempo. */
export function piezasEntre(momentos: Momento[], clips: ClipArgos[], desde: number, hasta: number): Pieza[] {
  const dentro = (x: number) => enRango(x, desde, hasta);
  const piezas: Pieza[] = [
    ...momentos.filter((m) => dentro(m.at)).map((m): Pieza => ({ tipo: "momento", at: m.at, m })),
    ...clips.filter((c) => dentro(Date.parse(c.desde))).map((c): Pieza => ({ tipo: "clip", at: Date.parse(c.desde), c })),
  ];
  return piezas.sort((a, b) => a.at - b.at);
}

/** Los pantallazos que Argos juzgó, con los flojos primero (y cada grupo en orden de hora). */
export function juzgadosFlojosPrimero(momentos: Momento[]): { flojos: Momento[]; buenos: Momento[] } {
  const juzgados = momentos.filter((m) => m.juzgado);
  return { flojos: juzgados.filter((m) => m.flojo), buenos: juzgados.filter((m) => !m.flojo) };
}
