// Saneamiento del HTML de los correos.
//
// AMENAZA: el cuerpo de un correo es contenido escrito por un tercero
// cualquiera. Si se renderiza tal cual, quien manda el correo puede ejecutar
// JavaScript en la sesión de un empleado de Maven — leer su token, hacer
// pedidos con su identidad, todo. Es la vulnerabilidad clásica de cualquier
// cliente de correo web.
//
// DEFENSA EN DOS CAPAS, a propósito:
//   1. Acá: se descarta todo lo que no esté en una lista blanca explícita.
//   2. En el frontend: el HTML resultante se pinta dentro de un <iframe
//      sandbox> sin permisos. Aunque algo se escapara de esta función, el
//      iframe no le deja ejecutar nada ni ver la sesión.
// Una sola capa no alcanza: sanear HTML con manipulación de texto es
// notoriamente difícil de hacer perfecto, y el sandbox es el que garantiza.
//
// ENFOQUE: no usamos reemplazos de regex sobre el documento entero (frágil y
// fácil de eludir con tags anidados o atributos raros). Recorremos el texto
// tag por tag y reconstruimos una versión limpia.

/** Etiquetas que se conservan. Todo lo demás se descarta. Pensada para
 *  correos: mucha tabla y mucho estilo inline, que es como se maquetan. */
const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup",
  "dd", "div", "dl", "dt", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "ol", "p", "pre", "s", "small", "span", "strike",
  "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
  "tr", "u", "ul",
]);

/** Etiquetas cuyo CONTENIDO también se descarta, no solo la etiqueta. */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "applet", "noscript",
  "template", "svg", "math", "form", "button", "input", "select", "textarea",
  "link", "meta", "title", "head", "base",
]);

/** Atributos permitidos por etiqueta. `*` aplica a todas. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["style", "class", "align", "valign", "dir", "title"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  table: new Set(["border", "cellpadding", "cellspacing", "width", "bgcolor"]),
  td: new Set(["colspan", "rowspan", "width", "height", "bgcolor"]),
  th: new Set(["colspan", "rowspan", "width", "height", "bgcolor"]),
  tr: new Set(["bgcolor"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span", "width"]),
  font: new Set(["color", "face", "size"]),
  div: new Set(["bgcolor"]),
  p: new Set(["bgcolor"]),
};

const VOID_TAGS = new Set(["br", "hr", "img", "col", "meta", "link", "base"]);

/** Esquemas de URL aceptados. `javascript:` y `data:` quedan afuera: el
 *  primero ejecuta código, el segundo permite incrustar HTML arbitrario. */
