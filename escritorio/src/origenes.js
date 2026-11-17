'use strict';

// A DÓNDE PUEDE IR LA APP. Sin Electron a propósito: así se prueba con
// `node --test` (test/origenes.test.js) sin abrir ninguna ventana.
//
//   · Dentro de la app solo se navega por https a maven-ai.me y sus subdominios.
//   · Lo demás que sea web, correo o teléfono se abre en el navegador del sistema.
//   · Lo que no es nada de eso (file:, javascript:, data:, esquemas raros) se bloquea.
//   · Cámara, micrófono, pantalla y avisos se conceden SOLO a app.maven-ai.me.
//
// Maven no inicia sesión con Google ni con otro proveedor (solo correo y
// contraseña contra Supabase, por fetch): no hace falta abrir dominios de login.
// Si algún día se agrega, hay que sumar aquí los dominios de ese paso.

const DOMINIO = 'maven-ai.me';
const ORIGEN_APP = 'https://app.maven-ai.me';

/** Esquemas que se le pueden pasar al sistema para que los abra él. */
const ESQUEMAS_EXTERNOS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function analizar(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** ¿Es una página de Maven? `extras`: orígenes de desarrollo (MAVEN_URL). */
function esDeMaven(url, extras = []) {
  const u = analizar(url);
  if (!u) return false;
  if (extras.includes(u.origin)) return true;
  return (
    u.protocol === 'https:' &&
    u.port === '' &&
    (u.hostname === DOMINIO || u.hostname.endsWith(`.${DOMINIO}`))
  );
}

/** ¿Este origen recibe cámara, micrófono, pantalla y avisos? Solo la app. */
function tienePermisos(origenOUrl, extras = []) {
  const u = analizar(origenOUrl);
  if (!u) return false;
  return u.origin === ORIGEN_APP || extras.includes(u.origin);
}

/** Qué hacer cuando la ventana quiere ir a `url`: 'maven' (seguir dentro),
 *  'externo' (abrir en el navegador del sistema) o 'bloqueado'. */
function destinoDeNavegacion(url, extras = []) {
  if (esDeMaven(url, extras)) return 'maven';
  const u = analizar(url);
  if (u && ESQUEMAS_EXTERNOS.has(u.protocol)) return 'externo';
  return 'bloqueado';
}

/** Qué hacer con un `window.open` o un enlace con target="_blank":
 *  'dentro' (otra ventana de la app), 'externo' o 'bloqueado'.
 *
 *  Van dentro: las páginas de Maven (la llamada en su ventana, /hoja, /oficina),
 *  los blob: creados por la propia app (vistas previas) y about:blank, que la
 *  app abre en blanco para imprimir o para llenarla después (Drive abre la
 *  pestaña antes de pedir la URL firmada; si esa URL es de afuera, la regla de
 *  navegación la manda al navegador y la ventana en blanco se cierra). */
function destinoDeVentanaNueva(url, extras = []) {
  if (url === '' || url === 'about:blank') return 'dentro';
  if (typeof url === 'string' && url.startsWith('blob:')) {
    const u = analizar(url);
    return u && esDeMaven(u.origin, extras) ? 'dentro' : 'bloqueado';
  }
  const destino = destinoDeNavegacion(url, extras);
  return destino === 'maven' ? 'dentro' : destino;
}

module.exports = {
  DOMINIO,
  ORIGEN_APP,
  esDeMaven,
  tienePermisos,
  destinoDeNavegacion,
  destinoDeVentanaNueva,
};
