// Tests del saneador de HTML de correos.
//
// Estos tests son la línea de defensa real: sanear HTML con manipulación de
// texto es difícil de hacer perfecto, y sin casos escritos cada cambio futuro
// puede abrir un agujero sin que nadie lo note. Cada caso de acá corresponde
// a una técnica conocida de inyección.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { sanitizeEmailHtml } from "./html-sanitize.ts";

function limpio(html: string): string {
  return sanitizeEmailHtml(html).html;
}

// --- Lo que SÍ tiene que sobrevivir -----------------------------------------
// Los correos del sistema de tickets son tablas con estilos inline. Si el
// saneador los rompe, el módulo de correo no sirve para nada.

Deno.test("conserva tablas con estilos y colores", () => {
  const out = limpio(
    '<table border="0" cellpadding="8" bgcolor="#1a1a2e">' +
    '<tr><td style="color:#fff;font-size:14px">TK-0159</td></tr></table>',
  );
  assertStringIncludes(out, "<table");
  assertStringIncludes(out, 'bgcolor="#1a1a2e"');
  assertStringIncludes(out, "font-size:14px");
  assertStringIncludes(out, "TK-0159");
});

Deno.test("conserva enlaces http y les fuerza target y rel", () => {
  const out = limpio('<a href="https://instagram.com/x">perfil</a>');
  assertStringIncludes(out, 'href="https://instagram.com/x"');
  assertStringIncludes(out, 'target="_blank"');
  assertStringIncludes(out, "noopener");
});

Deno.test("no rompe guiones ni espacios en CSS", () => {
  // Este fue un bug real: una clase de caracteres mal escrita borraba los
  // guiones y convertía font-size en fontsize.
  const out = limpio('<div style="font-size:12px;background-color:#eee">x</div>');
  assertStringIncludes(out, "font-size:12px");
  assertStringIncludes(out, "background-color:#eee");
});

Deno.test("conserva entidades sin doble escape", () => {
  const out = limpio("<p>Reuni&oacute;n &amp; caf&eacute;</p>");
  assertStringIncludes(out, "&oacute;");
  assert(!out.includes("&amp;oacute;"), "no debe re-escapar el &");
});

// --- Lo que NO tiene que sobrevivir -----------------------------------------

Deno.test("descarta script con su contenido", () => {
  const out = limpio('hola<script>alert(document.cookie)</script>chau');
  assert(!out.includes("script"), "no debe quedar el tag");
  assert(!out.includes("alert"), "no debe quedar el contenido");
  assertStringIncludes(out, "hola");
  assertStringIncludes(out, "chau");
});

Deno.test("descarta manejadores de eventos", () => {
  const out = limpio('<div onclick="robar()" onmouseover="x()">texto</div>');
  assert(!/onclick/i.test(out));
  assert(!/onmouseover/i.test(out));
  assertStringIncludes(out, "texto");
});

Deno.test("descarta javascript: en href", () => {
  const out = limpio('<a href="javascript:alert(1)">click</a>');
  assert(!/javascript/i.test(out));
});

Deno.test("descarta javascript: con caracteres de control intercalados", () => {
  // Técnica clásica: "java\tscript:" o con NUL pasa un filtro naive.
  const out = limpio('<a href="java\u0000script:alert(1)">a</a><a href="java\tscript:x">b</a>');
  assert(!/javascript/i.test(out.replace(/[\u0000-\u001F]/g, "")));
});

Deno.test("descarta data: en src (permite incrustar HTML arbitrario)", () => {
  const out = limpio('<img src="data:text/html;base64,PHNjcmlwdD4=">');
  assert(!/data:/i.test(out));
});

Deno.test("descarta iframe, object y embed con su contenido", () => {
  const out = limpio('<iframe src="//evil"></iframe><object data="x"></object><embed src="y">');
  assert(!/iframe|object|embed/i.test(out));
});

Deno.test("descarta style y su contenido", () => {
  const out = limpio("<style>body{background:url(//tracker)}</style><p>ok</p>");
  assert(!out.includes("tracker"));
  assertStringIncludes(out, "ok");
});

Deno.test("neutraliza expression() y @import en style inline", () => {
  const out = limpio('<div style="width:expression(alert(1))">x</div>');
  assert(!/expression/i.test(out));
});

Deno.test("degrada position:fixed a static", () => {
  // Un correo con position:fixed puede tapar la interfaz de Maven con
  // contenido propio — base de un ataque de clickjacking.
  const out = limpio('<div style="position:fixed;top:0">x</div>');
  assert(!/position\s*:\s*fixed/i.test(out));
});

Deno.test("descarta formularios y campos de entrada", () => {
  const out = limpio('<form action="//evil"><input name="pass" type="password"></form>');
  assert(!/form|input/i.test(out));
});

Deno.test("descarta comentarios, que pueden esconder markup", () => {
  const out = limpio("<!--[if IE]><script>x()</script><![endif]-->visible");
  assert(!out.includes("script"));
  assertStringIncludes(out, "visible");
});

Deno.test("etiqueta desconocida se descarta pero conserva su texto", () => {
  const out = limpio("<marquee>importante</marquee>");
  assert(!/marquee/i.test(out));
  assertStringIncludes(out, "importante");
});

Deno.test("un tag sin cerrar al final no arrastra basura", () => {
  const out = limpio("<p>ok</p><div onclick=");
  assertStringIncludes(out, "ok");
  assert(!/onclick/i.test(out));
});

// --- Reporte ----------------------------------------------------------------

Deno.test("cuenta las imágenes remotas para poder bloquearlas", () => {
  // Las imágenes remotas son píxeles de rastreo: cargarlas le confirma al
  // remitente que el correo se abrió. El frontend las bloquea hasta que el
  // usuario decida, y necesita saber cuántas hay para poder ofrecerlo.
  const r = sanitizeEmailHtml(
    '<img src="https://a/1.png"><img src="https://b/2.png"><img src="cid:local">',
  );
  assertEquals(r.remoteImages, 2);
});

Deno.test("informa qué se descartó, para poder auditar", () => {
  const r = sanitizeEmailHtml('<script>x</script><div onclick="y">z</div>');
  assert(r.dropped.includes("script"));
  assert(r.dropped.some((d) => d.includes("onclick")));
});