function safeUrl(raw: string): string | null {
  // Se quitan caracteres de CONTROL (no espacios ni guiones, que son
  // legítimos en URLs): se usan para colar "java\u0000script:" o
  // "java\tscript:" y esquivar la comparación de esquema.
  const v = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  // Un `javascript&colon;` o con espacios/tabs intercalados también cuenta,
  // así que normalizamos antes de comparar.
  const probe = v.toLowerCase().replace(/\s+/g, "");
  if (/^(javascript|vbscript|data|file|about|blob):/.test(probe)) return null;
  if (/^(https?:|mailto:|tel:|cid:|#|\/)/.test(probe)) return v;
  // Sin esquema (relativa) la dejamos pasar: dentro del iframe no resuelve
  // a nada peligroso.
  if (!/:/.test(probe)) return v;
  return null;
}

/** El `style` inline se conserva porque los correos lo usan para todo, pero
 *  se le sacan las construcciones que pueden ejecutar o cargar cosas. */
function safeStyle(value: string): string {
  let v = value.replace(/[\u0000-\u001F\u007F]/g, "");
  // expression() ejecuta JS en IE viejo; url() puede filtrar datos o cargar
  // remoto; @import trae hojas externas; position:fixed permite tapar la UI
  // de Maven con contenido del correo.
  if (/expression\s*\(|javascript:|vbscript:|@import|behavior\s*:/i.test(v)) return "";
  v = v.replace(/url\s*\(([^)]*)\)/gi, (all, inner: string) => {
    const u = safeUrl(inner.replace(/^["']|["']$/g, ""));
    return u ? `url(${u})` : "";
  });
  v = v.replace(/position\s*:\s*(fixed|sticky)/gi, "position:static");
  return v.trim();
}

interface Attr {
  name: string;
  value: string | null;
}

/** Parsea los atributos de un tag ya recortado (sin `<nombre` ni `>`). */
function parseAttrs(src: string): Attr[] {
  const out: Attr[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const value = m[3] ?? m[4] ?? m[5] ?? null;
    out.push({ name: m[1].toLowerCase(), value });
  }
  return out;
}

function escapeText(s: string): string {
  // Solo `<` y `>`: las entidades del correo (&nbsp;, &amp;) se dejan como
  // están, y escapar `&` las rompería mostrando "&amp;nbsp;".
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SanitizeResult {
  html: string;
  /** Cuántas imágenes remotas se encontraron. El frontend las bloquea hasta
   *  que el usuario decida: cargarlas le avisa al remitente que abrió el
   *  correo (los píxeles de rastreo son exactamente eso). */
  remoteImages: number;
  /** Qué se descartó, para poder auditar si algo se ve raro. */
  dropped: string[];
}

export function sanitizeEmailHtml(input: string): SanitizeResult {
  const dropped: string[] = [];
  let remoteImages = 0;
  let out = "";
  let i = 0;
  /** Cuando entramos a un tag de los que se descartan con contenido,
   *  guardamos su nombre y tiramos todo hasta su cierre. */
  let skipUntil: string | null = null;

  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      if (!skipUntil) out += escapeText(input.slice(i));
      break;
    }
    if (!skipUntil) out += escapeText(input.slice(i, lt));

    // Comentarios: se descartan enteros. Pueden esconder condicionales de
    // Outlook con markup adentro.
    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt);
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    // Doctype y otras declaraciones.
    if (input.startsWith("<!", lt)) {
      const end = input.indexOf(">", lt);
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    const gt = input.indexOf(">", lt);
    if (gt === -1) {
      // Tag sin cerrar al final del documento: se descarta el resto.
      break;
    }
    const rawTag = input.slice(lt + 1, gt);
    const isClose = rawTag.startsWith("/");
    const body = isClose ? rawTag.slice(1) : rawTag;
    const nameMatch = body.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    i = gt + 1;

    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();

    // Modo "tirar contenido": esperamos el cierre del tag que lo abrió.
    if (skipUntil) {
      if (isClose && name === skipUntil) skipUntil = null;
      continue;
    }

    if (DROP_WITH_CONTENT.has(name)) {
      if (!isClose && !VOID_TAGS.has(name)) skipUntil = name;
      dropped.push(name);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Etiqueta desconocida: se descarta la etiqueta pero se conserva su
      // contenido, así no se pierde texto por un tag exótico.
      dropped.push(name);
      continue;
    }

    if (isClose) {
      out += `</${name}>`;
      continue;
    }

    // Atributos
    const allowed = ALLOWED_ATTRS[name] ?? new Set<string>();
    const universal = ALLOWED_ATTRS["*"];
    const attrs = parseAttrs(body.slice(name.length));
    let rendered = `<${name}`;

    for (const a of attrs) {
      // Cualquier on* es un manejador de eventos: fuera sin excepción.
      if (a.name.startsWith("on")) {
        dropped.push(`${name}@${a.name}`);
        continue;
      }
      if (!allowed.has(a.name) && !universal.has(a.name)) continue;
      if (a.value === null) {
        rendered += ` ${a.name}`;
        continue;
      }

      let value = a.value;
      if (a.name === "href" || a.name === "src") {
        const safe = safeUrl(value);
        if (!safe) {
          dropped.push(`${name}@${a.name}`);
          continue;
        }
        value = safe;
        if (a.name === "src" && /^https?:/i.test(value)) remoteImages++;
      } else if (a.name === "style") {
        value = safeStyle(value);
        if (!value) continue;
      }
      rendered += ` ${a.name}="${value.replace(/"/g, "&quot;")}"`;
    }

    // Los enlaces siempre abren afuera y sin pasarle la referencia a la
    // página destino. `noopener` evita que el destino manipule la ventana.
    if (name === "a") rendered += ' target="_blank" rel="noopener noreferrer nofollow"';

    rendered += VOID_TAGS.has(name) ? " />" : ">";
    out += rendered;
  }

  return { html: out, remoteImages, dropped: [...new Set(dropped)] };
}
