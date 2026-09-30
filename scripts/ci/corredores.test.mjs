// node --test scripts/ci/corredores.test.mjs
// Los dos corredores (tsc-sin-errores-nuevos.mjs y vitest-completo.mjs), de punta a
// punta, contra un proyecto chico que se arma en una carpeta temporal y usa el
// node_modules del repo. guardas.test.mjs prueba las piezas; esto prueba cómo se
// juntan, que es donde estaba el agujero de `"noCheck": true` (las piezas estaban
// bien y la corrida igual daba verde).
// Cada caso rojo tiene al lado uno verde: la guarda tiene que PODER pasar también.
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARIO_TSC } from "./guardas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const NODE_MODULES = join(AQUI, "..", "..", "node_modules");

/** Un proyecto en una carpeta temporal, con el node_modules del repo enlazado (o,
 *  con `tscFalso`, uno propio que solo trae TSC_FALSO). */
function proyecto(archivos, { tscFalso = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "guarda-e2e-")));
  escribir(dir, { ".gitignore": "node_modules\n.cache\n", ...archivos });
  if (tscFalso) {
    escribir(dir, { "node_modules/typescript/package.json": '{ "name": "typescript" }\n', "node_modules/typescript/bin/tsc": TSC_FALSO });
  } else symlinkSync(NODE_MODULES, join(dir, "node_modules"), "dir");
  return dir;
}

/** Un tsc que, en el árbol que tiene «.revision-apagada», no revisa tipos: simula
 *  una forma de apagar la revisión que `--noCheck false` no pisa (hoy no se conoce
 *  ninguna; para eso está el canario). En el otro árbol es el tsc de verdad. */
const TSC_FALSO = `const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const apagada = existsSync(".revision-apagada") ? ["--noCheck", "true"] : [];
const r = spawnSync(process.execPath, [${JSON.stringify(join(NODE_MODULES, "typescript", "bin", "tsc"))}, ...process.argv.slice(2), ...apagada], { stdio: "inherit" });
process.exit(r.status ?? 1);
`;

/** Escribe (o borra, con null) archivos del proyecto. */
function escribir(dir, archivos) {
  for (const [ruta, texto] of Object.entries(archivos)) {
    if (texto == null) {
      rmSync(join(dir, ruta), { force: true });
      continue;
    }
    mkdirSync(dirname(join(dir, ruta)), { recursive: true });
    writeFileSync(join(dir, ruta), texto);
  }
}

const git = (dir, ...a) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=guarda", "-c", "user.email=guarda@example.invalid", "-c", "commit.gpgsign=false", ...a], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** Corre un corredor en el proyecto. Sin las variables de GitHub: que no escriba en el
 *  resumen del paso ni anote en el PR las fallas a propósito de estos casos. */
function correr(dir, script, args = []) {
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY;
  delete env.GITHUB_ACTIONS;
  const r = spawnSync(process.execPath, [join(AQUI, script), ...args], { cwd: dir, env, encoding: "utf8", timeout: 120_000 });
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}` };
}

// ─── tsc-sin-errores-nuevos.mjs ──────────────────────────────────────────────

const tsconfig = (extra = {}) =>
  JSON.stringify({
    compilerOptions: { noEmit: true, skipLibCheck: true, strict: false, target: "ES2020", module: "ESNext", moduleResolution: "bundler", types: [] },
    include: ["frontend/src"],
    ...extra,
  });
const conOpciones = (opciones) => {
  const t = JSON.parse(tsconfig());
  Object.assign(t.compilerOptions, opciones);
  return JSON.stringify(t);
};

/** Base con un error viejo; la cabeza = la base + `cambios`, en un commit aparte. */
function tscEntre(cambios, opciones) {
  const dir = proyecto({
    "package.json": '{ "name": "fx", "private": true }\n',
    "package-lock.json": '{ "name": "fx", "lockfileVersion": 3, "requires": true, "packages": { "": { "name": "fx" } } }\n',
    "tsconfig.app.json": tsconfig(),
    "frontend/src/viejo.ts": 'export const viejo: number = "un error que ya estaba";\n',
    "frontend/src/app.ts": "export const app = 1;\n",
  }, opciones);
  git(dir, "init", "--quiet");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "--no-verify", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  escribir(dir, cambios);
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", "cabeza");
  try {
    const r = correr(dir, "tsc-sin-errores-nuevos.mjs", [`--base=${base}`]);
    r.canarioBorrado = !existsSync(join(dir, CANARIO_TSC.archivo)) && !existsSync(join(dir, CANARIO_TSC.config));
    return r;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("tsc (de punta a punta): sin errores nuevos → VERDE, con el canario visto en las dos", () => {
  const r = tscEntre({ "frontend/src/app.ts": "export const app = 2;\n" });
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /base: {3}1 error\(es\).*canario visto/);
  assert.match(r.salida, /cabeza: 1 error\(es\).*canario visto/);
  assert.match(r.salida, /nuevos: 0 · arreglados: 0/);
  assert.ok(r.canarioBorrado, "el canario no queda en el árbol");
});

test("tsc (de punta a punta): un error nuevo → ROJO y lo nombra", () => {
  const r = tscEntre({ "frontend/src/app.ts": 'export const app: number = "nuevo";\n' });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /nuevos: 1 · arreglados: 0/);
  assert.match(r.salida, /NUEVO {2}frontend\/src\/app\.ts\(1,14\): error TS2322/);
});

test("tsc (de punta a punta): `\"noCheck\": true` en tsconfig.app.json NO apaga la guarda", () => {
  // Lo que encontró la revisión: tsc listaba todos los archivos, no marcaba ningún
  // error y el corredor decía «nuevos: 0 · arreglados: 1», VERDE.
  const r = tscEntre({
    "tsconfig.app.json": conOpciones({ noCheck: true }),
    "frontend/src/app.ts": 'export const app: number = "nuevo";\n',
  });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /nuevos: 1 · arreglados: 0/);
});

