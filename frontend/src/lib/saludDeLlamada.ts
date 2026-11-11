// POR QUÉ SE CAE LA LLAMADA, PERSONA POR PERSONA (Alvaro, 11/11/2026).
//
// llamada_cortes ya anotaba CADA corte, pero no POR QUÉ: con eso solo se veía
// «a Lina se le corta 38 veces al día», no si es su computador, su internet o
// Maven. Esto mide, una vez por minuto mientras dura la llamada, lo que WebRTC
// ya sabe y nadie miraba:
//
//  • qualityLimitationReason del video que manda: "cpu" = su computador no da
//    abasto codificando; "bandwidth" = su internet de subida no alcanza.
//  • availableOutgoingBitrate: cuánta subida le queda de verdad.
//  • rtt y pérdida de paquetes: si el internet está inestable.
//  • el retraso del hilo principal (lag): si la página se traba (computador
//    saturado o pestaña dormida por el navegador).
//  • si la pestaña estaba visible, núcleos y memoria del equipo, tipo de red.
//
// La muestra va a llamada_salud y la última viaja como `contexto` de cada corte.
// El servidor (vigilar_cortes_de_llamada) junta todo y le dice a la persona y a
// su supervisor la causa. Todo es fuego y olvido: medir jamás rompe la llamada.

export interface MuestraDeLlamada {
  vis: "visible" | "hidden" | string;
  calidad: string | null;
  rtt_ms: number | null;
  subida_kbps: number | null;
  perdida_pct: number | null;
  limite_cam: string | null;
  limite_pant: string | null;
  fps_pant: number | null;
  lag_ms: number | null;
  cam: boolean;
  pant: boolean;
  nucleos: number | null;
  memoria_gb: number | null;
  red: string | null;
  bajada_mbps: number | null;
  nav: string;
}

/** Lo que importa de un RTCStatsReport, de UNA pista que se manda. */
export interface LecturaDePista {
  limite: string | null;
  fps: number | null;
  rtt_ms: number | null;
  subida_kbps: number | null;
  perdida_pct: number | null;
}

