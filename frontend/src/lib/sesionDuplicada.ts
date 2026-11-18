import { DisconnectReason } from "livekit-client";
import type { TranslationKey } from "@/lib/i18n";
import { compartido } from "@/lib/i18n/compartido";

// Qué hacer cuando LiveKit nos desconecta, según POR QUÉ nos desconectó.
//
// EL BUG QUE ESTO ARREGLA (reproducido en vivo el 29/08/2026):
//
// Cada persona entra a la sala con su user id como identidad. LiveKit exige
// identidad única: cuando entra una segunda conexión con la misma, EXPULSA a la
// primera. O sea que abrir Cowork en dos pestañas alcanza para que se peleen.
//
// Pero la pelea infinita no la causaban las dos pestañas: la causaba el
// REINTENTO. El monitor trataba cualquier desconexión como un corte de red y
// volvía a conectar con backoff — y al volver, pateaba a la otra, que hacía
// exactamente lo mismo. `disconnect from room` cada ocho segundos, para
// siempre. Se veía como la miniatura parpadeando y la persona entrando y
// saliendo sola de la sala.
//
// La distinción que faltaba: un corte de red SÍ hay que reintentarlo —
// reconectar es lo correcto y es lo que hace que Cowork sobreviva a un wifi
// malo. Pero "te sacaron porque abriste esto en otra pestaña" NO se reintenta
// nunca: reintentarlo es justamente lo que arma el bucle. Ahí hay que parar y
// preguntarle a la persona en cuál de las dos quiere quedarse.

/** ¿Nos sacaron porque la misma cuenta abrió esto en otro lado?
 *
 *  `DUPLICATE_IDENTITY` es literalmente eso en el protocolo de LiveKit:
 *  "another participant with the same identity has joined the room". Puede ser
 *  otra pestaña, otra ventana, u otra computadora — para el caso da igual. */
export function esOtraPestana(razon?: DisconnectReason | number | null): boolean {
  return razon === DisconnectReason.DUPLICATE_IDENTITY;
}

/** ¿Corresponde volver a conectar solos?
 *
 *  Que sea la NEGACIÓN de lo anterior y no una lista de casos es a propósito:
 *  ante una razón desconocida conviene reintentar. Quedarse sin supervisión en
 *  silencio es peor que un reintento de más — y esa fue la decisión original
 *  del monitor, que acá se conserva. */
export function debeReintentar(razon?: DisconnectReason | number | null): boolean {
  return !esOtraPestana(razon);
}

// Los textos, acá y no repartidos por las pantallas, para que el supervisor y
// la persona supervisada lean lo mismo y nadie tenga que adivinar qué pasó.
// Viven en el diccionario (lib/i18n/compartido.ts); cada pantalla los dibuja
// con `t(CLAVES_OTRA_PESTANA.titulo)`.
//
//  - titulo: dice el HECHO, no un error: no se rompió nada.
//  - detalle: nombra las dos cosas que la persona necesita saber: por qué se
//    cortó acá, y que puede traerlo de vuelta con un clic.
//  - usarAqui: "Usar aquí" y no "Reconectar": lo que hace no es reintentar, es
//    ELEGIR este lugar — y de paso deja al otro fuera. Conviene que el texto lo
//    diga, porque la consecuencia le cae a la otra pestaña.
export const CLAVES_OTRA_PESTANA = {
  titulo: "shared.otherTab.title",
  detalle: "shared.otherTab.detail",
  usarAqui: "shared.otherTab.useHere",
} as const satisfies Record<string, TranslationKey>;

// El texto en español de las mismas claves, para las pantallas que todavía no
// pasan por t() (el monitor de Cowork). Sale del diccionario: una sola fuente.
/** @deprecated Dibujar `t(CLAVES_OTRA_PESTANA.titulo)`. */
export const TITULO_OTRA_PESTANA = compartido[CLAVES_OTRA_PESTANA.titulo].es;
/** @deprecated Dibujar `t(CLAVES_OTRA_PESTANA.detalle)`. */
export const DETALLE_OTRA_PESTANA = compartido[CLAVES_OTRA_PESTANA.detalle].es;
/** @deprecated Dibujar `t(CLAVES_OTRA_PESTANA.usarAqui)`. */
export const BOTON_USAR_AQUI = compartido[CLAVES_OTRA_PESTANA.usarAqui].es;

