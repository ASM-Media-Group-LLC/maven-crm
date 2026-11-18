// El fondo virtual de las llamadas: qué fondos hay, cuánto difumina cada nivel
// y —lo nuevo (09/09/2026)— que la elección de cada persona SOBREVIVA.
//
// Antes: la elección vivía en un `useState` de la vista de llamada y en otro del
// lobby, los dos arrancando en "none". Salías de la llamada y se perdía; la
// imagen que subías era un `URL.createObjectURL`, o sea un `blob:` que muere al
// recargar la pestaña. Reportado por Jhon: "el fondo que escoge no se guarda,
// cuando ponen una imagen personalizada tampoco se guarda".
//
// Ahora: la elección va a localStorage y las imágenes propias a IndexedDB (los
// BYTES, no una URL). Al entrar a cualquier llamada —Meet, Cowork, videollamada
// del Messenger, invitado— se arranca con lo último que la persona eligió.
//
// Este módulo NO importa React a propósito: lo usan el hook `useLiveKit`, el
// lobby y el selector. Es también el dueño del tipo y de la lista de plantillas
// (antes vivían en `BackgroundSelector.tsx`, que ahora los re-exporta para no
// tocar a los seis archivos que ya los importaban de ahí).

import type { TranslationKey } from "@/lib/i18n";
import { conEtiqueta } from "@/lib/etiquetaTraducida";

/** "none" | "blur" | "blur-strong" | "<id de plantilla>" | "custom:<id>" */
export type BackgroundEffect = "none" | "blur" | "blur-strong" | string;

// `id` es el dato (se guarda en localStorage como la elección de la persona). El
// nombre sale del diccionario: `label` se traduce al leerlo (ver
// lib/etiquetaTraducida.ts) con las mismas claves que usa nombreDelFondo().
const plantilla = (id: string, labelKey: TranslationKey, archivo: string) =>
  conEtiqueta({ id, src: `/backgrounds/${archivo}`, lowSrc: `/backgrounds/low/${archivo}` }, labelKey);

export const BACKGROUND_TEMPLATES = [
  plantilla("tpl-office", "messenger.bg.tplOficina", "bg-office.jpg"),
  plantilla("tpl-bookshelf", "messenger.bg.tplBiblioteca", "bg-bookshelf.jpg"),
  plantilla("tpl-beach", "messenger.bg.tplPlaya", "bg-beach.jpg"),
  plantilla("tpl-mountains", "messenger.bg.tplMontanas", "bg-mountains.jpg"),
  plantilla("tpl-cafe", "messenger.bg.tplCafe", "bg-cafe.jpg"),
  plantilla("tpl-livingroom", "messenger.bg.tplSala", "bg-livingroom.jpg"),
  plantilla("tpl-forest", "messenger.bg.tplBosque", "bg-forest.jpg"),
  plantilla("tpl-abstract", "messenger.bg.tplAbstracto", "bg-abstract.jpg"),
];

// ── Niveles de difuminado ────────────────────────────────────────────────────
//
// DOS niveles, como Google Meet: «un poco» y «fuerte» (Alvaro, 17/11/2026: «se
// siente como una porquería, no como Google»). Desde ese día el fondo lo pinta
// NUESTRO procesador (lib/fondoFino/), no el de `@livekit/track-processors`, y
// el número ya no es el «radio» de aquel paquete (que se dividía por 4 y se
// topaba en 16 muestras: 20 apenas se notaba y 64 era el techo).
//
// Ahora el número es la SIGMA de un desenfoque gaussiano de verdad, en píxeles
// de una imagen de 720 de alto (a 540p se escala solo, así se ve igual en todos
// los equipos). Para tener una idea: una gaussiana de sigma s se parece a
// promediar una ventana de ~2,5·s píxeles.
//
//   · «blur» (un poco): sigma 22 ≈ ventana de ~55 px a 720p. El fondo queda
//     claramente borroso pero se adivina dónde estás (el «difuminar un poco»
//     de Meet).
//   · «blur-strong» (fuerte): sigma 56 ≈ ventana de ~140 px. Ya no se reconoce
//     nada del cuarto: ni letras, ni marcos, ni objetos; solo manchas de color.
//
// Para comparar: el shader viejo cortaba el gaussiano en 1 sigma (ventana de
// ±radio/4 a 1/4 de resolución), así que su «20» desenfocaba como una sigma de
// ~11 px y su «64» como una de ~35 px. Medido lado a lado con capturas.
//
// Costo: el desenfoque corre a 1/4 de resolución con dos pasadas separables;
// el fuerte lee 3·sigma/4 = 42 muestras por lado y por pasada sobre 320×180
// píxeles: una fracción de milisegundo en la GPU.
export const RADIO_DE_BLUR: Record<string, number> = {
  blur: 22,
  "blur-strong": 56,
};

