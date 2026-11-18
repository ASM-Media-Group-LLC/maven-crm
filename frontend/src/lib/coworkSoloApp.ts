// COWORK SOLO EN LA APP DE COMPUTADOR (Alvaro, 17/11/2026: Argos a USD 15).
//
// Para que Argos sepa gratis qué app y qué página tiene cada persona al frente,
// el equipo tiene que trabajar en la app de Maven para computador. Decidido:
// esta semana, aviso en el navegador del computador; desde el viernes 20/11
// (monitor_config.cowork_solo_app_desde, se puede mover sin subir código)
// Cowork en el navegador de un computador manda a la app. Celular: nada cambia.

export type EstadoSoloApp = "nada" | "aviso" | "bloqueo";

/** ¿Es el navegador de un computador (Mac o Windows), no la app ni un celular/tableta? */
export function esNavegadorDeComputador(p: { ua: string; tactil: boolean; enApp: boolean }): boolean {
  if (p.enApp || p.tactil) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(p.ua)) return false;
  return /Macintosh|Windows/i.test(p.ua);
}

/** Qué mostrar en Cowork. Sin fecha (o si no se pudo leer) no se bloquea nunca.
 *  17/11/2026 (Alvaro): la fecha pasó al viernes 20/11 y antes hay una prueba
 *  con 3 personas (monitor_config.cowork_solo_app_probadores): a ellas ya se
 *  les pide la app, con o sin fecha. */
export function estadoSoloApp(p: { ua: string; tactil: boolean; enApp: boolean; desde: Date | null; ahora: Date; probador?: boolean }): EstadoSoloApp {
  if (!esNavegadorDeComputador(p)) return "nada";
  if (p.probador) return "bloqueo";
  if (!p.desde || Number.isNaN(p.desde.getTime())) return "nada";
  return p.ahora >= p.desde ? "bloqueo" : "aviso";
}

export const DESCARGA_MAC = "Maven-Mac.dmg";
export const DESCARGA_WINDOWS = "Maven-Windows.exe";
export const descargaParaEsteEquipo = (ua: string) => (/Macintosh/i.test(ua) ? DESCARGA_MAC : DESCARGA_WINDOWS);

// ── ¿QUIÉN YA TIENE LA APP? (Alvaro, 18/11/2026) ─────────────────────────────
// Cada persona en Cowork publica en su presencia si está en la app y en qué
// equipo (hooks/useCoworkMediaPresence → enviar). El Hub del supervisor lo junta
// para empujar uno por uno a los que siguen en el navegador antes de la fecha.
// Los Maven de antes de este cambio no mandan nada: salen como «sin dato», que
// NO es lo mismo que «en el navegador» (una falta de dato no es un no).

/** En qué equipo trabaja, según su propio Maven. */
export type EquipoDeTrabajo = "mac" | "windows" | "linux" | "celular" | "otro";

/** Lo que cada persona publica sobre sí misma. `plataformaApp` = la de la app
 *  (escritorio()?.plataforma) o null en el navegador. */
export function equipoDeTrabajo(p: { ua: string; tactil: boolean; plataformaApp: string | null | undefined }): { enApp: boolean; equipo: EquipoDeTrabajo } {
  if (p.plataformaApp) {
    const equipo = p.plataformaApp === "mac" || p.plataformaApp === "windows" || p.plataformaApp === "linux" ? p.plataformaApp : "otro";
    return { enApp: true, equipo };
  }
  // El iPad se hace pasar por Mac: por eso lo táctil va primero.
  if (p.tactil || /Android|iPhone|iPad|iPod|Mobile/i.test(p.ua)) return { enApp: false, equipo: "celular" };
  if (/Macintosh/i.test(p.ua)) return { enApp: false, equipo: "mac" };
  if (/Windows/i.test(p.ua)) return { enApp: false, equipo: "windows" };
  if (/Linux|X11/i.test(p.ua)) return { enApp: false, equipo: "linux" };
  return { enApp: false, equipo: "otro" };
}

/** Cómo la ve el supervisor. `celular` no cuenta: ahí Cowork sigue igual. */
export type AdopcionApp = "app" | "navegador" | "celular" | "sinDato";

/** Lo que llegó por presencia, leído sin confiar en la forma (los Maven viejos no lo mandan). */
export function adopcionDe(st: { enApp?: unknown; equipo?: unknown } | null | undefined): AdopcionApp {
  if (!st || typeof st.enApp !== "boolean") return "sinDato";
  if (st.enApp) return "app";
  return st.equipo === "celular" ? "celular" : "navegador";
}

export interface ResumenAdopcion {
  /** Con la app. */
  conApp: string[];
  /** Siguen en el navegador de un computador: a estos hay que empujarlos. */
  navegador: string[];
  /** Su Maven no dijo nada (versión de antes o sin presencia todavía). */
  sinDato: string[];
  /** En el celular: fuera de la cuenta. */
  celular: string[];
  /** Los que cuentan: con app + navegador + sin dato. */
  total: number;
}

/** Junta a la gente de las salas. Cada uid se cuenta una vez. */
export function resumenAdopcion(uids: string[], estados: Record<string, { enApp?: unknown; equipo?: unknown } | undefined>): ResumenAdopcion {
  const r: ResumenAdopcion = { conApp: [], navegador: [], sinDato: [], celular: [], total: 0 };
  for (const uid of new Set(uids)) {
    const a = adopcionDe(estados[uid]);
    if (a === "app") r.conApp.push(uid);
    else if (a === "navegador") r.navegador.push(uid);
    else if (a === "celular") r.celular.push(uid);
    else r.sinDato.push(uid);
  }
  r.total = r.conApp.length + r.navegador.length + r.sinDato.length;
  return r;
}
