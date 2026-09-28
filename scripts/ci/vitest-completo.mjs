#!/usr/bin/env node
// Corre la suite ENTERA de vitest y la da por buena solo si el resumen lo dice:
// «Test Files» sin fallas (un archivo que no carga cuenta como falla), «Tests» sin
// fallas, sin errores sueltos, código 0, y tantos archivos como hay en disco.
//
//   node scripts/ci/vitest-completo.mjs [opciones de vitest, con «=»: --testTimeout=30000]
//
// La usa .github/workflows/guard-frontend.yml. Por qué no alcanza con el código de
// salida: ver el comentario de arriba de guardas.mjs.
import { spawn } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ES_ARCHIVO_DE_TEST, corridaParcial, leerResumenVitest, problemasVitest } from "./guardas.mjs";

const raiz = process.cwd();
const extra = process.argv.slice(2);

function contarTestsEnDisco(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) n += contarTestsEnDisco(ruta);
    else if (ES_ARCHIVO_DE_TEST.test(e.name)) n++;
  }
  return n;
}

const env = { ...process.env, NO_COLOR: "1" };
// FORCE_COLOR="0" también prende los colores en picocolors (es un string no vacío).
delete env.FORCE_COLOR;

const hijo = spawn(join(raiz, "node_modules", ".bin", "vitest"), ["run", ...extra], {
  cwd: raiz,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let salida = "";
hijo.stdout.on("data", (b) => {
  salida += b;
  process.stdout.write(b);
});
hijo.stderr.on("data", (b) => {
  salida += b;
  process.stderr.write(b);
});

const codigo = await new Promise((ok) => {
  hijo.on("error", (e) => {
    console.error(`no se pudo arrancar vitest: ${e.message}`);
    ok(127);
  });
  hijo.on("close", (c, senal) => ok(c ?? (senal ? 128 : 1)));
});

const resumen = leerResumenVitest(salida);
const enDisco = corridaParcial(extra) ? null : contarTestsEnDisco(join(raiz, "frontend", "src"));
const problemas = problemasVitest({ codigo, resumen, enDisco });

const a = resumen.archivos;
const t = resumen.pruebas;
console.log("\n── guarda de vitest ──");
console.log(`archivos de test: ${a ? `${a.passed} ok, ${a.failed} con fallas, ${a.skipped} salteados (de ${a.total})` : "sin resumen"}`);
if (enDisco != null) console.log(`archivos de test en frontend/src: ${enDisco}`);
console.log(`pruebas: ${t ? `${t.passed} ok, ${t.failed} con fallas, ${t.skipped} salteadas (de ${t.total})` : "sin resumen"}`);
for (const f of resumen.archivosQueFallan) console.log(`::error file=${f},title=vitest::falla o no carga`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const filas = [
    "### vitest (suite entera)",
    "",
    "| | ok | con fallas | salteados | total |",
    "|---|---|---|---|---|",
    a ? `| Archivos | ${a.passed} | ${a.failed} | ${a.skipped} | ${a.total} |` : "| Archivos | — | — | — | — |",
    t ? `| Pruebas | ${t.passed} | ${t.failed} | ${t.skipped} | ${t.total} |` : "| Pruebas | — | — | — | — |",
    "",
    ...(enDisco != null ? [`Archivos de test en \`frontend/src\`: ${enDisco}`, ""] : []),
    ...(resumen.archivosQueFallan.length ? ["Archivos que fallan o no cargan:", "", ...resumen.archivosQueFallan.map((f) => `- \`${f}\``), ""] : []),
    problemas.length ? `**Rojo:** ${problemas.join("; ")}` : "**Verde.**",
    "",
  ];
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, filas.join("\n"));
  } catch {
    /* el resumen es un extra: no tapa el resultado */
  }
}

if (problemas.length) {
  console.log("\nROJO:");
  for (const p of problemas) console.log(`  - ${p}`);
  process.exit(1);
}
console.log("\nVERDE.");
