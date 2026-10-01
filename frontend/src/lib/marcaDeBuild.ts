// LA HORA DEL BUILD, FUERA DE LOS CHUNKS.
//
// La presencia lleva la hora del build de cada pestaña (`b`) y pwa.ts la compara
// con 'ui_build_minimo' (lib/versionDelBundle.ts). Esa hora cambia en CADA build,
// así que no puede vivir en el JavaScript: si estuviera en un chunk (antes era un
// `define` de Vite que caía en el chunk de entrada), dos builds del mismo código
// darían nombres de chunks distintos, un sw.js distinto y otra precaché. Docker
// rearma el frontend también en los merges que no tocan el bundle (tests, infra,
// scripts, nginx.conf), y cada uno le mostraría «Nueva versión disponible» a todo
// el mundo, le haría bajar la precaché de nuevo y dejaría en 404 los chunks
// perezosos de las pestañas abiertas.
//
// Por eso va en index.html, como <meta name="maven-build">: ese archivo se sirve
// sin caché (nginx.conf) y no está en la precaché del SW. El código es el mismo
// entre dos builds iguales; solo cambia el HTML. versionDelBundle lo lee al
// arrancar.
//
// Sin DOM ni imports a propósito: lo importa vite.config.ts (que corre en Node).

/** El `name` del <meta> con la hora del build en ms. */
export const META_DEL_BUILD = "maven-build";

/** El plugin de Vite que mete el <meta> en index.html. La hora se toma UNA vez,
 *  al crear el plugin (al arrancar el build, o el servidor de desarrollo). */
export function pluginMarcaDeBuild(ahora: () => number = Date.now) {
  const hora = String(ahora());
  return {
    name: "maven-marca-de-build",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { name: META_DEL_BUILD, content: hora }, injectTo: "head" as const },
      ];
    },
  };
}

/** El contenido del <meta> → la hora en ms, o 0 si falta o no es un número válido. */
export function interpretarMarcaDeBuild(contenido: string | null | undefined): number {
  const texto = (contenido ?? "").trim();
  if (!/^\d+$/.test(texto)) return 0;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
