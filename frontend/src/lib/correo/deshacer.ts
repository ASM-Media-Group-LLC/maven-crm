// «Deshacer», como en Gmail (Jhon, 03/10: «tiene que funcionar igual que
// Gmail»). Archivar, mover, eliminar, marcar como spam, posponer, leer/no leer y
// etiquetar dejan un aviso abajo con «Deshacer» (y la tecla z), que pone todo
// de vuelta donde estaba.
//
// Vive suelto —sin React ni Supabase— porque aquí está lo delicado:
//
//  ⚠️ LOS UID SON POR CARPETA. Deshacer un archivado es mover DESDE Archivados
//  con el uid que el correo tiene ALLÁ, no con el que tenía en Recibidos. Con el
//  viejo se movería otro correo (el que tenga ese número en Archivados) o
//  ninguno. Por eso la edge contesta adónde fue a parar cada uno (`destino`), y
//  lo que no se pueda ubicar con certeza se queda donde está y se avisa.
//
//  ⚠️ Y UNA LLAMADA POR PAR DE CARPETAS: en la vista de una etiqueta se archivan
//  juntos correos de Recibidos y de Notificaciones; de vuelta, cada uno va a la
//  SUYA. Mismo cuidado que `agruparPorCarpeta` al lanzar la acción.

import type { MailSummary, OperacionMasiva } from "@/hooks/useMailbox";

/** Adónde manda cada operación. La MISMA tabla que `DESTINO` en la edge
 *  (mail-fetch): solo se usa si la respuesta no dice la carpeta. */
export const CARPETA_DE_DESTINO: Partial<Record<OperacionMasiva, string>> = {
  archive: "Archive",
  spam: "Correo no deseado",
  delete: "Papelera",
  snooze: "Snoozed",
};

/** El uid de un correo, si tiene uno que sirva para IMAP. Sin uid no se manda
 *  (la edge no tendría qué mover) y, por lo tanto, tampoco hay qué deshacer. */
export function uidDe(m: Pick<MailSummary, "uid">): number | null {
  const u = Number(m.uid);
  return Number.isInteger(u) && u > 0 ? u : null;
}

/** El campo `destino` de la respuesta de `bulk`. Opcional: una edge anterior no
 *  lo manda. */
export interface DestinoDelMovimiento {
  folder: string;
  uidvalidity?: number | null;
  /** [uid en el origen, uid en el destino]. */
  mapa?: [number, number][];
}

/** ¿Esta operación, desde esta carpeta, se puede deshacer? Todo menos el
 *  borrado DEFINITIVO (eliminar estando en la Papelera): eso ya no existe en el
 *  servidor. Gmail tampoco lo deshace; por eso se confirma antes. */
export function sePuedeDeshacer(op: OperacionMasiva, origen: string): boolean {
  return !(op === "delete" && origen === "Papelera");
}

/** Las operaciones que MUEVEN (las demás solo cambian una bandera). */
export function mueve(op: OperacionMasiva): boolean {
  return op !== "seen" && op !== "unseen";
}

/** A qué carpeta fue a parar un grupo: lo que dijo la edge y, si no lo dijo, la
 *  tabla fija (o el destino que se eligió en «Mover a»). */
export function carpetaDeDestino(
  op: OperacionMasiva, dest: string | undefined, respuesta?: DestinoDelMovimiento,
): string | null {
  if (!mueve(op)) return null;
  if (respuesta?.folder) return respuesta.folder;
  return op === "move" ? dest ?? null : CARPETA_DE_DESTINO[op] ?? null;
}

/** Un grupo de la acción original: los correos de UNA carpeta como se
 *  mandaron, y lo que contestó la edge (si salió bien). */
export interface GrupoHecho {
  origen: string;
  correos: MailSummary[];
  respuesta?: { destino?: DestinoDelMovimiento };
}

/** Un viaje de vuelta: llevar `correos` de `desde` (adonde fueron) a `hacia`
 *  (de donde salieron). Cada correo ya trae el uid que tiene en `desde`. */
export interface Vuelta {
  desde: string;
  hacia: string;
  correos: MailSummary[];
}

/** Un correo que la edge no ubicó en el destino: se busca su fila en la caché. */
export interface SinUbicar {
  desde: string;
  hacia: string;
  correo: MailSummary;
}

const esUid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/** El mapa uid viejo → uid nuevo, sin pares rotos: si dos correos dicen haber
 *  ido a parar al mismo uid, no se usa ninguno de los dos. */
function mapaConfiable(pares: [number, number][] | undefined): Map<number, number> {
  const veces = new Map<number, number>();
  for (const [v, n] of pares ?? []) if (esUid(v) && esUid(n)) veces.set(n, (veces.get(n) ?? 0) + 1);
  const mapa = new Map<number, number>();
  for (const [v, n] of pares ?? []) {
    if (esUid(v) && esUid(n) && veces.get(n) === 1 && !mapa.has(v)) mapa.set(v, n);
  }
  return mapa;
}

/** Junta los viajes por (desde, hacia): una llamada por par de carpetas. */
export function juntarVueltas(vueltas: Vuelta[]): Vuelta[] {
  const porPar = new Map<string, Vuelta>();
  for (const v of vueltas) {
    if (!v.correos.length) continue;
    const k = `${v.desde}\u0000${v.hacia}`;
    const ya = porPar.get(k);
    if (ya) ya.correos.push(...v.correos);
    else porPar.set(k, { desde: v.desde, hacia: v.hacia, correos: [...v.correos] });
  }
  return [...porPar.values()];
}

/** Cómo deshacer lo que se MOVIÓ: qué llevar de vuelta, desde dónde y con qué
 *  uid; y lo que la edge no supo ubicar (eso se busca en la caché). */
