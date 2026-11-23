import { CATALOGO_POSICIONES, type AlcanceDatos } from "./catalogo";
import type { TranslationKey } from "@/lib/i18n";

interface Configuracion {
  checks: Record<string, boolean>;
  alcances: Record<string, AlcanceDatos>;
  acceso_total: boolean;
  todas_creadoras: boolean;
  modalidad_id?: string | null;
}
export interface CambioPosicion {
  clave: string;
  etiqueta: TranslationKey;
  antes: string | boolean | null;
  despues: string | boolean | null;
}

/** Compare saved values, including explicit false versus an absent checkbox.
 * Full access is a separate, visible change; it must never hide other edits. */
export function cambiosDePosicion(antes: Configuracion, despues: Configuracion): CambioPosicion[] {
  const cambios: CambioPosicion[] = [];
  const agregar = (clave: string, etiqueta: TranslationKey, a: CambioPosicion["antes"], d: CambioPosicion["despues"]) => {
    if (a !== d) cambios.push({ clave, etiqueta, antes: a, despues: d });
  };
  agregar("acceso_total", "posiciones.accesoTotal", antes.acceso_total, despues.acceso_total);
  agregar("todas_creadoras", "posiciones.todasCreadoras", antes.todas_creadoras, despues.todas_creadoras);
  agregar("modalidad_id", "posiciones.pausa", antes.modalidad_id ?? null, despues.modalidad_id ?? null);
  for (const seccion of CATALOGO_POSICIONES) for (const grupo of seccion.grupos) for (const fila of grupo.filas) {
    for (const f of fila.funciones) agregar(f.clave, f.etiqueta, !!antes.checks[f.clave], !!despues.checks[f.clave]);
    if (fila.datos === "tres") agregar(`alcance:${fila.fila}`, fila.etiqueta, antes.alcances[fila.fila] ?? "all", despues.alcances[fila.fila] ?? "all");
  }
  return cambios;
}