// ── LA APP MANDA, EL NAVEGADOR SE APARTA SOLO (Alvaro, 17/11/2026) ──────────
//
// La gente abre la app de Maven (desktop/, Electron) con la pestaña del
// navegador todavía en la misma llamada de Cowork. LiveKit saca a la conexión
// vieja con DUPLICATE_IDENTITY (11 cortes así el 16/11 en llamada_cortes). La
// pestaña sacada ya no volvía sola (debeReintentar), pero:
//
//  1. El cartel era el mismo para todo («Abierto en otra ventana»): a quien
//     tenía la app abierta no le decía que seguía en la llamada DESDE LA APP.
//  2. Una RECARGA de la pestaña sacada —la recarga sola por versión nueva al
//     «colgar» (lib/recargaAlColgar.ts), un F5, la pestaña descartada por el
//     navegador— volvía a montar Cowork, que entra solo a la sala: le quitaba
//     la llamada a la app. Y la app, con su propia recarga pendiente, se la
//     volvía a quitar. Ese era el ida y vuelta: «me saca de la llamada».
//
// Ahora el lugar al que le quitaron la sala lo ANOTA (sessionStorage: sobrevive
// a la recarga de esa misma pestaña o ventana, y a ninguna otra) y, mientras
// esté anotado, la conexión automática no entra: se queda fuera, con el cartel
// que dice dónde sigue la persona, y solo el botón la vuelve a tomar
// (`tomarLaSala` en connect). Vale igual para la app: tampoco pelea.

/** Desde dónde sigue la persona en la llamada, visto por el lugar que la soltó:
 *  - "app": esta es una pestaña del navegador y la tomó otro lado que no es una
 *    pestaña de este mismo navegador: casi siempre, la app de Maven.
 *  - "otroLado": esta es la app; la tomó otra ventana o el navegador.
 *  - "pestana": la tomó otra pestaña de este mismo navegador (el caso de
 *    siempre: el cartel de siempre). */
export type QuienTieneLaSala = "app" | "otroLado" | "pestana";

const QUIENES: readonly QuienTieneLaSala[] = ["app", "otroLado", "pestana"];

/** Decide quién tiene la sala. Puro, para probarlo. */
export function quienTieneLaSala(p: { soyLaApp: boolean; otraPestanaEntro: boolean }): QuienTieneLaSala {
  if (p.soyLaApp) return "otroLado";
  return p.otraPestanaEntro ? "pestana" : "app";
}

// Los textos de cada caso. "pestana" sigue con el cartel de siempre.
export const CLAVES_SALA_TOMADA = {
  pestana: CLAVES_OTRA_PESTANA,
  app: {
    titulo: "shared.salaTomada.app.title",
    detalle: "shared.salaTomada.app.detail",
    usarAqui: "shared.salaTomada.app.useHere",
  },
  otroLado: {
    titulo: "shared.salaTomada.otroLado.title",
    detalle: "shared.salaTomada.otroLado.detail",
    usarAqui: "shared.salaTomada.otroLado.useHere",
  },
} as const satisfies Record<QuienTieneLaSala, { titulo: TranslationKey; detalle: TranslationKey; usarAqui: TranslationKey }>;

// ── ¿La tomó otra pestaña de ESTE navegador? ────────────────────────────────
// LiveKit no dice quién entró: solo «otro con tu identidad». Lo único que se
// puede saber desde acá es si fue otra pestaña del MISMO navegador, porque
// comparten localStorage (la app de Maven y otro navegador no). Cada pestaña
// anota, al EMPEZAR a entrar a una sala, qué sala y quién es; la expulsión llega
// mientras la otra está entrando, así que ya está anotada cuando llega.
const CLAVE_ENTRANDO = "maven.sala-entrando";
/** Cuánto vale la anotación de la otra pestaña: entrar tarda segundos. */
export const VENTANA_OTRA_PESTANA_MS = 60_000;

