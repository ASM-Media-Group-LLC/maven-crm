// Vista "Pausas" del supervisor: qué se muestra por persona a partir de las
// filas por día que devuelve la RPC `cowork_pausas_resumen`. Puro, para probarlo.
//
// Regla de la empresa (Jhon, 08/09): hay DOS pausas. Baño es un presupuesto
// del DÍA (p. ej. 10 min entre todas las idas); Break tiene tope POR PAUSA y lo
// decide cada supervisor en las reglas de su sesión. Por eso el exceso de baño
// se cuenta en DÍAS pasados del presupuesto y el de break en PAUSAS pasadas.

export interface FilaPausasDia {
  dia: string;
  user_id: string;
  nombre: string | null;
  banos: number;
  seg_bano: number;
  bano_limite_seg: number | null;
  bano_excedido: boolean;
  breaks: number;
  seg_break: number;
  break_limite_seg: number | null;
  breaks_excedidos: number;
  seg_break_de_mas: number;
  auto_cerradas: number;
}

export interface PersonaPausas {
  userId: string;
  nombre: string;
  dias: number;
  banos: number;
  segBano: number;
  /** Días en que se pasó del presupuesto de baño. */
  diasBanoExcedido: number;
  breaks: number;
  segBreak: number;
  breaksExcedidos: number;
  segBreakDeMas: number;
  autoCerradas: number;
  /** Algo que mirar: pasó del baño algún día o se pasó en algún break. */
  conExcesos: boolean;
}

export function agregarPausasPorPersona(filas: FilaPausasDia[]): PersonaPausas[] {
  const m = new Map<string, PersonaPausas>();
  for (const f of filas) {
    const p = m.get(f.user_id) ?? {
      userId: f.user_id, nombre: f.nombre?.trim() || "Sin nombre", dias: 0,
      banos: 0, segBano: 0, diasBanoExcedido: 0,
      breaks: 0, segBreak: 0, breaksExcedidos: 0, segBreakDeMas: 0,
      autoCerradas: 0, conExcesos: false,
    };
    p.dias += 1;
    p.banos += f.banos; p.segBano += f.seg_bano;
    if (f.bano_excedido) p.diasBanoExcedido += 1;
    p.breaks += f.breaks; p.segBreak += f.seg_break;
    p.breaksExcedidos += f.breaks_excedidos; p.segBreakDeMas += f.seg_break_de_mas;
    p.autoCerradas += f.auto_cerradas;
    p.conExcesos = p.diasBanoExcedido > 0 || p.breaksExcedidos > 0;
    m.set(f.user_id, p);
  }
  // Primero quien tiene algo que mirar; dentro, por más tiempo en pausa.
  return [...m.values()].sort((a, b) =>
    Number(b.conExcesos) - Number(a.conExcesos)
    || (b.segBano + b.segBreak) - (a.segBano + a.segBreak)
    || a.nombre.localeCompare(b.nombre, "es"));
}

export function totalesPausas(personas: PersonaPausas[]) {
  return personas.reduce((t, p) => ({
    personas: t.personas + 1,
    banos: t.banos + p.banos, segBano: t.segBano + p.segBano,
    breaks: t.breaks + p.breaks, segBreak: t.segBreak + p.segBreak,
    conExcesos: t.conExcesos + Number(p.conExcesos),
  }), { personas: 0, banos: 0, segBano: 0, breaks: 0, segBreak: 0, conExcesos: 0 });
}

/** "12 min", "1 h 05 min", "0 min". */
export function minutosLegibles(seg: number): string {
  const m = Math.round(Math.max(0, seg) / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")} min` : `${h} h`;
}

/** Frase corta del exceso de una persona, o null si va bien. */
export function fraseDeExcesos(p: PersonaPausas): string | null {
  const partes: string[] = [];
  if (p.diasBanoExcedido) partes.push(p.diasBanoExcedido === 1 ? "1 día pasado de baño" : `${p.diasBanoExcedido} días pasados de baño`);
  if (p.breaksExcedidos) partes.push(`${p.breaksExcedidos} ${p.breaksExcedidos === 1 ? "break pasado" : "breaks pasados"} (+${minutosLegibles(p.segBreakDeMas)})`);
  return partes.length ? partes.join(" · ") : null;
}
