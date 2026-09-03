// Una sola URL para Maven: app.maven-ai.me
//
// Maven se sirve desde varios dominios a propósito:
//   · app.maven-ai.me   → el CANÓNICO (el que se anuncia y se instala)
//   · www.maven-ai.me   → redirige acá
//   · maven-ai.me       → redirige acá (y queda libre para una página pública)
//   · maven.asmtech.ai  → el HISTÓRICO. Hoy sigue sirviendo la app y solo se
//     CUENTA cuánta gente llega por ahí y a qué ruta (ver `contarVisitaHistorica`),
//     para poder apagarlo algún día con datos en vez de "por si acaso": hay
//     links vivos en bandejas ajenas —candidatos del evaluador, invitados de
//     Meet, grabaciones y reportes por correo— que no se pueden reescribir.
//     Cuando el equipo esté avisado, se pone REDIRIGIR_HISTORICO en true y
//     empieza a redirigir preservando la ruta (los links públicos siguen
//     funcionando: /chatter/abc va a /chatter/abc en el canónico).
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

/** Dominios de la etapa anterior. Se cuentan siempre; se redirigen solo cuando
 *  el interruptor de abajo está en true. */
const HISTORICOS = new Set(["maven.asmtech.ai", "maven.asmtech.me"]);

/** ⚠️ Pasar a `true` SOLO después de avisarle al equipo: el día que redirija,
 *  todos se deslogean (la sesión vive por dominio) y hay que volver a aceptar
 *  las notificaciones. */
const REDIRIGIR_HISTORICO = false;

/**
 * URL equivalente en el dominio canónico, o null si no hay que redirigir.
 * Preserva ruta, query y hash — el hash importa: por ahí viajan los tokens de
 * los enlaces de acceso y de recuperar contraseña.
 */
export function urlCanonica(href: string): string | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const redirigible = A_REDIRIGIR.has(u.hostname) || (REDIRIGIR_HISTORICO && HISTORICOS.has(u.hostname));
  if (!redirigible) return null;
  if (u.hostname === CANONICO) return null;   // cinturón: nunca redirigir a sí mismo
  u.hostname = CANONICO;
  return u.toString();
}

/** ¿Esta visita llegó por un dominio de la etapa anterior? */
export function esDominioHistorico(host: string): boolean {
  return HISTORICOS.has(host);
}

/**
 * Anota la visita al dominio histórico: host y ruta, sin nada que identifique a
 * la persona (muchas de estas visitas son de gente sin cuenta en Maven).
 * Una sola vez por pestaña, y sin bloquear la carga — si falla, se ignora.
 */
function contarVisitaHistorica(): void {
  const MARCA = "maven.legacy-contado";
  try {
    if (sessionStorage.getItem(MARCA)) return;
    sessionStorage.setItem(MARCA, "1");
  } catch { /* modo privado: se cuenta igual, no es grave */ }

  const cuerpo = JSON.stringify({ host: window.location.hostname, ruta: window.location.pathname });
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dominio-legacy-hit`;
  try {
    // `keepalive` para que el pedido sobreviva a la redirección de la página.
    void fetch(url, { method: "POST", body: cuerpo, headers: { "Content-Type": "application/json" }, keepalive: true })
      .catch(() => {});
  } catch { /* telemetría: nunca romper la visita */ }
}

/** Redirige si hace falta. Se llama antes del primer render para no parpadear. */
export function irAlDominioCanonico(): void {
  if (typeof window === "undefined") return;
  if (esDominioHistorico(window.location.hostname)) contarVisitaHistorica();
  const destino = urlCanonica(window.location.href);
  // `replace` y no `assign`: no queda una entrada en el historial que devuelva
  // al dominio viejo con el botón atrás.
  if (destino) window.location.replace(destino);
}
