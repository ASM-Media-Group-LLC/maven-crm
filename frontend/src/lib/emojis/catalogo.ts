// El catálogo completo de emojis del selector (components/chat/SelectorDeEmojis):
// 1.870 emojis en las nueve categorías de Google, con nombre y etiquetas en
// español e inglés para el buscador.
//
// El JSON lo arma scripts/emojis/generar-catalogo.mjs a partir de emojibase-data.
// Se baja recién cuando alguien abre un selector: el import dinámico lo deja en un
// chunk aparte (~60 KB gzip) y quien nunca abre uno no lo paga.

/** Las categorías, en el orden de la barra de iconos del selector. */
export const GRUPOS = [
  "caras", "personas", "animales", "comida", "viajes", "actividades", "objetos", "simbolos", "banderas",
] as const;
export type GrupoDeEmojis = (typeof GRUPOS)[number];

// El número de grupo de emojibase → la categoría. El 2 (componentes: tonos de
// piel y pelo sueltos) no viene en el JSON.
const POR_NUMERO: Record<number, GrupoDeEmojis> = {
  0: "caras", 1: "personas", 3: "animales", 4: "comida", 5: "viajes",
  6: "actividades", 7: "objetos", 8: "simbolos", 9: "banderas",
};

export interface EmojiDelCatalogo {
  emoji: string;
  grupo: GrupoDeEmojis;
  nombre: { es: string; en: string };
  /** Los dos nombres, en minúsculas y sin tildes: para ordenar los resultados. */
  nombres: string;
  /** Nombres y etiquetas de los dos idiomas, en minúsculas y sin tildes. */
  busqueda: string;
}

export interface CatalogoDeEmojis {
  todos: EmojiDelCatalogo[];
  porGrupo: Record<GrupoDeEmojis, EmojiDelCatalogo[]>;
  porEmoji: Map<string, EmojiDelCatalogo>;
}

/** Minúsculas y sin tildes: "Corazón" y "corazon" se encuentran igual. */
export const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Fila = [string, number, number, string, string, string, string];

/** Arma el catálogo con lo que este equipo puede dibujar (`versionMaxima`). */
export function armarCatalogo(filas: Fila[], versionMaxima: number): CatalogoDeEmojis {
  const porGrupo = Object.fromEntries(GRUPOS.map((g) => [g, [] as EmojiDelCatalogo[]])) as Record<GrupoDeEmojis, EmojiDelCatalogo[]>;
  const porEmoji = new Map<string, EmojiDelCatalogo>();
  const todos: EmojiDelCatalogo[] = [];
  for (const [emoji, numero, version, nombreEs, etiquetasEs, nombreEn, etiquetasEn] of filas) {
    const grupo = POR_NUMERO[numero];
    // 12.1 y 13.1 son secuencias que pide la versión siguiente: hacia arriba.
    if (!grupo || Math.ceil(version) > versionMaxima) continue;
    const nombres = normalizar(`${nombreEs}|${nombreEn}`);
    const item: EmojiDelCatalogo = {
      emoji,
      grupo,
      nombre: { es: nombreEs, en: nombreEn },
      nombres,
      busqueda: `${nombres}|${normalizar(`${etiquetasEs}|${etiquetasEn}`)}`,
    };
    todos.push(item);
    porGrupo[grupo].push(item);
    porEmoji.set(emoji, item);
  }
  return { todos, porGrupo, porEmoji };
}

/** Los emojis que coinciden con lo que se escribió en el buscador. Cada palabra
 *  tiene que aparecer en algún nombre o etiqueta (en español o en inglés). Van
 *  primero los que tienen un NOMBRE que empieza así, después los que tienen una
 *  palabra que empieza así, y al final el resto, en el orden del catálogo. */
export function buscarEmojis(catalogo: CatalogoDeEmojis, consulta: string): EmojiDelCatalogo[] {
  const limpia = normalizar(consulta).trim();
  const palabras = limpia.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const primera = palabras[0];
  const puntaje = (e: EmojiDelCatalogo): number => {
    if (e.nombres.split("|").some((n) => n.startsWith(limpia))) return 0;
    if (e.busqueda.split(/[|\s]/).some((p) => p.startsWith(primera))) return 1;
    return 2;
  };
  return catalogo.todos
    .filter((e) => palabras.every((p) => e.busqueda.includes(p)))
    .map((e, i) => ({ e, i, p: puntaje(e) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.e);
}

// ¿Hasta qué versión de emoji dibuja ESTE equipo? Windows 10 se quedó en la 12 y
// un iPhone sin actualizar puede no tener la 14: lo que no tiene fuente sale como
// un cuadrito vacío. Se prueba un emoji de cada versión en un canvas, dos veces,
// con tinta roja y con tinta azul: un emoji de color se dibuja igual con las dos;
// el cuadrito (o un glifo en blanco y negro) toma el color de la tinta.
const PRUEBAS: Array<[number, string]> = [[15, "🫨"], [14, "🫠"], [13, "🥲"], [12, "🥱"], [11, "🥰"]];
const VERSION_DEL_CATALOGO = 15;

function seDibuja(ctx: CanvasRenderingContext2D, emoji: string): boolean {
  const lado = 24;
  ctx.clearRect(0, 0, lado * 2, lado);
  ctx.font = `${lado - 4}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ff0000";
  ctx.fillText(emoji, 0, 0);
  ctx.fillStyle = "#0000ff";
  ctx.fillText(emoji, lado, 0);
  const a = ctx.getImageData(0, 0, lado, lado).data;
  const b = ctx.getImageData(lado, 0, lado, lado).data;
  let pintado = false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== 0) pintado = true;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) return false;
  }
  return pintado;
}

export function versionQueSeDibuja(): number {
  // jsdom (las pruebas) no tiene canvas y además avisa por consola: se muestra todo.
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return VERSION_DEL_CATALOGO;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) return VERSION_DEL_CATALOGO;
    for (const [version, emoji] of PRUEBAS) if (seDibuja(ctx, emoji)) return version;
  } catch {
    /* canvas bloqueado: igual que sin canvas */
  }
  // Ni el de 2018 se dibujó: el canvas miente (bloqueo contra huellas digitales del
  // navegador), no la fuente. Mejor mostrar todo que esconder lo que sí se ve.
  return VERSION_DEL_CATALOGO;
}

let pedido: Promise<CatalogoDeEmojis> | null = null;

/** El catálogo, bajado una sola vez por pestaña. Si falla (sin red, un deploy a
 *  mitad de camino) se puede volver a pedir. */
export function cargarCatalogo(): Promise<CatalogoDeEmojis> {
  if (!pedido) {
    pedido = import("./catalogo.json").then((m) =>
      armarCatalogo((m.default as unknown as { emojis: Fila[] }).emojis, versionQueSeDibuja()),
    );
    pedido.catch(() => { pedido = null; });
  }
  return pedido;
}
