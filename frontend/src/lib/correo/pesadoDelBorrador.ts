// Lo PESADO del borrador local del Correo: los adjuntos y las imágenes pegadas.
//
// El autoguardado (mailDraft.ts) vive en localStorage, que solo guarda texto y
// tiene ~5 MB para TODO el sitio: una captura lo revienta. Por eso el borrador
// se recuperaba sin adjuntos y con «[imagen pegada — se perdió…]» donde había
// una imagen (Keila, 08/10: «los adjuntos de un borrador no se guardan»).
//
// Acá va lo pesado, en dos niveles, como el Messenger (adjuntosDelBorrador.ts):
//   · MEMORIA: cerrar el compositor y volver a abrirlo en la misma pestaña lo
//     encuentra YA, sin esperar a nada.
//   · IndexedDB: sobrevive a recargar o cerrar la pestaña.
//
// El HTML de localStorage nombra cada imagen por su huella
// (`src="borrador:<huella>"`); acá está la imagen de cada huella. Si IndexedDB no
// la tiene (otro equipo, se borró el sitio), vuelve la marca de «se perdió».
//
// ⚠️ IndexedDB SIEMPRE con tiempo límite: en WebKit un pedido puede no
// contestar nunca (el mismo cuelgue del fondo virtual, fondoDeLlamada.ts). Un
// borrador sin lo pesado es un borrador con texto; un compositor colgado no.

export interface AdjuntoDelBorrador {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentBase64: string;
}

export interface PesadoDelBorrador {
  adjuntos: AdjuntoDelBorrador[];
  /** huella → la imagen entera, en `data:`. */
  imagenes: Record<string, string>;
}

// ── Las imágenes dentro del HTML ───────────────────────────────────────────

