#!/usr/bin/env node
// Corre la suite ENTERA de vitest y la da por buena solo si el resumen lo dice:
// «Test Files» sin fallas (un archivo que no carga cuenta como falla), «Tests» sin
// fallas, sin errores sueltos, código 0, y EXACTAMENTE los archivos de test que hay
// en frontend/src (la lista, sacada del informe JSON de vitest; no la cuenta).
//
//   node scripts/ci/vitest-completo.mjs [--parcial] [opciones de vitest]
//
// `--parcial` es del corredor: la corrida es un subconjunto a propósito (un filtro,
// --shard) y no se compara contra el disco. Sin él la comparación corre siempre, y
// un argumento que achica la corrida da rojo.
//
// La usa .github/workflows/guard-frontend.yml. Por qué no alcanza con el código de
// salida: ver el comentario de arriba de guardas.mjs.
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ES_ARCHIVO_DE_TEST, archivosDelInformeVitest, argumentosDelCorredor, leerResumenVitest, problemasVitest } from "./guardas.mjs";

const raiz = process.cwd();
const { parcial, paraVitest } = argumentosDelCorredor(process.argv.slice(2));

/** Los archivos de test de frontend/src, desde la raíz («frontend/src/x.test.ts»). */
function testsEnDisco(dir, rel) {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) res.push(...testsEnDisco(ruta, `${rel}/${e.name}`));
    else if (ES_ARCHIVO_DE_TEST.test(e.name)) res.push(`${rel}/${e.name}`);
  }
  return res;
}

const env = { ...process.env, NO_COLOR: "1" };
// FORCE_COLOR="0" también prende los colores en picocolors (es un string no vacío).
delete env.FORCE_COLOR;

// Los reporteros van explícitos: el de siempre (el resumen que se lee), el JSON (la
// lista de archivos que corrió) y, en GitHub, el que anota las fallas en el PR.
// Sin esto vitest elige solo: dentro de un agente de IA usa «agent» en vez de
// «default», y un `reporters` en vitest.config.ts cambiaría lo que se lee.
const dirInforme = mkdtempSync(join(tmpdir(), "vitest-informe-"));
const informe = join(dirInforme, "informe.json");
const reporteros = ["--reporter=default", "--reporter=json", `--outputFile.json=${informe}`];
if (process.env.GITHUB_ACTIONS === "true") reporteros.push("--reporter=github-actions");

const hijo = spawn(join(raiz, "node_modules", ".bin", "vitest"), ["run", ...reporteros, ...paraVitest], {
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
let ejecutados = null;
try {
  ejecutados = archivosDelInformeVitest(readFileSync(informe, "utf8"), [raiz, realpathSync(raiz)]);
} catch {
  // Sin informe: problemasVitest lo marca (si hay que comparar).
}
rmSync(dirInforme, { recursive: true, force: true });
const enDisco = parcial ? null : testsEnDisco(join(raiz, "frontend", "src"), "frontend/src").sort();
const problemas = problemasVitest({ codigo, resumen, enDisco, ejecutados });

const a = resumen.archivos;
const t = resumen.pruebas;
console.log("\n── guarda de vitest ──");
console.log(`archivos de test: ${a ? `${a.passed} ok, ${a.failed} con fallas, ${a.skipped} salteados (de ${a.total})` : "sin resumen"}`);
if (enDisco != null) {
  const iguales = ejecutados != null && ejecutados.length === enDisco.length && ejecutados.every((r, i) => r === enDisco[i]);
  console.log(`archivos de test en frontend/src: ${enDisco.length}; vitest corrió exactamente esos: ${iguales ? "sí" : "NO"}`);
} else console.log("corrida --parcial: no se compara contra frontend/src");
const esperadas = t?.expectedFail ? `, ${t.expectedFail} fallas esperadas (test.fails)` : "";
console.log(`pruebas: ${t ? `${t.passed} ok, ${t.failed} con fallas, ${t.skipped} salteadas${esperadas} (de ${t.total})` : "sin resumen"}`);
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
    ...(enDisco != null ? [`Archivos de test en \`frontend/src\`: ${enDisco.length}`, ""] : []),
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
