// test-fechas.mjs — casos obligatorios del parser de fechas de Facebook.
// Correr con:  node --test test-fechas.mjs    (o  npm test)
//
// POR QUÉ EXISTE: el 02/08 el parser leía "1 de agosto de 2026 a las 21:40" como
// "hace 1 día" —el regex de relativas matcheaba el `1` con la `d` de "de"— y le
// ponía a un post viejo una fecha reciente y PLAUSIBLE. Una fecha inventada es
// peor que ninguna: inventa un día de promo que no existió, y nadie la revisa
// porque parece correcta. Es el mismo bug que metió promos con fecha 2024 en X.
//
// Regla que codifican estos tests: **ante la duda, null**. Un post descartado se
// nota (queda como "no legible" en el informe); una fecha equivocada, no.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFechaFb } from "./fb-scraper.mjs";

const HORA = 3600_000, DIA = 86_400_000;
// Tolerancia para las relativas: se calculan contra Date.now() del momento.
const cerca = (a, b, ms = 60_000) => Math.abs(a - b) <= ms;
const bogota = (ts) => new Date(ts).toLocaleString("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

test("relativas en español e inglés", () => {
  const ahora = Date.now();
  for (const [txt, ms] of [
    ["hace 2 h", 2 * HORA], ["2 h", 2 * HORA], ["2h", 2 * HORA],
    ["45 min", 45 * 60_000], ["45m", 45 * 60_000],
    ["hace 3 días", 3 * DIA], ["3d", 3 * DIA], ["3 dias", 3 * DIA],
    ["1 sem", 7 * DIA],
  ]) {
    const r = parseFechaFb(txt);
    assert.ok(r !== null, `"${txt}" debería parsear`);
    assert.ok(cerca(r, ahora - ms), `"${txt}" → ${bogota(r)}, esperaba hace ${ms / HORA}h`);
  }
});

test("ayer / hoy en los dos idiomas", () => {
  const ahora = Date.now();
  for (const t of ["Ayer a las 21:40", "Yesterday at 9:22 PM"]) {
    assert.ok(cerca(parseFechaFb(t), ahora - DIA), `"${t}" debería ser ayer`);
  }
  for (const t of ["Hoy a las 10:00", "Today at 10:00 AM"]) {
    const r = parseFechaFb(t);
    assert.ok(r !== null && r <= ahora && r > ahora - DIA, `"${t}" debería ser hoy`);
  }
});

// ⚠️ EL CASO QUE ROMPIÓ. Sin el `\b` al final del regex de relativas, el `1` de
// "1 de agosto" matcheaba con la `d` de "de" → "hace 1 día".
test("absolutas NO se leen como relativas", () => {
  // Se usa una fecha VIEJA a propósito: si el bug vuelve, "1 de marzo de 2024" se
  // leería como "hace 1 día" y el post entraría como de ayer. Con una fecha de esta
  // semana el test no probaría nada — "1 de agosto" ES hace un día cuando hoy es 2.
  const r = parseFechaFb("1 de marzo de 2024 a las 21:40");
  assert.ok(r !== null, "debería parsear como fecha absoluta");
  const d = new Date(r);
  assert.equal(d.getFullYear(), 2024, `año: dio ${bogota(r)} — si dio el año actual, volvió el bug`);
  assert.equal(d.getMonth(), 2, `mes (marzo=2): dio ${bogota(r)}`);
  assert.equal(d.getDate(), 1, `día: dio ${bogota(r)}`);
  assert.equal(d.getHours(), 21, `hora: dio ${bogota(r)}`);
  // Lo que importa de verdad: un post de 2024 NO puede quedar dentro de la ventana
  // de 24h. Eso es lo que lo haría entrar como día de promo de hoy.
  assert.ok(r < Date.now() - 30 * DIA, `${bogota(r)} cayó dentro del último mes — el bug volvió`);
});

test("absolutas en los dos idiomas y con/sin año", () => {
  const casos = [
    ["1 de agosto de 2026 a las 21:40", 2026, 7, 1, 21, 40],
    ["1 de agosto a las 21:40", new Date().getFullYear(), 7, 1, 21, 40],
    ["August 1, 2026 at 9:22 PM", 2026, 7, 1, 21, 22],
    ["31 July at 21:40", new Date().getFullYear(), 6, 31, 21, 40],
    ["15 ene 2026", 2026, 0, 15, 12, 0],   // sin hora → mediodía, no 00:00
  ];
  for (const [txt, y, mes, dia, h, min] of casos) {
    const r = parseFechaFb(txt);
    assert.ok(r !== null, `"${txt}" debería parsear`);
    const d = new Date(r);
    assert.equal(d.getFullYear(), y, `${txt} → año ${bogota(r)}`);
    assert.equal(d.getMonth(), mes, `${txt} → mes ${bogota(r)}`);
    assert.equal(d.getDate(), dia, `${txt} → día ${bogota(r)}`);
    assert.equal(d.getHours(), h, `${txt} → hora ${bogota(r)}`);
    assert.equal(d.getMinutes(), min, `${txt} → min ${bogota(r)}`);
  }
});

// Sin año, una fecha que caería en el futuro es del año PASADO (post de diciembre
// leído en enero). Si no, un post de hace 11 meses entra como del mes que viene.
test("sin año, nunca en el futuro", () => {
  const enUnMes = new Date(Date.now() + 31 * DIA);
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const r = parseFechaFb(`${enUnMes.getDate()} de ${meses[enUnMes.getMonth()]} a las 10:00`);
  assert.ok(r !== null && r < Date.now(), `dio ${bogota(r)}, que está en el futuro`);
});

// Ante la duda, null: se descarta el post y queda visible en el informe como
// "no legible". Devolver una fecha inventada lo haría pasar por dato bueno.
test("lo que no es una fecha devuelve null", () => {
  for (const t of ["", "   ", "Me gusta", "Comentar", "Compartir", "3 comentarios",
                   "Ver más", "See more", null, undefined, "?!"]) {
    assert.equal(parseFechaFb(t), null, `"${t}" no debería parsear`);
  }
});
