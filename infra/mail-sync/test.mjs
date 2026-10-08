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
import { decidirSiAbrir, huellaDeStatus } from "./barrido.mjs";
import { ancestrosDe, decidirHerencia, DIAS_PARA_ARCHIVAR } from "./hilos.mjs";
import { reaccionDe, sinLaReaccion, TIPO_REACCION } from "./reaccion.mjs";

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

// --- barrido.mjs: cuándo se abre una carpeta y cuándo se salta --------------
// El STATUS es lo que ahorra el grueso del tráfico contra Zoho (10/09); estos
// casos fijan que el ahorro nunca se coma un correo ni un cambio de banderas.

const st = (extra = {}) => ({ path: "INBOX", messages: 120, uidNext: 501, uidValidity: 7n, unseen: 3, ...extra });
const base = { ultimaReconciliacion: 1_000_000, ahora: 1_000_000 + 60_000, reconciliarMs: 900_000 };

test("huella: los cuatro números del STATUS, BigInt incluido", () => {
  assert.equal(huellaDeStatus(st()), "7|501|120|3");
  assert.equal(huellaDeStatus(st({ unseen: undefined })), "7|501|120|-");
  assert.equal(huellaDeStatus(false), null);
  assert.equal(huellaDeStatus(null), null);
});

test("la primera vez se abre", () => {
  const d = decidirSiAbrir({ ...base, status: st(), huellaPrevia: null });
  assert.equal(d.abrir, true);
  assert.equal(d.motivo, "primera");
  assert.equal(d.huella, "7|501|120|3");
});

test("misma huella y reconciliación fresca: se salta", () => {
  const d = decidirSiAbrir({ ...base, status: st(), huellaPrevia: "7|501|120|3" });
  assert.equal(d.abrir, false);
  assert.equal(d.motivo, "igual");
});

test("llegó correo (sube UIDNEXT): se abre", () => {
  const d = decidirSiAbrir({ ...base, status: st(), huellaPrevia: "7|500|119|2" });
  assert.equal(d.abrir, true);
  assert.equal(d.motivo, "cambio");
});

test("alguien leyó desde otro lado (baja UNSEEN): se abre", () => {
  const d = decidirSiAbrir({ ...base, status: st(), huellaPrevia: "7|501|120|4" });
  assert.equal(d.abrir, true);
  assert.equal(d.motivo, "cambio");
});

test("se borró algo (baja MESSAGES) o renació la carpeta (uidvalidity): se abre", () => {
  assert.equal(decidirSiAbrir({ ...base, status: st(), huellaPrevia: "7|501|121|3" }).abrir, true);
  assert.equal(decidirSiAbrir({ ...base, status: st(), huellaPrevia: "6|501|120|3" }).abrir, true);
});

test("pasó el piso de reconciliación: se abre aunque nada cambió", () => {
  const d = decidirSiAbrir({ ...base, ahora: 1_000_000 + 900_000, status: st(), huellaPrevia: "7|501|120|3" });
  assert.equal(d.abrir, true);
  assert.equal(d.motivo, "reconciliar");
});

test("sin STATUS (el servidor no contestó): se abre como siempre y no deja huella", () => {
  const d = decidirSiAbrir({ ...base, status: false, huellaPrevia: "7|501|120|3" });
  assert.equal(d.abrir, true);
  assert.equal(d.motivo, "sin-status");
  assert.equal(d.huella, null);
});

// ── Respuestas que heredan la etiqueta de su charla (Keila, 02/10) ──────────
const AHORA = Date.parse("2026-10-02T20:00:00Z");
const hace = (horas) => new Date(AHORA - horas * 3600_000).toISOString();

test("ancestros: In-Reply-To + References sin repetir y sin vacíos", () => {
  assert.deepEqual(ancestrosDe({ inReplyTo: "<b@x>", refs: ["<a@x>", "<b@x>", " "] }), ["<b@x>", "<a@x>"]);
  assert.deepEqual(ancestrosDe({ inReplyTo: null, refs: "<a@x>" }), ["<a@x>"]);
  assert.deepEqual(ancestrosDe({ inReplyTo: null, refs: null }), []);
});

test("charla etiquetada y ARCHIVADA: la respuesta hereda y se archiva", () => {
  const d = decidirHerencia({ etiquetasDelHilo: ["porAprobar", "porAprobar"], yaTieneEtiquetas: false, etiquetadosEnRecibidos: false, fecha: hace(1), ahora: AHORA });
  assert.deepEqual(d, { etiquetas: ["porAprobar"], archivar: true });
});