const ESQUEMA = "borrador:";
const IMG_DATA = /(<img\b[^>]*?\bsrc\s*=\s*")(data:[^"]+)(")/gi;
const IMG_GUARDADA = /<img\b[^>]*?\bsrc\s*=\s*"borrador:([a-z0-9-]+)"[^>]*>/gi;

/** Huella de una imagen: su largo y un FNV-1a de 32 bits. Dos capturas
 *  distintas con el mismo largo Y el mismo hash no van a pasar. */
export function huellaDe(dataUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i++) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${dataUrl.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/** Saca las imágenes pegadas del HTML: queda liviano para localStorage, con
 *  cada imagen nombrada por su huella. */
export function separarImagenes(html: string): { html: string; imagenes: Record<string, string> } {
  const imagenes: Record<string, string> = {};
  const liviano = html.replace(IMG_DATA, (_e, antes: string, dataUrl: string, despues: string) => {
    const h = huellaDe(dataUrl);
    imagenes[h] = dataUrl;
    return `${antes}${ESQUEMA}${h}${despues}`;
  });
  return { html: liviano, imagenes };
}

/** Vuelve a poner cada imagen en su lugar. La que no está se cambia por la
 *  marca: una imagen con `src="borrador:…"` se vería rota y, peor, saldría así
 *  en el correo. */
export function devolverImagenes(html: string, imagenes: Record<string, string>, marca: string): string {
  const escapada = marca.replace(/[<>&]/g, (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;"));
  return html.replace(IMG_GUARDADA, (tag: string, h: string) => {
    const dataUrl = imagenes[h];
    if (!dataUrl) return `<p><em>${escapada}</em></p>`;
    return tag.replace(`${ESQUEMA}${h}`, dataUrl);
  });
}

// ── Memoria ────────────────────────────────────────────────────────────────

const NOMBRE_DB = "mvn-correo-borradores";
const ALMACEN = "pesado";
const ESPERA_ABRIR_DB_MS = 3_000;
const ESPERA_LEER_MS = 5_000;
const ESPERA_ESCRIBIR_MS = 20_000;
/** Un borrador que nadie tocó en un mes se tira al abrir la base. */
export const VIDA_MAX_MS = 30 * 24 * 60 * 60 * 1000;

interface Fila extends PesadoDelBorrador {
  clave: string;
  actualizado: number;
}

const clave = (email: string, firma: string) => `${email.toLowerCase()}:${firma}`;

/** Lo último anotado por clave —también «nada», que es saber algo—, con una
 *  firma barata de su contenido para no reescribir el disco cuando no cambió
 *  nada (el autoguardado corre a cada pausa al escribir, y lo pesado son
 *  megas). */
const enMemoria = new Map<string, { pesado: PesadoDelBorrador; firma: string }>();

function firmaDe(p: PesadoDelBorrador): string {
  const adj = p.adjuntos.map((a) => `${a.filename}:${a.sizeBytes}:${a.contentBase64.length}`).join("|");
  return `${adj}#${Object.keys(p.imagenes).sort().join("|")}`;
}

const vacio = (p: PesadoDelBorrador) => p.adjuntos.length === 0 && Object.keys(p.imagenes).length === 0;

/** Sincrónico: lo de esta pestaña (vacío = se sabe que no hay nada), o null
 *  si esta pestaña todavía no sabe: hay que preguntarle al disco. */
export function pesadoEnMemoria(email: string, firma: string): PesadoDelBorrador | null {
  return enMemoria.get(clave(email, firma))?.pesado ?? null;
}

// ── IndexedDB ──────────────────────────────────────────────────────────────

let dbPromesa: Promise<IDBDatabase | null> | null = null;
let barridoHecho = false;

function abrirDb(): Promise<IDBDatabase | null> {
  dbPromesa ??= new Promise<IDBDatabase | null>((resolver) => {
    let listo = false;
    const olvidar = () => { dbPromesa = null; };
    // El reloj va ANTES de `terminar`, que lo apaga (uso-antes-de-declarar ya
    // tumbó producción dos veces en este repo).
    const reloj = setTimeout(() => {
      if (listo) return;
      listo = true;
      olvidar(); // sin esto, un cuelgue pasajero duraba toda la pestaña
      resolver(null);
    }, ESPERA_ABRIR_DB_MS);
    const terminar = (db: IDBDatabase | null) => {
      if (listo) {
        if (db) { try { db.close(); } catch { /* ya cerrada */ } }
        return;
      }
      listo = true;
      clearTimeout(reloj);
      if (!db) olvidar();
      resolver(db);
    };
    try {
      if (typeof indexedDB === "undefined") return terminar(null);
      const pedido = indexedDB.open(NOMBRE_DB, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: "clave" });
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        db.onclose = olvidar;
        db.onversionchange = () => { try { db.close(); } catch { /* ya cerrada */ } olvidar(); };
        terminar(db);
      };
      pedido.onerror = () => terminar(null);
      pedido.onblocked = () => terminar(null);
    } catch {
      terminar(null);
    }
  });
  return dbPromesa;
}

type Resultado<T> = { ok: true; valor: T | undefined } | { ok: false };

function conAlmacen<T>(
  modo: IDBTransactionMode,
  espera: number,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<Resultado<T>> {
  return abrirDb().then((db) => {
    if (!db) return { ok: false as const };
    return new Promise<Resultado<T>>((resolver) => {
      const reloj = setTimeout(() => resolver({ ok: false }), espera);
      const contestar = (r: Resultado<T>) => { clearTimeout(reloj); resolver(r); };
      try {
        const tx = db.transaction(ALMACEN, modo);
        const pedido = fn(tx.objectStore(ALMACEN));
        let valor: T | undefined;
        if (pedido) {
          pedido.onsuccess = () => {
            valor = pedido.result as T;
            if (modo === "readonly") contestar({ ok: true, valor });
          };
          pedido.onerror = () => contestar({ ok: false });
        }
        // Una ESCRITURA recién está hecha cuando la transacción confirma: el
        // `put` puede salir bien y la transacción abortar (cuota llena).
        tx.oncomplete = () => contestar({ ok: true, valor });
        tx.onabort = () => contestar({ ok: false });
        tx.onerror = () => contestar({ ok: false });
      } catch {
        contestar({ ok: false });
      }
    });
  });
}

/** Tira los borradores viejos. Una vez por pestaña; si falla, da igual. */
function barrerViejos(ahora: number) {
  if (barridoHecho) return;
  barridoHecho = true;
  void conAlmacen<void>("readwrite", ESPERA_ESCRIBIR_MS, (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const fila = c.value as Fila;
      if (!fila || typeof fila.actualizado !== "number" || ahora - fila.actualizado > VIDA_MAX_MS) c.delete();
      c.continue();
    };
  });
}

// Las escrituras se encadenan: guardar [a] y enseguida [] tiene que terminar en
// []. Sin la cola, una escritura grande que tarda podría confirmar DESPUÉS del
// borrado y resucitar un adjunto de un correo que ya salió.
let cola: Promise<unknown> = Promise.resolve();

// ── API ────────────────────────────────────────────────────────────────────

/** Anota lo pesado del borrador de ese buzón+contexto. Vacío = no hay. */
export function guardarPesado(email: string, firma: string, pesado: PesadoDelBorrador): Promise<unknown> {
  const k = clave(email, firma);
  const f = firmaDe(pesado);
  // ⚠️ Sin nada anotado y vacío TAMBIÉN se escribe (un borrado): en el disco
  // puede haber adjuntos de antes de recargar que la persona acaba de quitar,
  // y si quedaran volverían a aparecer. Es una vez por compositor: después la
  // memoria ya sabe que no hay nada.
  if (enMemoria.get(k)?.firma === f) return cola;
  enMemoria.set(k, { pesado, firma: f });
  cola = cola.then(() =>
    conAlmacen<void>("readwrite", ESPERA_ESCRIBIR_MS, (store) => {
      if (vacio(pesado)) return store.delete(k);
      const fila: Fila = { clave: k, actualizado: Date.now(), ...pesado };
      return store.put(fila);
    }),
  );
  return cola;
}

export function olvidarPesado(email: string, firma: string): Promise<unknown> {
  return guardarPesado(email, firma, { adjuntos: [], imagenes: {} });
}

/** Lo pesado guardado: memoria primero y si no, el disco (viene de una
 *  recarga). Nunca tira y nunca se cuelga: ante cualquier problema o si no hay
 *  nada, null. */
export async function cargarPesado(email: string, firma: string): Promise<PesadoDelBorrador | null> {
  const k = clave(email, firma);
  const mem = enMemoria.get(k);
  if (mem) return vacio(mem.pesado) ? null : mem.pesado;

  const ahora = Date.now();
  // Se espera a que terminen las escrituras en curso: leer en medio devolvería
  // lo de antes.
  await cola.catch(() => {});
  const r = await conAlmacen<Fila>("readonly", ESPERA_LEER_MS, (store) => store.get(k));
  barrerViejos(ahora);
  if (!r.ok || !r.valor) return null;
  const fila = r.valor;
  if (!Array.isArray(fila.adjuntos) || !fila.imagenes || typeof fila.imagenes !== "object") return null;
  if (ahora - fila.actualizado > VIDA_MAX_MS) return null;
  // Entre tanto pudo anotarse algo en memoria: la memoria manda.
  const memAhora = enMemoria.get(k);
  if (memAhora) return vacio(memAhora.pesado) ? null : memAhora.pesado;
  const pesado = { adjuntos: fila.adjuntos, imagenes: fila.imagenes };
  enMemoria.set(k, { pesado, firma: firmaDe(pesado) });
  return pesado;
}

/** Solo para tests: vuelve el módulo a cero. */
export function __reiniciarParaTests() {
  enMemoria.clear();
  dbPromesa = null;
  barridoHecho = false;
  cola = Promise.resolve();
}