// ── Cámara con fondo: HD en equipos fuertes ──────────────────────────────────
//
// Antes, cualquier fondo bajaba la cámara a 960×540 a 15 cuadros para no
// congelar el video. Alvaro (17/11/2026) eligió «caras en HD con el blur en las
// máquinas fuertes»: con 8 núcleos o más (la misma vara que
// NUCLEOS_PARA_DEEPFILTER en lib/deepfilter.ts) la cámara sigue a 1280×720 a
// 30 cuadros con el fondo puesto; los equipos más flojos y los celulares se
// quedan con el perfil liviano de siempre.
export const NUCLEOS_PARA_FONDO_HD = 8;

export const PERFIL_FONDO_HD = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
} as const;

export const PERFIL_FONDO_LIVIANO = {
  width: { ideal: 960, max: 960 },
  height: { ideal: 540, max: 540 },
  frameRate: { ideal: 15, max: 15 },
} as const;

type EquipoParaFondo = { hardwareConcurrency?: number; userAgent?: string } | undefined;

function equipoActual(): EquipoParaFondo {
  return typeof navigator === "undefined" ? undefined : navigator;
}

/** ¿El equipo aguanta el fondo en HD? 8+ núcleos y no es celular. */
export function equipoAguantaFondoHD(equipo: EquipoParaFondo = equipoActual()): boolean {
  if (!equipo?.hardwareConcurrency || equipo.hardwareConcurrency < NUCLEOS_PARA_FONDO_HD) return false;
  // En el celular la batería y el calor pesan más (igual que con DeepFilterNet).
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(equipo.userAgent ?? "")) return false;
  return true;
}

/** Restricciones de la cámara mientras hay un fondo puesto. */
export function perfilDeCamaraConFondo(equipo: EquipoParaFondo = equipoActual()) {
  return equipoAguantaFondoHD(equipo) ? PERFIL_FONDO_HD : PERFIL_FONDO_LIVIANO;
}

/**
 * Cada cuántos cuadros se corre el detector de la persona. En los fuertes, en
 * todos (30 por segundo); en los flojos, uno sí y uno no (7-8 por segundo sobre
 * la cámara a 15). Entre medio se reusa la última máscara, que igual se
 * suaviza en el tiempo, así que no se nota.
 */
export function cadaCuantosCuadrosSegmentar(equipo: EquipoParaFondo = equipoActual()): 1 | 2 {
  return equipoAguantaFondoHD(equipo) ? 1 : 2;
}

export function esBlur(effect: BackgroundEffect): boolean {
  return effect === "blur" || effect === "blur-strong";
}

/** Sigma (px a 720p) para `processor.switchTo({ mode: "background-blur", blurRadius })`. */
export function radioDeBlur(effect: BackgroundEffect): number {
  return RADIO_DE_BLUR[effect] ?? RADIO_DE_BLUR.blur;
}

