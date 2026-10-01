// Las reglas de messenger:write en el alta y la edición de una key (diseño de la
// escritura §2.1, §2.2 y §2.3), PURAS para probarlas por comportamiento. index.ts las
// aplica antes de escribir; la base las vuelve a exigir (api_keys_nombre_visible,
// migración 20261001200000) y rechaza con MV422 y un código, que traducirErrorDeLlave
// convierte en el mensaje de la página.
//
// Lo que se decide aquí:
//  · write exige read (los dos van juntos, siempre);
//  · write solo al crear: a una key que ya existe no se le suma;
//  · confirmación PROPIA: quien crea la key dice que sí sabiendo que escribirá a su
//    nombre (acknowledge_messenger_writes_as === su id), como con la lectura;
//  · nombre visible obligatorio con write, y solo con write;
//  · el nombre visible lo cambia solo la persona de la key;
//  · quitar write se permite.
// La forma del nombre (2 a 32, letras, esqueleto contra «Mav3n», raíces reservadas,
// personas de la agencia, reservado para siempre por integración) la decide la base:
// aquí solo se mira que sea un texto.

import { SCOPE_MESSENGER_ESCRITURA, SCOPE_MESSENGER_LECTURA } from "./api-scopes.ts";
import type { ClaveDeMensaje } from "./mensajes.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const escribe = (scopes: readonly string[]) => scopes.includes(SCOPE_MESSENGER_ESCRITURA);
const lee = (scopes: readonly string[]) => scopes.includes(SCOPE_MESSENGER_LECTURA);

/** El nombre visible que manda la página: `undefined` si no vino, null si viene vacío
 *  (o null), el texto recortado si es un texto. Más de 64 caracteres no es un nombre
 *  (la base lo rechazaría igual: el tope es 32). */
export function leerNombreVisible(v: unknown): { ok: true; valor: string | null | undefined } | { ok: false } {
  if (v === undefined) return { ok: true, valor: undefined };
  if (v === null) return { ok: true, valor: null };
  if (typeof v !== "string" || v.length > 64) return { ok: false };
  const t = v.trim();
  return { ok: true, valor: t === "" ? null : t };
}

/** El id de la key que esta reemplaza (la rotación): null si no vino. */
export function leerReemplazo(v: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, valor: null };
  if (typeof v !== "string" || !UUID.test(v.trim())) return { ok: false };
  return { ok: true, valor: v.trim().toLowerCase() };
}

export type Problema = { clave: ClaveDeMensaje; estado: 400 | 403 };

/** Las reglas de write al CREAR. `nombreVisible` es el que va a quedar (el pedido o,
 *  en una rotación, el de la key que se reemplaza). */
export function problemaAlCrear(p: {
  scopes: readonly string[];
  nombreVisible: string | null;
  confirmaEscrituraComo: unknown;
  quienCrea: string;
}): Problema | null {
  if (!escribe(p.scopes)) {
    return p.nombreVisible !== null ? { clave: "nombreVisibleSinEscritura", estado: 400 } : null;
  }
  if (!lee(p.scopes)) return { clave: "messengerEscrituraSinLectura", estado: 400 };
  if (p.nombreVisible === null) return { clave: "nombreVisibleRequerido", estado: 400 };
  // Un frontend viejo en caché no manda esto: no puede crearla sin darse cuenta. Y la
  // confirmación es de quien la crea, no de otro admin.
  if (p.confirmaEscrituraComo !== p.quienCrea) return { clave: "confirmarEscrituraMessenger", estado: 400 };
  return null;
}

/** Las reglas de write al EDITAR, contra lo que la key tiene HOY. `nombreVisibleNuevo`
 *  es undefined si el pedido no lo toca. */
export function problemaAlEditar(p: {
  scopesHoy: readonly string[];
  scopesNuevos: readonly string[];
  nombreVisibleHoy: string | null;
  nombreVisibleNuevo: string | null | undefined;
  actuaComo: string;
  quienEdita: string;
}): Problema | null {
  const escribiraNueva = escribe(p.scopesNuevos);
  if (escribiraNueva && !escribe(p.scopesHoy)) return { clave: "messengerEscrituraSoloNuevas", estado: 400 };
  if (escribiraNueva && !lee(p.scopesNuevos)) return { clave: "messengerEscrituraSinLectura", estado: 400 };
  if (p.nombreVisibleNuevo !== undefined && p.actuaComo !== p.quienEdita) return { clave: "nombreVisibleSoloDueno", estado: 403 };
  const nombre = p.nombreVisibleNuevo === undefined ? p.nombreVisibleHoy : p.nombreVisibleNuevo;
  if (escribiraNueva && nombre === null) return { clave: "nombreVisibleRequerido", estado: 400 };
  if (!escribiraNueva && p.nombreVisibleNuevo !== undefined && p.nombreVisibleNuevo !== null) {
    return { clave: "nombreVisibleSinEscritura", estado: 400 };
  }
  return null;
}

/** Los códigos con que la base rechaza una key (MV422, api_keys_nombre_visible) y los
 *  CHECK de la migración (23514), en la clave del mensaje de la página. null si es otro
 *  error: ese no se le muestra a nadie tal cual (va al log y sale un genérico). */
const POR_CODIGO: Record<string, ClaveDeMensaje> = {
  display_name_format: "nombreVisibleForma",
  display_name_reserved: "nombreVisibleReservado",
  display_name_person: "nombreVisiblePersona",
  display_name_taken: "nombreVisibleOcupado",
  display_name_required: "nombreVisibleRequerido",
  messenger_write_without_read: "messengerEscrituraSinLectura",
  messenger_write_only_new_keys: "messengerEscrituraSoloNuevas",
  integration_immutable: "integracionInmutable",
  integration_not_yours: "reemplazoInvalido",
};
const POR_CHECK: Record<string, ClaveDeMensaje> = {
  api_keys_escritura_con_lectura: "messengerEscrituraSinLectura",
  api_keys_escritura_con_nombre: "nombreVisibleRequerido",
};

export function traducirErrorDeLlave(e: unknown): ClaveDeMensaje | null {
  const err = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown; details?: unknown };
  if (err.code === "MV422" && typeof err.details === "string") {
    try {
      const d = JSON.parse(err.details) as { error?: unknown };
      if (typeof d?.error === "string" && Object.hasOwn(POR_CODIGO, d.error)) return POR_CODIGO[d.error];
    } catch {
      return null;
    }
  }
  if (err.code === "23514" && typeof err.message === "string") {
    const check = Object.keys(POR_CHECK).find((c) => (err.message as string).includes(`"${c}"`));
    if (check) return POR_CHECK[check];
  }
  return null;
}

/** Los códigos del detail de la base que traduce traducirErrorDeLlave (el test los
 *  compara con la migración). */
export const CODIGOS_DE_LA_BASE: readonly string[] = Object.keys(POR_CODIGO);