test("tsc (de punta a punta): si la cabeza no revisa tipos por otra vía, el canario lo ve → ROJO", () => {
  // Sin el canario esto daba «nuevos: 0 · arreglados: 1», VERDE: tsc listaba todos
  // los archivos y no marcaba nada.
  const r = tscEntre({ ".revision-apagada": "" }, { tscFalso: true });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /cabeza: tsc no marcó el error de control/);
  assert.match(r.salida, /cabeza: 0 error\(es\).*SIN canario/);
  assert.doesNotMatch(r.salida, /base: tsc no marcó/, "la base sí revisó");
  // El mismo tsc falso sin la marca: la guarda pasa (la prueba de arriba no es por el falso).
  assert.equal(tscEntre({ "frontend/src/app.ts": "export const app = 2;\n" }, { tscFalso: true }).codigo, 0);
});

test("tsc (de punta a punta): un include achicado → ROJO", () => {
  const r = tscEntre({ "tsconfig.app.json": tsconfig({ include: ["frontend/src/app.ts"] }) });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /no revisó 1 de los 2 archivo\(s\) de frontend\/src .*frontend\/src\/viejo\.ts/);
});

test("tsc (de punta a punta): tsconfig.app.json con «files» → ROJO con el motivo (el canario lo pisaría)", () => {
  const r = tscEntre({ "tsconfig.app.json": tsconfig({ files: ["frontend/src/app.ts"] }) });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /usa «files»/);
  assert.ok(r.canarioBorrado);
});

// ─── vitest-completo.mjs ─────────────────────────────────────────────────────

const CONFIG_VITEST = 'export default { cacheDir: ".cache", test: { include: ["frontend/src/**/*.{test,spec}.{ts,tsx}"], environment: "node" } };\n';
const pasa = (n) => `import { test, expect } from "vitest";\ntest("${n}", () => expect(1).toBe(1));\n`;
const falla = (n) => `import { test, expect } from "vitest";\ntest("${n}", () => expect(1).toBe(2));\n`;

function vitestCon(archivos, args = []) {
  const dir = proyecto({
    "vitest.config.mjs": CONFIG_VITEST,
    "frontend/src/a.test.ts": pasa("a"),
    "frontend/src/b.test.ts": pasa("b"),
    ...archivos,
  });
  try {
    return correr(dir, "vitest-completo.mjs", args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("vitest (de punta a punta): todo pasa y corrió exactamente lo de disco → VERDE", () => {
  const r = vitestCon({});
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /archivos de test en frontend\/src: 2; vitest corrió exactamente esos: sí/);
  assert.match(r.salida, /VERDE/);
});

test("vitest (de punta a punta): un exclude que saca un test roto y un include que suma otro → ROJO aunque la cuenta cierre", () => {
  // Lo que encontró la revisión: «Test Files 222 passed (222)», 222 en disco, VERDE.
  const r = vitestCon({
    "frontend/src/b.test.ts": falla("b"),
    "otra/relleno.test.ts": pasa("relleno"),
    "vitest.config.mjs":
      'export default { cacheDir: ".cache", test: { include: ["frontend/src/**/*.{test,spec}.{ts,tsx}", "otra/relleno.test.ts"], ' +
      'exclude: ["**/node_modules/**", "frontend/src/b.test.ts"], environment: "node" } };\n',
  });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /Test Files {2}2 passed \(2\)/, "la cuenta sola daba verde");
  assert.match(r.salida, /vitest no corrió 1 de los 2 .*frontend\/src\/b\.test\.ts/);
  assert.match(r.salida, /vitest corrió 1 archivo\(s\) que no son tests de frontend\/src .*otra\/relleno\.test\.ts/);
});

test("vitest (de punta a punta): un archivo que NO CARGA → ROJO y lo anota", () => {
  const r = vitestCon({ "frontend/src/b.test.ts": 'import { x } from "./no-existe";\nimport { test } from "vitest";\ntest("b", () => x);\n' });
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /Tests {2}1 passed \(1\)/, "la línea Tests no se entera");
  assert.match(r.salida, /NO CARGARON/);
  assert.match(r.salida, /::error file=frontend\/src\/b\.test\.ts,title=vitest::falla o no carga/);
});

test("vitest (de punta a punta): los argumentos no apagan la comparación; solo --parcial", () => {
  // `--maxWorkers 2` (el valor suelto) apagaba la comparación: se tomaba por filtro.
  const conValorSuelto = vitestCon({}, ["--maxWorkers", "2"]);
  assert.equal(conValorSuelto.codigo, 0, conValorSuelto.salida);
  assert.match(conValorSuelto.salida, /vitest corrió exactamente esos: sí/);
  // Un filtro de verdad sin --parcial: la lista no coincide → ROJO.
  const filtro = vitestCon({}, ["frontend/src/a"]);
  assert.equal(filtro.codigo, 1, filtro.salida);
  assert.match(filtro.salida, /vitest no corrió 1 de los 2 .*frontend\/src\/b\.test\.ts/);
  // Con --parcial es a propósito: no se compara (y --parcial no le llega a vitest).
  const parcial = vitestCon({}, ["--parcial", "frontend/src/a"]);
  assert.equal(parcial.codigo, 0, parcial.salida);
  assert.match(parcial.salida, /corrida --parcial: no se compara/);
});
