// Adjuntos del borrador: la captura que pegaste (o el archivo que elegiste) y
// todavía no mandaste sobrevive a irte a otro chat y a recargar la página.
//
// Antes vivían solo en el estado del cajón, y el cajón se remonta al cambiar de
// conversación (MessengerPage le pone `key` por chat): salir era perderlos
// (reporte del 28/09: "si tengo una imagen copiada y me salgo, me la borra").
//
// Dos niveles, porque los dos casos piden cosas distintas:
//   · MEMORIA, por conversación: guarda el `File` tal cual, de cualquier tamaño y
//     sin copiarlo. Cubre cambiar de chat o de módulo dentro de la misma pestaña.
//   · IndexedDB: cubre recargar o cerrar la pestaña. localStorage no sirve (solo
//     texto, ~5 MB para TODO el sitio). Con topes: el chat acepta archivos de
//     hasta 1 GB y no se le puede llenar el disco a nadie con un video olvidado.
//     Lo que no entra en el tope sigue vivo en memoria; solo se pierde al recargar.
//
// ⚠️ IndexedDB SIEMPRE con tiempo límite: en WebKit un pedido puede no contestar
// nunca (mismo cuelgue que tenía el fondo virtual, fondoDeLlamada.ts). Un
// borrador que no se pudo leer es un borrador vacío; un cajón colgado no.

import { setDraftAttachmentCount } from "./drafts";

const NOMBRE_DB = "mvn-messenger-borradores";
const ALMACEN = "adjuntos";
const ESPERA_ABRIR_DB_MS = 3_000;
const ESPERA_LEER_MS = 5_000;
const ESPERA_ESCRIBIR_MS = 20_000;

/** Un archivo más grande que esto no se copia al disco (sí queda en memoria). */
export const TOPE_POR_ARCHIVO_BYTES = 25 * 1024 * 1024;
/** Tope de lo copiado al disco por conversación. */
export const TOPE_TOTAL_BYTES = 50 * 1024 * 1024;
/** Un borrador que nadie tocó en una semana se tira al abrir la base. */
export const VIDA_MAX_MS = 7 * 24 * 60 * 60 * 1000;

interface ArchivoGuardado {
  nombre: string;
  tipo: string;
  modificado: number;
  datos: Blob;
}

interface FilaAdjuntos {
  clave: string;
  archivos: ArchivoGuardado[];
  actualizado: number;
}

const clave = (userId: string, conversationId: string) => `${userId}:${conversationId}`;

// ── Memoria ────────────────────────────────────────────────────────────────

const enMemoria = new Map<string, File[]>();

/** Lo que hay en memoria para esa conversación, o null si no hay nada anotado.
 *  Sincrónico: el cajón arranca YA con las miniaturas, sin parpadeo. */