/** Quién es esta pestaña (por carga de página: tras recargar es «otra»). */
const ESTA_PESTANA = (() => {
  try { return globalThis.crypto?.randomUUID?.() ?? `p${Math.random().toString(36).slice(2)}`; }
  catch { return `p${Math.random().toString(36).slice(2)}`; }
})();

export interface MarcaDeEntrada { sala: string; pestana: string; t: number }

/** ¿Esta marca dice que OTRA pestaña acaba de entrar a esta sala? Puro. */
export function esEntradaDeOtraPestana(marca: MarcaDeEntrada | null, sala: string, estaPestana: string, ahora: number): boolean {
  if (!marca || marca.sala !== sala || marca.pestana === estaPestana) return false;
  const edad = ahora - marca.t;
  // Unos segundos «del futuro» se aceptan: los relojes de dos pestañas son el
  // mismo, pero Date.now() se lee en momentos distintos.
  return edad >= -5_000 && edad < VENTANA_OTRA_PESTANA_MS;
}

/** Lo llama connect() al empezar a entrar. */
export function anotarQueEntro(sala: string, ahora: number = Date.now()): void {
  try { localStorage.setItem(CLAVE_ENTRANDO, JSON.stringify({ sala, pestana: ESTA_PESTANA, t: ahora })); } catch { /* sin almacenamiento */ }
}

/** Al ser expulsada: ¿fue otra pestaña de este navegador? */
export function otraPestanaEntroA(sala: string, ahora: number = Date.now()): boolean {
  try {
    const crudo = localStorage.getItem(CLAVE_ENTRANDO);
    const m = crudo ? (JSON.parse(crudo) as Partial<MarcaDeEntrada>) : null;
    const marca = m && typeof m.sala === "string" && typeof m.pestana === "string" && typeof m.t === "number"
      ? { sala: m.sala, pestana: m.pestana, t: m.t } : null;
    return esEntradaDeOtraPestana(marca, sala, ESTA_PESTANA, ahora);
  } catch {
    return false;
  }
}

// ── «Esta pestaña soltó la sala»: sobrevive a la recarga ────────────────────
// Se borra cuando la persona la toma con el botón o sale a propósito. Caduca
// sola a las 12 horas (un turno largo) para no quedar colgada en una pestaña
// que vive días abierta.
const claveSoltada = (sala: string) => `sala-soltada:${sala}`;
export const VIGENCIA_SALA_SOLTADA_MS = 12 * 60 * 60_000;

export function anotarSalaSoltada(sala: string, quien: QuienTieneLaSala, ahora: number = Date.now()): void {
  try { sessionStorage.setItem(claveSoltada(sala), JSON.stringify({ quien, t: ahora })); } catch { /* sin almacenamiento: no se recuerda */ }
}

/** Si esta pestaña soltó esta sala (y sigue vigente), quién la tiene; si no, null. */
export function salaSoltada(sala: string, ahora: number = Date.now()): QuienTieneLaSala | null {
  try {
    const crudo = sessionStorage.getItem(claveSoltada(sala));
    if (!crudo) return null;
    const m = JSON.parse(crudo) as { quien?: unknown; t?: unknown };
    const vigente = typeof m.t === "number" && ahora - m.t >= 0 && ahora - m.t < VIGENCIA_SALA_SOLTADA_MS;
    if (!vigente || !QUIENES.includes(m.quien as QuienTieneLaSala)) {
      sessionStorage.removeItem(claveSoltada(sala));
      return null;
    }
    return m.quien as QuienTieneLaSala;
  } catch {
    return null;
  }
}

export function olvidarSalaSoltada(sala: string): void {
  try { sessionStorage.removeItem(claveSoltada(sala)); } catch { /* sin almacenamiento */ }
}
