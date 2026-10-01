// Orden y "ver solo…" por columna de la tabla (pedido de Jhon 03/09/2026:
// "doy click en precio y me habilita mayor precio o menor precio… tipo, y me va
// acomodando por tipos").
//
// Puro y testeable: la tabla solo dibuja. Se ordena en el cliente sobre lo que
// ya está cargado (la consulta trae hasta 1000 filas y hoy son 612), así el
// clic es instantáneo y no dispara otra consulta.

import type { TranslationKey } from "@/lib/i18n";
import { CANALES, ESTADOS, TIPOS, AGENCIAS, type Pedido } from "./types";

export type ColumnaOrden =
  | "creator_name" | "requested_on" | "status" | "chatter_name" | "fan_handle"
  | "content_type" | "price_usd" | "paid_usd" | "sale_channel" | "due_on" | "agency";

export type Direccion = "asc" | "desc";
export interface Orden { col: ColumnaOrden; dir: Direccion }

/** Qué clase de dato hay en la columna: decide los textos del menú. */
export type Clase = "numero" | "fecha" | "texto" | "categoria";

export const CLASE: Record<ColumnaOrden, Clase> = {
  creator_name: "texto", requested_on: "fecha", status: "categoria", chatter_name: "texto",
  fan_handle: "texto", content_type: "categoria", price_usd: "numero", paid_usd: "numero",
  sale_channel: "categoria", due_on: "fecha", agency: "categoria",
};

/** Textos del menú según la clase (así "Precio" ofrece mayor/menor y "Tipo"
 *  agrupa). Son claves del diccionario: la tabla los pasa por `t()`. */
export const TEXTOS: Record<Clase, { desc: TranslationKey; asc: TranslationKey }> = {
  numero: { desc: "custom.sort.numDesc", asc: "custom.sort.numAsc" },
  fecha: { desc: "custom.sort.dateDesc", asc: "custom.sort.dateAsc" },
  texto: { desc: "custom.sort.textDesc", asc: "custom.sort.textAsc" },
  categoria: { desc: "custom.sort.catDesc", asc: "custom.sort.catAsc" },
};

// El orden "natural" de las categorías no es alfabético: el estado sigue el
// ciclo de vida del pedido, no la letra.
const RANGO: Partial<Record<ColumnaOrden, string[]>> = {
  status: ESTADOS.map((e) => e.id),
  content_type: TIPOS.map((t) => t.id),
  sale_channel: CANALES.map((c) => c.id),
  agency: AGENCIAS.map((a) => a.id),
};

const TEXTO = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Valor comparable de una celda. `null` = sin dato (siempre va al final). */
function valor(p: Pedido, col: ColumnaOrden): number | string | null {
  const v = p[col] as unknown;
  if (v == null || v === "") return null;
  if (CLASE[col] === "numero") return typeof v === "number" ? v : Number(v);
  const rango = RANGO[col];
  if (rango) {
    const i = rango.indexOf(String(v));
    return i < 0 ? rango.length : i;   // valor desconocido: después de los conocidos
  }
  return String(v);
}

/**
 * Ordena SIN mutar. Las filas sin dato quedan siempre al final (en las dos
 * direcciones): un pedido sin precio no es "el más barato".
 * Empate → el más reciente primero, que es el orden con el que llega la lista.
 */
export function ordenarPedidos(pedidos: Pedido[], orden: Orden | null): Pedido[] {
  if (!orden) return pedidos;
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...pedidos].sort((a, b) => {
    const va = valor(a, orden.col), vb = valor(b, orden.col);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === "number" && typeof vb === "number"
      ? va - vb
      : TEXTO.compare(String(va), String(vb));
    if (cmp !== 0) return cmp * signo;
    return TEXTO.compare(String(b.requested_on ?? ""), String(a.requested_on ?? ""));
  });
}

/** Valores presentes en una columna categórica, para el "ver solo…" del menú. */
export function valoresDe(pedidos: Pedido[], col: ColumnaOrden): string[] {
  const set = new Set<string>();
  for (const p of pedidos) {
    const v = p[col] as unknown;
    if (v != null && v !== "") set.add(String(v));
  }
  const rango = RANGO[col];
  const lista = [...set];
  return rango ? lista.sort((a, b) => rango.indexOf(a) - rango.indexOf(b)) : lista.sort(TEXTO.compare);
}

/** Etiqueta legible de un valor de columna categórica, en el idioma de `t`. */
export function etiquetaValor(col: ColumnaOrden, valor: string, t: (k: TranslationKey) => string): string {
  if (col === "status") { const e = ESTADOS.find((x) => x.id === valor); return e ? t(e.label) : valor; }
  if (col === "content_type") { const x = TIPOS.find((y) => y.id === valor); return x ? `${x.emoji} ${t(x.label)}` : valor; }
  if (col === "sale_channel") { const c = CANALES.find((x) => x.id === valor); return c ? t(c.label) : valor; }
  if (col === "agency") return AGENCIAS.find((a) => a.id === valor)?.label ?? valor;
  return valor;
}