export function adjuntosEnMemoria(userId: string | undefined, conversationId: string): File[] | null {
  if (!userId) return null;
  return enMemoria.get(clave(userId, conversationId)) ?? null;
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

type Resultado<T> = { ok: true; valor: T } | { ok: false };

function conAlmacen<T>(
  modo: IDBTransactionMode,
  espera: number,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<Resultado<T | undefined>> {
  return abrirDb().then((db) => {
    if (!db) return { ok: false as const };
    return new Promise<Resultado<T | undefined>>((resolver) => {
      const reloj = setTimeout(() => resolver({ ok: false }), espera);
      const contestar = (r: Resultado<T | undefined>) => { clearTimeout(reloj); resolver(r); };
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
      const fila = c.value as FilaAdjuntos;
      if (!fila || typeof fila.actualizado !== "number" || ahora - fila.actualizado > VIDA_MAX_MS) c.delete();
      c.continue();
    };
  });
}

/**
 * Qué archivos se copian al disco: en orden, mientras quepan en los topes. Los
 * que no entran NO se pierden en la pestaña (siguen en memoria): solo no
 * sobreviven a recargar.
 */
export function elegirParaDisco(archivos: File[]): File[] {
  const elegidos: File[] = [];
  let total = 0;
  for (const f of archivos) {
    if (f.size > TOPE_POR_ARCHIVO_BYTES) continue;
    if (total + f.size > TOPE_TOTAL_BYTES) continue;
    total += f.size;
    elegidos.push(f);
  }
  return elegidos;
}

// Las escrituras se encadenan: guardar [a] y enseguida [] tiene que terminar en
// []. Sin la cola, una escritura grande que tarda podría confirmar DESPUÉS del
// borrado y resucitar un adjunto que ya se mandó.
let cola: Promise<unknown> = Promise.resolve();

function escribirEnDisco(k: string, archivos: File[]) {
  const paraDisco = elegirParaDisco(archivos);
  cola = cola.then(() =>
    conAlmacen<void>("readwrite", ESPERA_ESCRIBIR_MS, (store) => {
      if (paraDisco.length === 0) return store.delete(k);
      const fila: FilaAdjuntos = {
        clave: k,
        actualizado: Date.now(),
        archivos: paraDisco.map((f) => ({ nombre: f.name, tipo: f.type, modificado: f.lastModified, datos: f })),
      };
      return store.put(fila);
    }),
  );
  return cola;
}

// ── API ────────────────────────────────────────────────────────────────────

/** Anota los adjuntos pendientes de la conversación (vacío = no hay). */
export function guardarAdjuntos(userId: string | undefined, conversationId: string, archivos: File[]): Promise<unknown> {
  if (!userId) return Promise.resolve();
  const k = clave(userId, conversationId);
  // Sin cambios, no se reescribe el disco: el cajón vuelve a anotar lo mismo
  // cada vez que se abre el chat, y eso son hasta 50 MB por visita.
  const antes = enMemoria.get(k) ?? [];
  if (antes.length === archivos.length && antes.every((f, i) => f === archivos[i])) return cola;
  if (archivos.length > 0) enMemoria.set(k, [...archivos]);
  else enMemoria.delete(k);
  setDraftAttachmentCount(userId, conversationId, archivos.length);
  return escribirEnDisco(k, archivos);
}

export function olvidarAdjuntos(userId: string | undefined, conversationId: string): Promise<unknown> {
  return guardarAdjuntos(userId, conversationId, []);
}

/**
 * Adjuntos guardados de la conversación: memoria primero (misma pestaña) y si
 * no, el disco (vienen de una recarga). Nunca tira y nunca se cuelga: ante
 * cualquier problema devuelve [].
 */
export async function cargarAdjuntos(userId: string | undefined, conversationId: string): Promise<File[]> {
  if (!userId) return [];
  const k = clave(userId, conversationId);
  const mem = enMemoria.get(k);
  if (mem) return [...mem];

  const ahora = Date.now();
  // Se espera a que terminen las escrituras en curso: leer en medio devolvería
  // lo de antes.
  await cola.catch(() => {});
  const r = await conAlmacen<FilaAdjuntos>("readonly", ESPERA_LEER_MS, (store) => store.get(k));
  barrerViejos(ahora);
  if (!r.ok || !r.valor) return [];
  const fila = r.valor;
  if (!Array.isArray(fila.archivos) || ahora - fila.actualizado > VIDA_MAX_MS) return [];
  // Entre tanto pudo haberse anotado algo en memoria (se pegó otra imagen): la
  // memoria manda.
  const memAhora = enMemoria.get(k);
  if (memAhora) return [...memAhora];
  const archivos = fila.archivos
    .filter((a) => a && a.datos instanceof Blob)
    .map((a) => new File([a.datos], a.nombre, { type: a.tipo, lastModified: a.modificado }));
  if (archivos.length > 0) enMemoria.set(k, archivos);
  return [...archivos];
}

/** Solo para tests: vuelve el módulo a cero. */
export function __reiniciarParaTests() {
  enMemoria.clear();
  dbPromesa = null;
  barridoHecho = false;
  cola = Promise.resolve();
}
