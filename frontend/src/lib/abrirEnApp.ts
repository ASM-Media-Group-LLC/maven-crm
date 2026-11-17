// LOS LINKS DE MAVEN ABREN EN LA APP DE COMPUTADOR (Alvaro, 17/11/2026: «que me
// abran la aplicación cuando lo quiero abrir, no en el navegador»).
//
// En el navegador de un computador, al abrir un link de Maven se ofrece «Abrir en
// la app». Si la persona marca «Siempre», las próximas veces se abre solo. La app
// recibe maven://abrir?ruta=/… (desktop/src/main.js) y abre esa ruta adentro.

export const CLAVE_PREFERENCIA = "maven.abrirEnApp";
export type Preferencia = "siempre" | "nunca" | null;

/** Rutas públicas o de invitados: ahí no se ofrece la app (quien entra puede no tenerla). */
const RUTAS_PUBLICAS = [
  /^\/$/, /^\/(es|en|de|fr|it|pt)(\/|$)/, /^\/(login|register|forgot-password|reset-password|privacidad|documentation|diagnostico-pantalla|concept|credentials)(\/|$)/,
  /^\/(entrar|unirse|aportar|subir|chatter|hoja)\//, /^\/portal(\/|$)/,
];

/** ¿Hay que ofrecer abrir en la app? Solo en un navegador de computador, con sesión. */
export function debeOfrecerApp(p: { ua: string; enApp: boolean; conSesion: boolean; ruta: string }): boolean {
  if (p.enApp || !p.conSesion) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(p.ua)) return false;
  if (!/Macintosh|Windows/i.test(p.ua)) return false;
  return !RUTAS_PUBLICAS.some((re) => re.test(p.ruta));
}

/** El link que abre la app en esa ruta. */
export function enlaceDeApp(ruta: string): string {
  const limpia = ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : "/";
  return `maven://abrir?ruta=${encodeURIComponent(limpia)}`;
}

export function leerPreferencia(): Preferencia {
  try {
    const v = localStorage.getItem(CLAVE_PREFERENCIA);
    return v === "siempre" || v === "nunca" ? v : null;
  } catch {
    return null;
  }
}

export function guardarPreferencia(v: Exclude<Preferencia, null>): void {
  try { localStorage.setItem(CLAVE_PREFERENCIA, v); } catch { /* sin almacenamiento: se pregunta otra vez */ }
}