/**
 * Qué fondo pone el botón rápido de difuminar de la barra. Ese botón es de dos
 * estados (encendido/apagado) porque la barra tiene el ancho medido y no admite
 * otro control; el NIVEL se elige en "Fondos y efectos".
 *
 * Devuelve el ÚLTIMO nivel que la persona eligió, no siempre el normal: antes
 * apagaba "Difuminar más" y lo volvía a encender como "Difuminar", sin decir
 * nada y perdiendo la preferencia también para la próxima llamada.
 */
export function alternarBlur(actual: BackgroundEffect, ultimoNivel: BackgroundEffect): BackgroundEffect {
  if (esBlur(actual)) return "none";
  return esBlur(ultimoNivel) ? ultimoNivel : "blur";
}

export function isCustomBackground(effect: BackgroundEffect): boolean {
  return typeof effect === "string" && effect.startsWith("custom:");
}

export function getCustomBackgroundUrl(effect: BackgroundEffect): string {
  return effect.replace(/^custom:/, "");
}

/**
 * ⚠️ Tiene que excluir TODOS los niveles de blur. Con el chequeo viejo
 * (`effect !== "blur"`), "blur-strong" caía acá, se buscaba como plantilla, no
 * se encontraba y el fondo simplemente no se aplicaba — en silencio.
 */
export function isTemplateBackground(effect: BackgroundEffect): boolean {
  return effect !== "none" && !esBlur(effect) && !isCustomBackground(effect);
}

// ── La elección, guardada ────────────────────────────────────────────────────

// ── De quién es cada fondo ──────────────────────────────────────────────────
//
// ⚠️ Esto NO puede ser "por navegador" a secas. Un fondo propio es una FOTO DEL
// CUARTO de alguien, y las máquinas se comparten entre turnos: sin la identidad
// adentro de la clave, la persona A cerraba sesión, entraba B y B aparecía en su
// reunión con la foto del cuarto de A —que la sala entera veía— y además la veía
// listada en "Tus fondos" y podía borrársela. La preferencia de cancelación de
// ruido sí puede ser por navegador, porque es un booleano; esto no.
//
// El módulo no importa nada a propósito (lo usa el hook, que no puede depender
// de este archivo si trae React), así que la identidad se la INYECTA el
// AuthProvider. Sin identidad —el invitado de Meet, que no tiene cuenta— se usa
// el espacio anónimo, que es lo mismo que había antes para él.
let duenoActual = "";

export function fijarDuenoDeFondos(userId: string | null | undefined): void {
  duenoActual = userId || "";
}

export function duenoDeFondos(): string {
  return duenoActual;
}

const CLAVE_FONDO_BASE = "call-background-effect";

function claveDelFondo(): string {
  return duenoActual ? `${CLAVE_FONDO_BASE}:${duenoActual}` : CLAVE_FONDO_BASE;
}

/**
 * El fondo con el que arranca cualquier llamada. Mismo patrón que la
 * preferencia de cancelación de ruido: por navegador, en try/catch porque en
 * incógnito y con las cookies bloqueadas `localStorage` LANZA al leerlo.
 *
 * Un `custom:blob:...` guardado por una versión vieja se descarta: esa URL ya
 * no apunta a nada.
 */
export function leerFondoGuardado(): BackgroundEffect {
  try {
    const val = localStorage.getItem(claveDelFondo());
    if (!val) return "none";
    if (val.startsWith("custom:blob:") || val.startsWith("custom:http")) return "none";
    return val;
  } catch {
    return "none";
  }
}

export function guardarFondo(effect: BackgroundEffect): void {
  try {
    if (!effect || effect === "none") localStorage.removeItem(claveDelFondo());
    else localStorage.setItem(claveDelFondo(), effect);
  } catch { /* incógnito: se queda sin memoria, no se rompe */ }
}

