import type { TranslationKey } from "@/lib/i18n";

// ETIQUETAS DE LO QUE VIAJA COMO DATO.
//
// En Contactos varios valores se guardan en la base tal cual se escriben acá, en
// español: la categoría/prioridad (physical_appearance), la plataforma "Otra",
// los estados que escribe el formulario de interacciones (closers_contacts.status
// y contact_interactions.resulting_status) y el `estado` que arma ContactosContent
// con su statusMap. Traducir el VALOR rompería filtros, comparaciones y lo ya
// guardado. Así que el valor queda igual y solo se elige qué MOSTRAR.

type Opcion = { value: string; label: TranslationKey };

/** Categoría física de una modelo. */
export const CATEGORIAS: readonly Opcion[] = [
  { value: "A+", label: "contactos.catAPlus" },
  { value: "A", label: "contactos.catA" },
  { value: "B+", label: "contactos.catBPlus" },
  { value: "B", label: "contactos.catB" },
  { value: "C", label: "contactos.catC" },
];

/** Prioridad comercial de una agencia. Va en la misma columna que la categoría. */
export const PRIORIDADES_AGENCIA: readonly Opcion[] = [
  { value: "Alta", label: "contactos.priorityHigh" },
  { value: "Media", label: "contactos.priorityMedium" },
  { value: "Baja", label: "contactos.priorityLow" },
];

/** Cómo se dice cada prioridad, para los filtros que muestran el valor crudo. */
export const ETIQUETA_PRIORIDAD: Record<string, TranslationKey> = Object.fromEntries(
  PRIORIDADES_AGENCIA.map((p) => [p.value, p.label]),
);

/** El valor guardado de la plataforma "otra". */
export const PLATAFORMA_OTRA = "Otra";

/** Estado del contacto → etiqueta. Un valor que no está aquí se muestra tal cual. */
const ETIQUETA_ESTADO: Record<string, TranslationKey> = {
  "Sin cambio": "contactos.statusNoChange",
  Nuevo: "common.new",
  Contactado: "contactos.statusContacted",
  Interesado: "contactos.statusInterested",
  Descartado: "contactos.statusDiscarded",
  Convertido: "contactos.statusConverted",
  Rechazado: "contactos.statusRejected",
};

export function etiquetaEstado(t: (k: TranslationKey) => string, estado: string): string {
  const clave = ETIQUETA_ESTADO[estado];
  return clave ? t(clave) : estado;
}

/** Tipo de interacción guardado ('nota' | 'llamada') → etiqueta. */
const ETIQUETA_INTERACCION: Record<string, TranslationKey> = {
  nota: "contactos.note",
  llamada: "contactos.call",
};

export function etiquetaInteraccion(t: (k: TranslationKey) => string, tipo: string): string {
  const clave = ETIQUETA_INTERACCION[tipo];
  return clave ? t(clave) : tipo;
}
