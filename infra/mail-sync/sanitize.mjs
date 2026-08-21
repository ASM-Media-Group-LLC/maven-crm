// COPIA FIEL de supabase/functions/_shared/html-sanitize.ts, portada a JS.
//
// ⚠️ MANTENER EN SINCRONÍA A MANO: los tests (19 casos, uno por técnica de
// inyección conocida) viven en supabase/functions/_shared/html-sanitize.test.ts
// y corren contra la versión TS. Si se cambia una, se cambia la otra.
//
// Por qué existe la copia: este worker corre en Node (imapflow/mailparser no
// existen en Deno edge), y el saneado tiene que pasar ANTES de guardar en la
// caché — lo que llega al navegador desde mail_messages ya está limpio. El
// iframe sandbox del frontend sigue siendo la segunda capa, como siempre.

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup",
  "dd", "div", "dl", "dt", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "ol", "p", "pre", "s", "small", "span", "strike",
  "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
  "tr", "u", "ul",
]);

const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "applet", "noscript",
  "template", "svg", "math", "form", "button", "input", "select", "textarea",
  "link", "meta", "title", "head", "base",
]);

const ALLOWED_ATTRS = {
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

function safeUrl(raw) {
  const v = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  const probe = v.toLowerCase().replace(/\s+/g, "");
  if (/^(javascript|vbscript|data|file|about|blob):/.test(probe)) return null;
  if (/^(https?:|mailto:|tel:|cid:|#|\/)/.test(probe)) return v;
  if (!/:/.test(probe)) return v;
  return null;
}

function safeStyle(value) {
  let v = value.replace(/[\u0000-\u001F\u007F]/g, "");
  if (/expression\s*\(|javascript:|vbscript:|@import|behavior\s*:/i.test(v)) return "";
  v = v.replace(/url\s*\(([^)]*)\)/gi, (_all, inner) => {
    const u = safeUrl(inner.replace(/^["']|["']$/g, ""));
    return u ? `url(${u})` : "";
  });
  v = v.replace(/position\s*:\s*(fixed|sticky)/gi, "position:static");
  return v.trim();
}

function parseAttrs(src) {
  const out = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const value = m[3] ?? m[4] ?? m[5] ?? null;
    out.push({ name: m[1].toLowerCase(), value });
  }
  return out;
}

function escapeText(s) {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeEmailHtml(input) {
  const dropped = [];
  let remoteImages = 0;
  let out = "";
  let i = 0;
  let skipUntil = null;

  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      if (!skipUntil) out += escapeText(input.slice(i));
      break;
    }
    if (!skipUntil) out += escapeText(input.slice(i, lt));

    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt);
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith("<!", lt)) {
      const end = input.indexOf(">", lt);
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    const gt = input.indexOf(">", lt);
    if (gt === -1) break;

    const rawTag = input.slice(lt + 1, gt);
    const isClose = rawTag.startsWith("/");
    const body = isClose ? rawTag.slice(1) : rawTag;
    const nameMatch = body.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    i = gt + 1;

    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();

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
      dropped.push(name);
      continue;
    }

    if (isClose) {
      out += `</${name}>`;
      continue;
    }

    const allowed = ALLOWED_ATTRS[name] ?? new Set();
    const universal = ALLOWED_ATTRS["*"];
    const attrs = parseAttrs(body.slice(name.length));
    let rendered = `<${name}`;

    for (const a of attrs) {
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

    if (name === "a") rendered += ' target="_blank" rel="noopener noreferrer nofollow"';

    rendered += VOID_TAGS.has(name) ? " />" : ">";
    out += rendered;
  }

  return { html: out, remoteImages, dropped: [...new Set(dropped)] };
}
