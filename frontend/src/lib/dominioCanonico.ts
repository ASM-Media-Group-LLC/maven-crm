// Una sola URL para Maven: app.maven-ai.me
//
// Maven se sirve desde varios dominios a propósito:
//   · app.maven-ai.me   → el CANÓNICO (el que se anuncia y se instala)
//   · www.maven-ai.me   → redirige acá
//   · maven-ai.me       → redirige acá (y queda libre para una página pública)
//   · maven.asmtech.ai  → NO se redirige. Sigue sirviendo la app porque hay
//     links públicos vivos en bandejas ajenas (candidatos del evaluador,
//     invitados de Meet, grabaciones y reportes por correo). Apagarlo o
//     redirigirlo se decide aparte, no acá.
//
// Por qué en el frontend y no en Traefik: un error en la config del servidor
// deja TODO Maven afuera; acá el peor caso es que no redirija. Y así se puede
// excluir con precisión el dominio histórico.
//
// Tener dos orígenes sirviendo la misma app no es cosmético: cada uno guarda su
// propia sesión, instala su propia PWA y registra sus propias notificaciones —
// quien entrara por dos dominios recibiría todo duplicado.

const CANONICO = "app.maven-ai.me";

/** Solo estos se redirigen. Cualquier otro host (el histórico, localhost, una
 *  preview) se deja como está. */
const A_REDIRIGIR = new Set(["maven-ai.me", "www.maven-ai.me"]);

/**
 * URL equivalente en el dominio canónico, o null si no hay que redirigir.
 * Preserva ruta, query y hash — el hash importa: por ahí viajan los tokens de
 * los enlaces de acceso y de recuperar contraseña.
 */
export function urlCanonica(href: string): string | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  if (!A_REDIRIGIR.has(u.hostname)) return null;
  if (u.hostname === CANONICO) return null;   // cinturón: nunca redirigir a sí mismo
  u.hostname = CANONICO;
  return u.toString();
}

/** Redirige si hace falta. Se llama antes del primer render para no parpadear. */
export function irAlDominioCanonico(): void {
  if (typeof window === "undefined") return;
  const destino = urlCanonica(window.location.href);
  // `replace` y no `assign`: no queda una entrada en el historial que devuelva
  // al dominio viejo con el botón atrás.
  if (destino) window.location.replace(destino);
}