// ── Los fondos propios, en IndexedDB ────────────────────────────────────────
//
// Van los BYTES, no una URL: es la única forma de que la imagen siga estando
// mañana. localStorage no sirve (cuota de ~5 MB para TODO el sitio y solo
// texto); IndexedDB guarda Blobs sin convertir a base64.

const NOMBRE_DB = "maven-fondos";
const ALMACEN = "fondos";
export const MAX_FONDOS_PROPIOS = 5;
/** Ancho máximo al guardar. El segmentador trabaja a ~480 px; más es peso al vicio. */
export const ANCHO_MAX_FONDO = 1280;

// Una URL por imagen y por pestaña. Sin este caché, cada re-aplicación del
// fondo crearía otra URL y ninguna se liberaría nunca.
const urlsVivas = new Map<string, string>();

export interface FondoPropio {
  id: string;
  blob: Blob;
  creado: number;
  /** Quién la subió. "" = sin cuenta (el invitado de Meet). */
  dueno?: string;
}

// Una sola conexión por pestaña, no una por operación: abrir en cada lectura
// deja conexiones colgadas durante toda la jornada y, peor, cualquier cambio de
// versión futuro del almacén quedaría trabado por ellas.
let dbPromesa: Promise<IDBDatabase | null> | null = null;

/** Cuánto se espera a que el navegador conteste el `open`. */
const ESPERA_ABRIR_DB_MS = 3_000;
/** Y a que confirme una lectura o una escritura. */
const ESPERA_ALMACEN_MS = 4_000;

/**
 * ⚠️ CON TIEMPO LÍMITE, y el límite además OLVIDA el caché.
 *
 * En WebKit un pedido de IndexedDB puede no disparar ni `onsuccess` ni
 * `onerror` — es el mismo motivo por el que la llamada y el lobby envuelven
 * `resolverImagenDeFondo` en `withTimeout`. Este `open` era el único punto del
 * camino que quedaba sin proteger, y con la promesa cacheada el cuelgue no era
 * recuperable: "Tus fondos" se veía VACÍO como si la persona no tuviera
 * ninguno, elegir una imagen no hacía nada y no salía ningún aviso, y eso
 * duraba toda la pestaña —ni reintentar servía—. Recargar era la única salida.
 */