test("charla etiquetada pero en Recibidos: hereda y se queda en la bandeja", () => {
  const d = decidirHerencia({ etiquetasDelHilo: ["rrhh"], yaTieneEtiquetas: false, etiquetadosEnRecibidos: true, fecha: hace(1), ahora: AHORA });
  assert.deepEqual(d, { etiquetas: ["rrhh"], archivar: false });
});

test("si ya tiene etiquetas (alguien la ordenó o la devolvió a Recibidos) no se toca", () => {
  const d = decidirHerencia({ etiquetasDelHilo: ["rrhh"], yaTieneEtiquetas: true, etiquetadosEnRecibidos: false, fecha: hace(1), ahora: AHORA });
  assert.deepEqual(d, { etiquetas: [], archivar: false });
});

test("charla sin etiquetas: nada", () => {
  assert.deepEqual(decidirHerencia({ etiquetasDelHilo: [], yaTieneEtiquetas: false, etiquetadosEnRecibidos: false, fecha: hace(1), ahora: AHORA }),
    { etiquetas: [], archivar: false });
});

test("una respuesta vieja que recién se baja se etiqueta pero NO se archiva sola", () => {
  const d = decidirHerencia({ etiquetasDelHilo: ["cripto"], yaTieneEtiquetas: false, etiquetadosEnRecibidos: false, fecha: hace(24 * (DIAS_PARA_ARCHIVAR + 1)), ahora: AHORA });
  assert.deepEqual(d, { etiquetas: ["cripto"], archivar: false });
  const sinFecha = decidirHerencia({ etiquetasDelHilo: ["cripto"], yaTieneEtiquetas: false, etiquetadosEnRecibidos: false, fecha: null, ahora: AHORA });
  assert.equal(sinFecha.archivar, false);
});

test("SEGUNDA COPIA del mismo correo (Zoho entrega dos): se archiva con la primera", () => {
  // uid 54 heredó y se archivó; uid 55 (mismo Message-ID) ya «tiene» la etiqueta.
  const d = decidirHerencia({ etiquetasDelHilo: ["cxc"], yaTieneEtiquetas: true, etiquetadosEnRecibidos: false, fecha: hace(1), ahora: AHORA, otraCopiaArchivada: true });
  assert.deepEqual(d, { etiquetas: [], archivar: true });
  // Sin una copia archivada recién, «ya tiene etiquetas» sigue queriendo decir: no tocar.
  const sinCopia = decidirHerencia({ etiquetasDelHilo: ["cxc"], yaTieneEtiquetas: true, etiquetadosEnRecibidos: false, fecha: hace(1), ahora: AHORA });
  assert.deepEqual(sinCopia, { etiquetas: [], archivar: false });
});

// ── Reacciones con emoji (como Gmail; Keila, 08/10) ───────────────────────
const parteReaccion = (json, extra = {}) => ({ contentType: TIPO_REACCION, content: Buffer.from(json, "utf8"), ...extra });

test("una reacción de Gmail se reconoce: su emoji", () => {
  assert.equal(reaccionDe({ inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"👍","version":1}')] }), "👍");
  assert.equal(reaccionDe({ inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"👍🏽","version":1}')] }), "👍🏽");
});

test("lo que no cumple las reglas de Google es un correo común", () => {
  const casos = [
    { inReplyTo: null, attachments: [parteReaccion('{"emoji":"👍","version":1}')] }, // sin In-Reply-To
    { inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"👍","version":"1"}')] }, // version string
    { inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"👍👍","version":1}')] }, // dos emojis
    { inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"ok","version":1}')] },
    { inReplyTo: "<o@x>", attachments: [parteReaccion("no es json")] },
    { inReplyTo: "<o@x>", attachments: [parteReaccion('{"emoji":"👍","version":1}', { contentDisposition: "attachment" })] },
    { inReplyTo: "<o@x>", attachments: [] },
  ];
  for (const c of casos) assert.equal(reaccionDe(c), null);
});

test("la parte de la reacción no se muestra como adjunto", () => {
  const pdf = { contentType: "application/pdf", filename: "a.pdf" };
  assert.deepEqual(sinLaReaccion([parteReaccion("{}"), pdf]), [pdf]);
});