export function planDeVuelta(
  op: OperacionMasiva,
  dest: string | undefined,
  grupos: GrupoHecho[],
): { vueltas: Vuelta[]; sinUbicar: SinUbicar[] } {
  const vueltas: Vuelta[] = [];
  const sinUbicar: SinUbicar[] = [];
  if (!mueve(op)) return { vueltas, sinUbicar };
  for (const g of grupos) {
    if (!sePuedeDeshacer(op, g.origen)) continue;
    const desde = carpetaDeDestino(op, dest, g.respuesta?.destino);
    if (!desde || desde === g.origen) continue;
    const mapa = mapaConfiable(g.respuesta?.destino?.mapa);
    const correos: MailSummary[] = [];
    for (const m of g.correos) {
      const viejo = uidDe(m);
      // Sin uid no se mandó: sigue donde estaba, no hay nada que devolver.
      if (viejo == null) continue;
      const nuevo = mapa.get(viejo);
      if (nuevo) correos.push({ ...m, uid: nuevo, folder: desde });
      else sinUbicar.push({ desde, hacia: g.origen, correo: m });
    }
    vueltas.push({ desde, hacia: g.origen, correos });
  }
  return { vueltas: juntarVueltas(vueltas), sinUbicar };
}

/** Una fila de la caché, como la devuelve la búsqueda de respaldo. */
export interface FilaEnCache {
  id: string;
  folder: string;
  uid: number;
}

/** El respaldo cuando la edge no dijo el uid nuevo (una edge anterior, o un
 *  servidor sin COPYUID): la fila de la caché.
 *
 *  ⚠️ Por el `id` de la FILA, no por el Message-ID. Al mover, la edge traslada
 *  esa misma fila a su carpeta nueva con el uid de allá; el `id` no cambia. El
 *  Message-ID, en cambio, puede estar dos veces en la carpeta de destino (una
 *  copia que ya estaba ahí): elegir por él podría devolver la copia que nadie
 *  movió. Lo que no aparece así se queda donde está, y se avisa. */
export function ubicarEnCache(
  sinUbicar: SinUbicar[],
  filas: FilaEnCache[],
): { vueltas: Vuelta[]; perdidos: SinUbicar[] } {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const vueltas: Vuelta[] = [];
  const perdidos: SinUbicar[] = [];
  for (const s of sinUbicar) {
    const f = s.correo.id ? porId.get(s.correo.id) : undefined;
    if (f && f.folder === s.desde && esUid(Number(f.uid))) {
      vueltas.push({ desde: s.desde, hacia: s.hacia, correos: [{ ...s.correo, uid: Number(f.uid), folder: s.desde }] });
    } else {
      perdidos.push(s);
    }
  }
  return { vueltas: juntarVueltas(vueltas), perdidos };
}

/** Leer / no leer: SOLO los que cambiaron. Si de cinco seleccionados dos ya
 *  estaban leídos, deshacer «marcar como leído» no puede dejar sin leer esos
 *  dos. Devuelve la operación contraria y a quiénes aplicarla. */
export function banderasDeVuelta(
  op: OperacionMasiva,
  correos: MailSummary[],
): { op: "seen" | "unseen"; correos: MailSummary[] } | null {
  if (op === "seen") return { op: "unseen", correos: correos.filter((m) => m.unread && uidDe(m) != null) };
  if (op === "unseen") return { op: "seen", correos: correos.filter((m) => !m.unread && uidDe(m) != null) };
  return null;
}

/** Poner o sacar una etiqueta a varios correos (por Message-ID). */
export interface CambioDeEtiqueta {
  messageIds: string[];
  labelId: string;
  poner: boolean;
}

/** Lo contrario de un cambio de etiqueta, SOLO para los que cambiaron: si ya
 *  la tenían, deshacer «ponerla» no se la puede sacar. `tenian` dice qué
 *  etiquetas tenía cada correo ANTES de la acción. */
export function etiquetaDeVuelta(
  cambio: CambioDeEtiqueta,
  tenian: (messageId: string) => readonly string[],
): CambioDeEtiqueta | null {
  const cambiaron = [...new Set(cambio.messageIds.filter(Boolean))]
    .filter((id) => tenian(id).includes(cambio.labelId) !== cambio.poner);
  return cambiaron.length ? { messageIds: cambiaron, labelId: cambio.labelId, poner: !cambio.poner } : null;
}

/** Vuelve a poner en una lista lo que la acción sacó (o cambió), en el MISMO
 *  lugar donde estaba: detrás del que lo precedía en la foto de antes.
 *
 *  - Lo que vuelve y no está: se inserta.
 *  - Lo que vuelve y sigue ahí (una bandera que cambió): se repone como era.
 *  - Lo demás —incluido lo que llegó mientras tanto— no se toca. */
export function reponerEnLista<T>(
  ahora: T[],
  antes: T[],
  vuelven: Set<string>,
  clave: (m: T) => string,
): T[] {
  const deAntes = antes.filter((m) => vuelven.has(clave(m)));
  if (!deAntes.length) return ahora;
  const salida = ahora.map((m) => {
    if (!vuelven.has(clave(m))) return m;
    return deAntes.find((a) => clave(a) === clave(m)) ?? m;
  });
  const presentes = new Set(salida.map(clave));
  for (const m of deAntes) {
    if (presentes.has(clave(m))) continue;
    const i = antes.indexOf(m);
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = salida.findIndex((x) => clave(x) === clave(antes[j]));
      if (k >= 0) { pos = k + 1; break; }
    }
    salida.splice(pos, 0, m);
    presentes.add(clave(m));
  }
  return salida;
}