type Fila = Record<string, unknown> & { type?: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lee un reporte de getStats de una pista local. De varias capas (simulcast)
 *  manda la peor limitación: si alguna capa está limitada por cpu, es cpu. */
export function leerReporte(filas: Iterable<Fila>): LecturaDePista {
  let limite: string | null = null;
  let fps: number | null = null;
  let rtt: number | null = null;
  let subida: number | null = null;
  let perdida: number | null = null;
  const peso = (r: string | null) => (r === "cpu" ? 3 : r === "bandwidth" ? 2 : r === "other" ? 1 : 0);
  for (const f of filas) {
    if (f.type === "outbound-rtp") {
      const r = typeof f.qualityLimitationReason === "string" ? f.qualityLimitationReason : null;
      if (peso(r) > peso(limite)) limite = r;
      else if (limite === null && r) limite = r;
      const fr = num(f.framesPerSecond);
      if (fr !== null) fps = Math.max(fps ?? 0, fr);
    } else if (f.type === "candidate-pair" && (f.nominated === true || f.selected === true) && f.state === "succeeded") {
      const r = num(f.currentRoundTripTime);
      if (r !== null) rtt = Math.round(r * 1000);
      const s = num(f.availableOutgoingBitrate);
      if (s !== null) subida = Math.round(s / 1000);
    } else if (f.type === "remote-inbound-rtp") {
      const fl = num(f.fractionLost);
      if (fl !== null) perdida = Math.max(perdida ?? 0, Math.round(fl * 1000) / 10);
      if (rtt === null) {
        const r = num(f.roundTripTime);
        if (r !== null) rtt = Math.round(r * 1000);
      }
    }
  }
  return { limite, fps, rtt_ms: rtt, subida_kbps: subida, perdida_pct: perdida };
}

/** Navegador y sistema, corto: "Chrome 141 · Windows". */
export function navegadorCorto(ua: string): string {
  const nav =
    /Edg\/(\d+)/.exec(ua)?.[1] ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /OPR\/(\d+)/.exec(ua)?.[1] ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua)?.[1] ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua)?.[1] ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua)?.[1] ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}` : "other";
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "other";
  return `${nav} · ${so}`;
}

/** El retraso del hilo principal: un reloj de 1 s que anota cuánto llegó
 *  tarde. Si la página se traba (computador saturado) o el navegador duerme la
 *  pestaña, llega tarde. Devuelve cómo leer (y reiniciar) el peor del tramo. */
export function medirRetraso(ahora: () => number = () => performance.now()): { leer: () => number; parar: () => void } {
  let peor = 0;
  let esperado = ahora() + 1000;
  const id = window.setInterval(() => {
    const t = ahora();
    peor = Math.max(peor, Math.max(0, t - esperado));
    esperado = t + 1000;
  }, 1000);
  return {
    leer: () => { const p = Math.round(peor); peor = 0; return p; },
    parar: () => window.clearInterval(id),
  };
}

/** Lo fijo del equipo de la persona (no cambia en la llamada). */
export function datosDelEquipo(): Pick<MuestraDeLlamada, "nucleos" | "memoria_gb" | "red" | "bajada_mbps" | "nav"> {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; type?: string; downlink?: number } };
  return {
    nucleos: num(n.hardwareConcurrency),
    memoria_gb: num(n.deviceMemory),
    red: n.connection ? [n.connection.type, n.connection.effectiveType].filter(Boolean).join("/") || null : null,
    bajada_mbps: num(n.connection?.downlink),
    nav: navegadorCorto(n.userAgent || ""),
  };
}

/** Junta las lecturas de cámara, pantalla y micrófono en una sola muestra. */
export function armarMuestra(p: {
  vis: string;
  calidad: string | null;
  cam: LecturaDePista | null;
  pant: LecturaDePista | null;
  mic: LecturaDePista | null;
  lag_ms: number | null;
}): MuestraDeLlamada {
  const lecturas = [p.mic, p.cam, p.pant].filter((l): l is LecturaDePista => !!l);
  const primero = <K extends keyof LecturaDePista>(k: K) => lecturas.map((l) => l[k]).find((v) => v !== null) ?? null;
  const perdidas = lecturas.map((l) => l.perdida_pct).filter((v): v is number => v !== null);
  return {
    vis: p.vis,
    calidad: p.calidad,
    rtt_ms: primero("rtt_ms") as number | null,
    subida_kbps: primero("subida_kbps") as number | null,
    perdida_pct: perdidas.length ? Math.max(...perdidas) : null,
    limite_cam: p.cam?.limite ?? null,
    limite_pant: p.pant?.limite ?? null,
    fps_pant: p.pant?.fps ?? null,
    lag_ms: p.lag_ms,
    cam: !!p.cam,
    pant: !!p.pant,
    ...datosDelEquipo(),
  };
}

// ── La llamada en curso, para saber si la página se recargó a mitad ──────────
//
// Una recarga no deja rastro: la página muere y no alcanza a anotar nada. Por
// eso al conectar se deja una marca en sessionStorage (por pestaña, sobrevive a
// la recarga) y al colgar a propósito se borra. Si al volver a entrar la marca
// sigue ahí, la llamada anterior murió con la página.

const MARCA = "maven.llamada-en-curso";

export function marcarLlamadaEnCurso(sala: string): void {
  try { sessionStorage.setItem(MARCA, JSON.stringify({ sala, t: Date.now() })); } catch { /* sin storage */ }
}

export function borrarLlamadaEnCurso(): void {
  try { sessionStorage.removeItem(MARCA); } catch { /* sin storage */ }
}

/** Si la pestaña se recargó (o el navegador la descartó) con una llamada
 *  andando, devuelve qué sala era y cómo volvió la página; si no, null. Se lee
 *  UNA vez y se borra. */
export function recargaConLlamada(): { sala: string; hace_s: number; nav: string; descartada: boolean } | null {
  try {
    const crudo = sessionStorage.getItem(MARCA);
    if (!crudo) return null;
    sessionStorage.removeItem(MARCA);
    const { sala, t } = JSON.parse(crudo) as { sala?: string; t?: number };
    if (!sala || typeof t !== "number") return null;
    const navs = performance.getEntriesByType?.("navigation") as PerformanceNavigationTiming[] | undefined;
    return {
      sala,
      hace_s: Math.round((Date.now() - t) / 1000),
      nav: navs?.[0]?.type ?? "unknown",
      descartada: !!(document as Document & { wasDiscarded?: boolean }).wasDiscarded,
    };
  } catch {
    return null;
  }
}
