// EL ANCHO ES DISEÑO. Maven tiene tres anchos de pantalla y ninguna página
// decide el suyo sola: lo declara en `<Page width="...">` y el contenedor lo
// aplica. En un monitor de 2560 px el contenido se acomoda dentro del ancho
// declarado; en un teléfono (390 px) todo es una columna con padding de 16 px.
// Ver la regla "Anchos y teléfono" en /design-system y test/contratoDeDiseno.test.ts.
export const PAGE_WIDTHS = {
  /** Fichas, formularios, ajustes de un solo tema. */
  lectura: { max: 720, className: "max-w-[720px]", uso: "fichas, formularios, ajustes de un solo tema" },
  /** Listas con filtros, tablas, ajustes en cuadrícula. */
  trabajo: { max: 1200, className: "max-w-[1200px]", uso: "listas con filtros, tablas, ajustes en cuadrícula" },
  /** Dashboards, salas, conversaciones: fluido hasta 1700 px. */
  tablero: { max: 1700, className: "max-w-[1700px]", uso: "dashboards, salas, conversaciones" },
} as const;

export type PageWidth = keyof typeof PAGE_WIDTHS;
