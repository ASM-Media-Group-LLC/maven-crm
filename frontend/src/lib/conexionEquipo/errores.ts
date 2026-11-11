import type { TranslationKey } from "@/lib/i18n";

// Los errores de las RPC de Conectar tu plataforma (avisos y pendientes). La base
// pone el código al principio del mensaje («url_invalida: …», «ya_resuelta: …»); aquí
// cada código se dice en una frase. Ver 20261111190000_agencias_conectadas.sql.

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

const ERRORES: Record<string, TranslationKey> = {
  sin_permiso: "conexionEquipo.err.sin_permiso",
  llave_no_existe: "conexionEquipo.err.llave_no_existe",
  llave_no_vigente: "conexionEquipo.err.llave_no_vigente",
  llave_sin_equipo: "conexionEquipo.err.llave_sin_equipo",
  eventos_invalidos: "conexionEquipo.err.eventos_invalidos",
  url_invalida: "conexionEquipo.err.url_invalida",
  ya_tiene_webhook: "conexionEquipo.err.ya_tiene_webhook",
  webhook_no_existe: "conexionEquipo.err.webhook_no_existe",
  accion_invalida: "conexionEquipo.err.accion_invalida",
  webhook_no_activo: "conexionEquipo.err.webhook_no_activo",
  prueba_muy_seguida: "conexionEquipo.err.prueba_muy_seguida",
  // equipo_pendiente_resolver
  pendiente_no_existe: "conexionEquipo.err.pendiente_no_existe",
  ya_resuelta: "conexionEquipo.err.ya_resuelta",
  falta_user_id: "conexionEquipo.err.falta_user_id",
  cuenta_no_coincide: "conexionEquipo.err.cuenta_no_coincide",
};

/** Los códigos de error que la pantalla sabe decir en palabras. */
export const CODIGOS_DE_ERROR = Object.keys(ERRORES);

/** El código del principio del mensaje («url_invalida: …» → «url_invalida»). */
export function codigoDelError(e: unknown): string | null {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : null;
  const c = m?.match(/^([a-z_]+):/)?.[1];
  return c ?? null;
}

/** El error de una RPC en una frase. Uno que no se conoce, con su mensaje tal cual
 *  (es mejor que esconderlo). */
export function textoDelErrorRpc(e: unknown, t: T): string {
  const c = codigoDelError(e);
  if (c && ERRORES[c]) return t(ERRORES[c]);
  return e instanceof Error && e.message ? e.message : t("conexionEquipo.fallo");
}
