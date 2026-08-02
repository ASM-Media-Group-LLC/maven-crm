// session-check.mjs — ¿este archivo de sesión tiene un login DE VERDAD?
//
// Vive aparte (y no dentro de agent-core.mjs) para que lo pueda usar cualquiera sin
// arrastrar Playwright: lo necesitan el panel, el importador de cookies y los
// scrapers, y son tres procesos distintos.
//
// POR QUÉ EXISTE: hasta el 02/08 el panel daba por logueada una cuenta con que el
// ARCHIVO existiera, y guardaba lo que hubiera en el navegador sin mirar. Apretar
// "ya me logueé" antes de tiempo escribía una sesión anónima y prendía la luz verde
// igual. Una señal que reporta éxito sin comprobarlo.
// Y el único chequeo que había —la cookie `sessionid`— es de INSTAGRAM: no existe en
// X, Facebook ni Telegram, así que para esas tres habría dado siempre negativo.

const cookieCon = (d, nombre) => (d.cookies || []).some((c) => c.name === nombre && c.value);
const lsCon = (d, origen, re) =>
  (d.origins || []).some((o) => o.origin === origen && (o.localStorage || []).some((k) => re.test(k.name) && k.value));

// Cada sitio guarda la autenticación en un lugar distinto. Estas son las que
// importan; si falta alguna, la sesión no sirve para leer nada privado.
export const MARCADOR_SESION = {
  instagram: (d) => cookieCon(d, "sessionid") && cookieCon(d, "ds_user_id"),
  x: (d) => cookieCon(d, "auth_token"),
  facebook: (d) => cookieCon(d, "c_user") && cookieCon(d, "xs"),
  // ⚠️ Telegram web NO usa cookies para la sesión: va en el localStorage del origen
  // (user_auth + las claves de datacenter). Por eso tampoco se puede importar desde
  // Chrome con el lector de cookies — ver import-session.mjs.
  telegram: (d) => lsCon(d, "https://web.telegram.org", /^(user_auth|dc\d+_auth_key)$/),
};

// Qué se busca en cada red, en castellano, para poder explicar una falla.
export const QUE_FALTA = {
  instagram: "las cookies sessionid + ds_user_id",
  x: "la cookie auth_token",
  facebook: "las cookies c_user + xs",
  telegram: "las claves user_auth / dcN_auth_key del localStorage de web.telegram.org",
};

// Devuelve true/false, o null si la red es desconocida: sin saber qué buscar no se
// puede afirmar que haya sesión, y eso se dice — no se asume que sí.
export function tieneSesion(storageState, network) {
  const m = MARCADOR_SESION[network];
  return m ? !!m(storageState) : null;
}
