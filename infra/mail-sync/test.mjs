// Tests de la COPIA del saneador (los mismos 19 casos que la versión TS en
// supabase/functions/_shared/html-sanitize.test.ts). Correr: `npm test`.
//
// Existen porque la copia se mantiene A MANO: al portarla ya se coló una
// vez el bug de guiones/espacios que estos tests atrapan. Sin este archivo,
// una copia rota sanea de menos (agujero) o de más (correos ilegibles) y
// nadie se entera hasta producción.

import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeEmailHtml } from "./sanitize.mjs";

const limpio = (html) => sanitizeEmailHtml(html).html;

test("conserva tablas con estilos y colores", () => {
  const out = limpio(
    '<table border="0" cellpadding="8" bgcolor="#1a1a2e">' +
    '<tr><td style="color:#fff;font-size:14px">TK-0159</td></tr></table>',
  );
  assert.ok(out.includes("<table"));
  assert.ok(out.includes('bgcolor="#1a1a2e"'));
  assert.ok(out.includes("font-size:14px"));
  assert.ok(out.includes("TK-0159"));
});

test("conserva enlaces http y les fuerza target y rel", () => {
  const out = limpio('<a href="https://instagram.com/x">perfil</a>');
  assert.ok(out.includes('href="https://instagram.com/x"'));
  assert.ok(out.includes('target="_blank"'));
  assert.ok(out.includes("noopener"));
});

test("no rompe guiones ni espacios en CSS", () => {
  const out = limpio('<div style="font-size:12px;background-color:#eee">x</div>');
  assert.ok(out.includes("font-size:12px"));
  assert.ok(out.includes("background-color:#eee"));
});

test("conserva entidades sin doble escape", () => {
  const out = limpio("<p>Reuni&oacute;n &amp; caf&eacute;</p>");
  assert.ok(out.includes("&oacute;"));
  assert.ok(!out.includes("&amp;oacute;"));
});

test("descarta script con su contenido", () => {
  const out = limpio("hola<script>alert(document.cookie)</script>chau");
  assert.ok(!out.includes("script"));
  assert.ok(!out.includes("alert"));
  assert.ok(out.includes("hola"));
  assert.ok(out.includes("chau"));
});

test("descarta manejadores de eventos", () => {
  const out = limpio('<div onclick="robar()" onmouseover="x()">texto</div>');
  assert.ok(!/onclick/i.test(out));
  assert.ok(!/onmouseover/i.test(out));
  assert.ok(out.includes("texto"));
});

test("descarta javascript: en href", () => {
  const out = limpio('<a href="javascript:alert(1)">click</a>');
  assert.ok(!/javascript/i.test(out));
});

test("descarta javascript: con caracteres de control intercalados", () => {
  const out = limpio('<a href="java\u0000script:alert(1)">a</a><a href="java\tscript:x">b</a>');
  assert.ok(!/javascript/i.test(out.replace(/[\u0000-\u001F]/g, "")));
});

test("descarta data: en src", () => {
  const out = limpio('<img src="data:text/html;base64,PHNjcmlwdD4=">');
  assert.ok(!/data:/i.test(out));
});

test("descarta iframe, object y embed con su contenido", () => {
  const out = limpio('<iframe src="//evil"></iframe><object data="x"></object><embed src="y">');
  assert.ok(!/iframe|object|embed/i.test(out));
});

test("descarta style y su contenido", () => {
  const out = limpio("<style>body{background:url(//tracker)}</style><p>ok</p>");
  assert.ok(!out.includes("tracker"));
  assert.ok(out.includes("ok"));
});

test("neutraliza expression() en style inline", () => {
  const out = limpio('<div style="width:expression(alert(1))">x</div>');
  assert.ok(!/expression/i.test(out));
});

test("degrada position:fixed a static", () => {
  const out = limpio('<div style="position:fixed;top:0">x</div>');
  assert.ok(!/position\s*:\s*fixed/i.test(out));
});

test("descarta formularios y campos de entrada", () => {
  const out = limpio('<form action="//evil"><input name="pass" type="password"></form>');
  assert.ok(!/form|input/i.test(out));
});

test("descarta comentarios", () => {
  const out = limpio("<!--[if IE]><script>x()</script><![endif]-->visible");
  assert.ok(!out.includes("script"));
  assert.ok(out.includes("visible"));
});

test("etiqueta desconocida se descarta pero conserva su texto", () => {
  const out = limpio("<marquee>importante</marquee>");
  assert.ok(!/marquee/i.test(out));
  assert.ok(out.includes("importante"));
});

test("un tag sin cerrar al final no arrastra basura", () => {
  const out = limpio("<p>ok</p><div onclick=");
  assert.ok(out.includes("ok"));
  assert.ok(!/onclick/i.test(out));
});

test("cuenta las imágenes remotas", () => {
  const r = sanitizeEmailHtml(
    '<img src="https://a/1.png"><img src="https://b/2.png"><img src="cid:local">',
  );
  assert.equal(r.remoteImages, 2);
});

test("informa qué se descartó", () => {
  const r = sanitizeEmailHtml('<script>x</script><div onclick="y">z</div>');
  assert.ok(r.dropped.includes("script"));
  assert.ok(r.dropped.some((d) => d.includes("onclick")));
});
