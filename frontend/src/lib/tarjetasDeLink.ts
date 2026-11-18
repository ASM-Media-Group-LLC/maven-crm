// LA TARJETA QUE ARMA WHATSAPP AL PEGAR UN LINK DE MAVEN (Alvaro, 11/11/2026).
//
// WhatsApp, LinkedIn y compañía no corren JavaScript: leen las etiquetas
// <meta property="og:…"> del HTML tal como lo manda el servidor. Antes todos los
// links mostraban la misma tarjeta, en español y con «siete suscripciones»,
// hasta una invitación a reunión. Ahora hay tres, todas en inglés y con la
// estética de la portada:
//
//   · plataforma → app.maven-ai.me (y cualquier otra ruta)
//   · reunion    → /entrar/<código>: alguien te invitó a una reunión
//   · cowork     → /cowork?…: tu equipo te llama a una sala de Cowork
//
// El build (vite.config.ts → pluginTarjetasDeLink) escribe una copia de
// index.html por tarjeta y nginx.conf entrega cada copia en su ruta. La app que
// arranca es la misma: solo cambian las etiquetas que lee el que arma la vista
// previa.

export interface TarjetaDeLink {
  /** El archivo HTML que escribe el build (lo sirve nginx.conf). */
  archivo: string;
  url: string;
  titulo: string;
  descripcion: string;
  imagen: string;
  alt: string;
}

const BASE = "https://app.maven-ai.me";

export const TARJETAS = {
  plataforma: {
    archivo: "index.html",
    url: `${BASE}/`,
    titulo: "Maven · Your whole team, in a virtual office",
    descripcion: "The virtual office for your team: chat, meetings, your own email, docs and tasks.",
    imagen: `${BASE}/og-plataforma.jpg?v=6`,
    alt: "Maven: your whole team, in a virtual office",
  },
  reunion: {
    archivo: "og-reunion.html",
    url: `${BASE}/`,
    titulo: "Maven Meeting",
    descripcion: "Tap the link to join the meeting.",
    // v=8 (Alvaro, 17/11/2026): «que diga Maven y abajito Meeting, bonito, para
    // compartir en WhatsApp y Telegram». Subir el número al cambiar la imagen,
    // para que WhatsApp no siga mostrando la vieja.
    imagen: `${BASE}/og-reunion.jpg?v=8`,
    alt: "Maven Meeting",
  },
  cowork: {
    archivo: "og-cowork.html",
    url: `${BASE}/cowork`,
    titulo: "Your team is calling you",
    descripcion: "Tap the link to join your team's room, right from your browser.",
    imagen: `${BASE}/og-cowork.jpg?v=6`,
    alt: "Your team is calling you on Maven",
  },
} satisfies Record<string, TarjetaDeLink>;

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Cambia el `content` de una etiqueta <meta> (por `property` o `name`). */
function fijarMeta(html: string, atributo: "property" | "name", clave: string, valor: string): string {
  const re = new RegExp(`(<meta\\s+${atributo}="${clave.replace(/[.:]/g, "\\$&")}"\\s+content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`tarjetasDeLink: index.html has no <meta ${atributo}="${clave}">`);
  return html.replace(re, `$1${escapar(valor)}$2`);
}

/** El HTML de la app con las etiquetas de la tarjeta. Si index.html pierde una
 *  etiqueta, el build falla en vez de publicar una tarjeta a medias. */
export function conTarjeta(html: string, t: TarjetaDeLink): string {
  let out = html;
  out = fijarMeta(out, "property", "og:locale", "en_US");
  out = fijarMeta(out, "property", "og:url", t.url);
  out = fijarMeta(out, "property", "og:title", t.titulo);
  out = fijarMeta(out, "property", "og:description", t.descripcion);
  out = fijarMeta(out, "property", "og:image", t.imagen);
  out = fijarMeta(out, "property", "og:image:alt", t.alt);
  out = fijarMeta(out, "name", "twitter:title", t.titulo);
  out = fijarMeta(out, "name", "twitter:description", t.descripcion);
  out = fijarMeta(out, "name", "twitter:image", t.imagen);
  return out;
}
