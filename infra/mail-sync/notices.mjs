// COPIA de supabase/functions/_shared/mail-notices.ts (mantener en sync a
// mano, como sanitize.mjs). El worker la necesita porque los avisos del
// proveedor no deben llegar NI SIQUIERA a la caché: la regresión del
// 21/08 fue exactamente esa — el filtro vivía solo en el camino en vivo y
// los correos de bienvenida reaparecieron al estrenar la caché.
//
// SE OCULTAN, NO SE BORRAN: los mensajes siguen en el buzón del proveedor;
// simplemente no se cachean y por lo tanto no se muestran.
//
// ⚠️ DIRECCIONES EXACTAS, NO DOMINIOS: por @zoho.com llegan también los
// REBOTES (mailer-daemon@), y ocultar un "no se pudo entregar" es peor que
// el problema que este filtro resuelve. Tests: los del módulo TS.

export const AVISOS_OCULTOS = new Set([
  "welcome@zoho.com",
  "noreply@zoho.com",
  "no-reply@zoho.com",
  "notifications@zoho.com",
  "mail-noreply@zoho.com",
  "welcome@zohomail.com",
  "noreply@zohoaccounts.com",
]);

export function direccionDe(from) {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

export function esAvisoDelProveedor(from) {
  return AVISOS_OCULTOS.has(direccionDe(from ?? ""));
}