function abrirDb(): Promise<IDBDatabase | null> {
  dbPromesa ??= new Promise<IDBDatabase | null>((resolver) => {
    let listo = false;
    const olvidar = () => { dbPromesa = null; };
    // El reloj va ANTES de `terminar`, que lo apaga: al revés eslint lo marca y
    // en este repo un uso-antes-de-declarar ya tumbó producción dos veces.
    const reloj = window.setTimeout(() => {
      if (listo) return;
      listo = true;
      olvidar();          // sin esto, el cuelgue duraba toda la pestaña
      resolver(null);
    }, ESPERA_ABRIR_DB_MS);
    const terminar = (db: IDBDatabase | null) => {
      if (listo) {
        // Llegó tarde, después de rendirnos: la conexión no la va a usar nadie.
        if (db) { try { db.close(); } catch { /* ya cerrada */ } }
        return;
      }
      listo = true;
      window.clearTimeout(reloj);
      if (!db) olvidar();
      resolver(db);
    };

    try {
      if (typeof indexedDB === "undefined") return terminar(null);
      const pedido = indexedDB.open(NOMBRE_DB, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: "id" });
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Si el navegador cierra la conexión (o otra pestaña pide una versión
        // nueva), se olvida y la próxima llamada vuelve a abrir.
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

/**
 * Resultado de tocar el almacén. La diferencia entre "no pude leer" y "no está"
 * NO es cosmética: si se confunden, un hipo del navegador BORRA la preferencia
 * de la persona y volvemos al problema que este módulo vino a resolver.
 */
type Lectura<T> = { ok: true; valor: T } | { ok: false };

function conAlmacen<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<Lectura<T>> {
  return abrirDb().then((db) => {
    if (!db) return { ok: false as const };
    return new Promise<Lectura<T>>((resolver) => {
      // Igual que el `open`: una transacción que no contesta no puede dejar la
      // promesa colgada. Se declara FUERA del try para que el catch también
      // pueda apagar el reloj.
      const reloj = window.setTimeout(() => resolver({ ok: false }), ESPERA_ALMACEN_MS);
      const contestar = (r: Lectura<T>) => { window.clearTimeout(reloj); resolver(r); };
      try {
        const tx = db.transaction(ALMACEN, modo);
        const pedido = fn(tx.objectStore(ALMACEN));
        let valor: T;
        pedido.onsuccess = () => {
          valor = pedido.result as T;
          // ⚠️ Una LECTURA ya terminó acá. Una ESCRITURA todavía no: el `put`
          // puede haber salido bien y la transacción abortar al confirmar (la
          // cuota se llenó). Reportarla como guardada dejaría a la persona
          // creyendo que su fondo está y no estaría.
          if (modo === "readonly") contestar({ ok: true, valor });
        };
        pedido.onerror = () => contestar({ ok: false });
        tx.oncomplete = () => contestar({ ok: true, valor });
        tx.onabort = () => contestar({ ok: false });
        tx.onerror = () => contestar({ ok: false });
      } catch {
        contestar({ ok: false });
      }
    });
  });
}

/** Los fondos de LA PERSONA que está usando la app, no los del navegador. */
export async function listarFondosPropios(): Promise<FondoPropio[]> {
  const r = await conAlmacen<FondoPropio[]>("readonly", (s) => s.getAll());
  const filas = r.ok ? (r.valor ?? []) : [];
  return filas
    .filter((f) => (f.dueno ?? "") === duenoActual)
    .sort((a, b) => a.creado - b.creado);
}

/**
 * Achica la imagen antes de guardarla. Una foto de celular son 4 MB y el
 * segmentador no aprovecha nada de eso: guardarla entera es llenarle el disco a
 * la persona para nada. Si el navegador no puede dibujar en canvas, se guarda
 * el archivo tal cual antes que perder la función.
 */
export async function achicarImagen(file: Blob, anchoMax = ANCHO_MAX_FONDO): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // El navegador no sabe decodificar esto (un .heic del iPhone en Chrome, un
    // .tiff). ANTES se guardaba el archivo tal cual y "funcionaba": la
    // miniatura salía rota y, ya en la llamada, la imagen no cargaba, el
    // procesador entraba en cooldown y la cámara publicaba la habitación real.
    // Mejor no aceptarla y decirlo.
    return null;
  }
  try {
    const escala = Math.min(1, anchoMax / bitmap.width);
    if (escala >= 1 && file.size < 400_000) { bitmap.close?.(); return file; }

    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();
    const tipo = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const chico = await new Promise<Blob | null>((r) => lienzo.toBlob((b) => r(b), tipo, 0.82));
    return chico && chico.size > 0 ? chico : file;
  } catch {
    return file;
  }
}

/** Por qué no se pudo guardar una imagen. El aviso al usuario sale de aquí. */
export type FalloAlGuardar = "limite" | "ilegible" | "sin-almacen";

/**
 * ⚠️ Forma PLANA, no una unión discriminada por `ok`. Este proyecto compila con
 * `strict: false`, y sin `strictNullChecks` TypeScript NO estrecha uniones por
 * un booleano: `if (r.ok)` deja el otro miembro inaccesible y no compila.
 */
export type ResultadoGuardar = { fondo: FondoPropio | null; motivo: FalloAlGuardar | null };

/**
 * Guarda una imagen propia. Devuelve el MOTIVO del fallo: antes todo era `null`
 * y el aviso decía siempre "ya tenés 5, borrá uno" — incluso con la lista vacía
 * y el almacenamiento bloqueado, que es cuando la persona más necesita saber
 * qué pasa.
 */
export async function guardarFondoPropio(file: Blob, ahora: number): Promise<ResultadoGuardar> {
  const yaHay = await listarFondosPropios();
  if (yaHay.length >= MAX_FONDOS_PROPIOS) return { fondo: null, motivo: "limite" };
  const blob = await achicarImagen(file);
  if (!blob) return { fondo: null, motivo: "ilegible" };
  // El id NO se reutiliza nunca. Si se reciclara (`f1` libre → `f1` de nuevo),
  // una elección guardada que apuntaba al fondo borrado pasaría a apuntar al
  // NUEVO: la persona vería en su cámara una imagen que no eligió.
  const mayor = yaHay.reduce((m, f) => Math.max(m, Number(String(f.id).split("-")[1]) || 0), 0);
  const fondo: FondoPropio = { id: `f${ahora}-${mayor + 1}`, blob, creado: ahora, dueno: duenoActual };
  const guardado = await conAlmacen("readwrite", (s) => s.put(fondo));
  if (!guardado.ok) return { fondo: null, motivo: "sin-almacen" };
  return { fondo, motivo: null };
}

export async function borrarFondoPropio(id: string): Promise<void> {
  const mio = await conAlmacen<FondoPropio | undefined>("readonly", (s) => s.get(id));
  if (mio.ok && mio.valor && (mio.valor.dueno ?? "") !== duenoActual) return;
  await conAlmacen("readwrite", (s) => s.delete(id));
  const url = urlsVivas.get(id);
  if (url) { URL.revokeObjectURL(url); urlsVivas.delete(id); }
}

/** La URL de una imagen propia; `null` si no está, `undefined` si no se pudo mirar. */
export async function urlDeFondoPropio(id: string): Promise<string | null | undefined> {
  const cacheada = urlsVivas.get(id);
  if (cacheada) return cacheada;
  const r = await conAlmacen<FondoPropio | undefined>("readonly", (s) => s.get(id));
  if (!r.ok) return undefined;          // el almacén no se pudo leer
  if (!r.valor?.blob) return null;      // la fila NO está: la imagen se borró
  // Cinturón y tirantes: la clave de la preferencia ya va por persona, pero un
  // id de otra cuenta jamás se sirve.
  if ((r.valor.dueno ?? "") !== duenoActual) return null;
  const url = URL.createObjectURL(r.valor.blob);
  urlsVivas.set(id, url);
  return url;
}

/**
 * La imagen que hay que pasarle al procesador para este fondo. Un solo lugar:
 * antes el hook y el lobby resolvían la URL cada uno por su lado.
 *
 *   · `{ url }`            → aplicala.
 *   · `{ falta: true }`    → esa imagen YA NO EXISTE. Se puede caer a "sin
 *                            efecto" y limpiar lo guardado.
 *   · `{ falta: false }`   → no se pudo averiguar (almacenamiento bloqueado o
 *                            con un hipo). NO tocar lo guardado: la imagen
 *                            probablemente sigue ahí y borrar la preferencia
 *                            por un fallo pasajero es justo el bug que este
 *                            módulo vino a arreglar.
 */
export type ImagenDeFondo = { url: string } | { falta: boolean };

export async function resolverImagenDeFondo(effect: BackgroundEffect, origen: string): Promise<ImagenDeFondo> {
  if (effect === "none" || esBlur(effect)) return { falta: true };
  if (isCustomBackground(effect)) {
    const ref = getCustomBackgroundUrl(effect);
    // Compatibilidad: una elección vieja traía la URL adentro del propio valor.
    if (/^(blob:|https?:|data:)/.test(ref)) return { url: ref };
    const url = await urlDeFondoPropio(ref);
    if (url) return { url };
    return { falta: url === null };
  }
  const tpl = BACKGROUND_TEMPLATES.find((t) => t.id === effect);
  if (!tpl) return { falta: true };
  return { url: `${origen}${tpl.lowSrc || tpl.src}` };
}
