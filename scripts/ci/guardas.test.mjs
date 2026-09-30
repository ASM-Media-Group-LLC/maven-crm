// node --test scripts/ci/guardas.test.mjs
// Las guardas del frontend también tienen que PODER FALLAR: cada caso rojo de aquí
// es una forma real en que una corrida rota podría pasar por verde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  CANARIO_TSC,
  anotacion,
  archivosDeLaCita,
  archivosDelInformeVitest,
  argumentosDelCorredor,
  cadenasDelFuente,
  citasDeRutas,
  configDelCanario,
  erroresNuevos,
  globARegex,
  lecturasDeLaGuarda,
  lecturasSinCubrir,
  leerResumenVitest,
  leerSalidaTsc,
  patronesDePaths,
  problemasDelFiltro,
  problemasTsc,
  problemasVitest,
  sinElCanario,
} from "./guardas.mjs";

// ─── vitest ──────────────────────────────────────────────────────────────────

/** n archivos de test «de disco», ordenados como los ordena el corredor. */
const lista = (n) => Array.from({ length: n }, (_, i) => `frontend/src/t${String(i).padStart(3, "0")}.test.ts`).sort();
/** Lo de disco y lo que corrió vitest, iguales: la comparación no se queja. */
const iguales = (n) => ({ enDisco: lista(n), ejecutados: lista(n) });

const verde = `
 ✓ frontend/src/test/i18n/sinEspanolNuevo.test.ts (3 tests) 120ms

 Test Files  213 passed (213)
      Tests  1721 passed (1721)
   Start at  11:02:03
   Duration  61.20s
`;

test("vitest: todo verde y la cuenta en disco coincide → sin problemas", () => {
  const r = leerResumenVitest(verde);
  assert.deepEqual(r.archivos, { failed: 0, passed: 213, expectedFail: 0, skipped: 0, todo: 0, total: 213, ilegible: null });
  assert.equal(r.pruebas.passed, 1721);
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, ...iguales(213) }), []);
});

test("vitest: con colores ANSI (CI=true los prende) se lee igual", () => {
  const conColores = "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m213 passed\x1b[39m\x1b[22m\x1b[90m (213)\x1b[39m\n" +
    "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m1721 passed\x1b[39m\x1b[22m\x1b[90m (1721)\x1b[39m\n";
  const r = leerResumenVitest(conColores);
  assert.equal(r.archivos.total, 213);
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, ...iguales(213) }), []);
});

test("vitest: un archivo que NO CARGA no suma a «Tests» pero sí a «Test Files» → rojo", () => {
  // Lo que pasó el 16/09: «Tests» idéntico al de antes, y la guarda nueva sin correr.
  const salida = `
 FAIL  frontend/src/test/nueva/guarda.test.ts [ frontend/src/test/nueva/guarda.test.ts ]
Error: Transform failed with 1 error

 Test Files  1 failed | 212 passed (213)
      Tests  1721 passed (1721)
`;
  const r = leerResumenVitest(salida);
  assert.equal(r.pruebas.failed, 0, "la línea Tests no se entera");
  assert.deepEqual(r.archivosQueFallan, ["frontend/src/test/nueva/guarda.test.ts"]);
  const p = problemasVitest({ codigo: 0, resumen: r, ...iguales(213) });
  assert.ok(p.some((x) => x.includes("NO CARGARON")), p.join("\n"));
});

test("vitest: pruebas que fallan → rojo, con la lista de archivos", () => {
  const salida = `
 FAIL  frontend/src/test/admin/a.test.tsx > Admin > algo
 FAIL  frontend/src/test/admin/a.test.tsx > Admin > otra
 FAIL  frontend/src/test/b.spec.ts > b

 Test Files  2 failed | 211 passed (213)
      Tests  3 failed | 1718 passed (1721)
`;
  const r = leerResumenVitest(salida);
  assert.deepEqual(r.archivosQueFallan, ["frontend/src/test/admin/a.test.tsx", "frontend/src/test/b.spec.ts"]);
  assert.equal(problemasVitest({ codigo: 1, resumen: r, ...iguales(213) }).length, 3);
});

test("vitest: sin línea de resumen (se cayó antes) → rojo aunque el código sea 0", () => {
  const p = problemasVitest({ codigo: 0, resumen: leerResumenVitest("Segmentation fault\n"), ...iguales(213) });
  assert.ok(p.some((x) => x.includes("«Test Files»")));
});

test("vitest: corrió menos archivos que los de disco (un include que deja afuera) → rojo, y los nombra", () => {
  const r = leerResumenVitest(" Test Files  200 passed (200)\n      Tests  1500 passed (1500)\n");
  const p = problemasVitest({ codigo: 0, resumen: r, enDisco: lista(213), ejecutados: lista(213).slice(0, 200) });
  assert.ok(p.some((x) => x.includes("no corrió 13 de los 213") && x.includes("frontend/src/t200.test.ts")), p.join("\n"));
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: null }), [], "corrida --parcial: no se compara");
});

test("vitest: la LISTA, no la cuenta — un exclude saca uno y un include suma otro de afuera → rojo", () => {
  // Lo que encontró la revisión: «Test Files 222 passed (222)» y 222 en disco daban verde.
  const enDisco = lista(213);
  const ejecutados = [...enDisco.filter((r) => r !== "frontend/src/t007.test.ts"), "scripts/ci/zzrelleno.test.ts"].sort();
  const r = leerResumenVitest(" Test Files  213 passed (213)\n      Tests  1721 passed (1721)\n");
  const p = problemasVitest({ codigo: 0, resumen: r, enDisco, ejecutados });
  assert.equal(ejecutados.length, enDisco.length, "la cuenta cierra");
  assert.ok(p.some((x) => x.includes("no corrió 1 de los 213") && x.includes("frontend/src/t007.test.ts")), p.join("\n"));
  assert.ok(p.some((x) => x.includes("no son tests de frontend/src") && x.includes("scripts/ci/zzrelleno.test.ts")), p.join("\n"));
  assert.equal(p.length, 2, p.join("\n"));
});

test("vitest: sin informe JSON no se sabe qué corrió → rojo (salvo --parcial)", () => {
  const r = leerResumenVitest(verde);
  const p = problemasVitest({ codigo: 0, resumen: r, enDisco: lista(213), ejecutados: null });
  assert.deepEqual(p.length, 1, p.join("\n"));
  assert.ok(p[0].includes("informe JSON"), p[0]);
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: null, ejecutados: null }), []);
});

test("vitest: el resumen y el informe JSON cuentan distinto → rojo (no son la misma corrida)", () => {
  const r = leerResumenVitest(verde);
  const p = problemasVitest({ codigo: 0, resumen: r, ...iguales(212) });
  assert.ok(p.some((x) => x.includes("el resumen dice 213") && x.includes("trae 212")), p.join("\n"));
});

test("vitest: ningún archivo pasó (todo salteado) → rojo aunque todo cierre", () => {
  const r = leerResumenVitest(" Test Files  213 skipped (213)\n      Tests  1721 skipped (1721)\n");
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, ...iguales(213) }), ["ningún archivo de test pasó: la corrida no probó nada"]);
});

test("vitest: una línea «Test Files» que no cierra → rojo", () => {
  const r = leerResumenVitest(" Test Files  200 passed (213)\n      Tests  1721 passed (1721)\n");
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: null }), ["la línea «Test Files» no cierra: 200 ≠ 213"]);
});

test("vitest: el informe JSON se lee desde la raíz; uno roto o de otra forma es null", () => {
  const informe = JSON.stringify({
    testResults: [
      { name: "/private/var/x/repo/frontend/src/b.test.ts", status: "failed" },
      { name: "/var/x/repo/frontend/src/a.test.tsx", status: "passed" },
      { name: "/otro/lado/c.test.ts", status: "passed" },
    ],
  });
  assert.deepEqual(archivosDelInformeVitest(informe, ["/var/x/repo", "/private/var/x/repo"]), [
    "/otro/lado/c.test.ts",
    "frontend/src/a.test.tsx",
    "frontend/src/b.test.ts",
  ]);
  assert.equal(archivosDelInformeVitest("no es json", ["/r"]), null);
  assert.equal(archivosDelInformeVitest("{}", ["/r"]), null);
  assert.equal(archivosDelInformeVitest('{"testResults":[{"status":"passed"}]}', ["/r"]), null);
});

test("vitest: salteados y todo cierran la cuenta; errores sueltos → rojo", () => {
  const salida = " Test Files  210 passed | 3 skipped (213)\n      Tests  1700 passed | 20 skipped | 1 todo (1721)\n   Errors  1 error\n";
  const r = leerResumenVitest(salida);
  assert.equal(r.archivos.skipped, 3);
  assert.equal(r.pruebas.todo, 1);
  const p = problemasVitest({ codigo: 1, resumen: r, ...iguales(213) });
  assert.ok(p.some((x) => x.includes("sin atrapar")));
  assert.ok(p.some((x) => x.includes("código 1")));
});

test("vitest: «expected fail» (un test.fails que falló) se lee y cierra la cuenta", () => {
  // La salida real de vitest 4.1 con test.fails, skip, todo y describe.skip.
  const salida = " Test Files  2 passed | 2 skipped (4)\n      Tests  2 passed | 1 expected fail | 4 skipped | 2 todo (9)\n";
  const r = leerResumenVitest(salida);
  assert.equal(r.pruebas.ilegible, null);
  assert.equal(r.pruebas.expectedFail, 1);
  assert.equal(r.pruebas.passed, 2, "la falla esperada no suma a passed");
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, ...iguales(4) }), []);
});

test("vitest: una línea «Tests» que no cierra (corrida cortada a la mitad) → rojo", () => {
  const r = leerResumenVitest(" Test Files  213 passed (213)\n      Tests  1700 passed (1721)\n");
  const p = problemasVitest({ codigo: 0, resumen: r, ...iguales(213) });
  assert.ok(p.some((x) => x.includes("«Tests» no cierra") && x.includes("1700 ≠ 1721")), p.join("\n"));
});

test("vitest: una palabra desconocida en el resumen no se ignora", () => {
  const r = leerResumenVitest(" Test Files  1 exploded | 212 passed (213)\n      Tests  1721 passed (1721)\n");
  assert.equal(r.archivos.ilegible, "1 exploded");
  assert.ok(problemasVitest({ codigo: 0, resumen: r, ...iguales(213) }).some((x) => x.includes("no entiende")));
});

test("vitest: se toma el ÚLTIMO resumen (un test puede imprimir uno falso)", () => {
  const salida = " Test Files  213 passed (213)\n      Tests  1 passed (1)\n...\n Test Files  1 failed | 212 passed (213)\n      Tests  1 failed | 1720 passed (1721)\n";
  assert.equal(leerResumenVitest(salida).archivos.failed, 1);
});

test("vitest: solo --parcial apaga la comparación; un valor suelto ya no", () => {
  // Antes `--maxWorkers 2` y `--reporter default` se tomaban por filtros y apagaban
  // la comparación sin avisar. Ahora nada se adivina: sin --parcial se compara siempre.
  assert.deepEqual(argumentosDelCorredor([]), { parcial: false, paraVitest: [] });
  assert.deepEqual(argumentosDelCorredor(["--maxWorkers", "2"]), { parcial: false, paraVitest: ["--maxWorkers", "2"] });
  assert.deepEqual(argumentosDelCorredor(["--reporter", "default"]).parcial, false);
  assert.deepEqual(argumentosDelCorredor(["frontend/src/test/admin"]).parcial, false, "un filtro sin --parcial se compara (y da rojo)");
  assert.deepEqual(argumentosDelCorredor(["--parcial", "-t", "algo"]), { parcial: true, paraVitest: ["-t", "algo"] });
});

// ─── tsc ─────────────────────────────────────────────────────────────────────

const diag = "Files:                        2345\nLines of Library:            40000\nMemory used:               1500000K\nCheck time:                  61.23s\n";

const tscBase = `frontend/src/a.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
frontend/src/b.tsx(3,1): error TS2339: Property 'x' does not exist on type 'never'.
  Type 'A' is missing the following properties from type 'B': y, z
frontend/src/b.tsx(9,1): error TS2339: Property 'x' does not exist on type 'never'.
${diag}`;

test("tsc: lee errores, ignora la continuación con sangría y lee --diagnostics", () => {
  const l = leerSalidaTsc(tscBase);
  assert.equal(l.errores.length, 3);
  assert.deepEqual(l.ilegibles, []);
  assert.equal(l.diagnosticos.Files, 2345);
  assert.equal(l.errores[0].clave, "frontend/src/a.tsx: error TS2322: Type 'string' is not assignable to type 'number'.");
});

test("tsc: el mismo error corrido de línea NO es nuevo; uno de verdad sí", () => {
  const cabeza = `frontend/src/a.tsx(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
frontend/src/b.tsx(30,1): error TS2339: Property 'x' does not exist on type 'never'.
frontend/src/b.tsx(40,1): error TS2339: Property 'x' does not exist on type 'never'.
frontend/src/c.tsx(1,1): error TS2304: Cannot find name 'foo'.
${diag}`;
  const { nuevos, arreglados } = erroresNuevos(leerSalidaTsc(tscBase).errores, leerSalidaTsc(cabeza).errores);
  assert.deepEqual(nuevos.map((e) => e.archivo), ["frontend/src/c.tsx"]);
  assert.equal(arreglados, 0);
});

test("tsc: la base se mueve — otro PR arregla uno y este mete otro: el número queda igual y es ROJO", () => {
  const cabeza = `frontend/src/b.tsx(3,1): error TS2339: Property 'x' does not exist on type 'never'.
frontend/src/b.tsx(9,1): error TS2339: Property 'x' does not exist on type 'never'.
frontend/src/nuevo.tsx(2,2): error TS2554: Expected 1 arguments, but got 0.
${diag}`;
  const b = leerSalidaTsc(tscBase).errores;
  const c = leerSalidaTsc(cabeza).errores;
  assert.equal(b.length, c.length, "mismo número de errores");
  const { nuevos, arreglados } = erroresNuevos(b, c);
  assert.equal(nuevos.length, 1);
  assert.equal(arreglados, 1);
});

test("tsc: el mismo error repetido una vez MÁS en el archivo cuenta como nuevo", () => {
  const cabeza = tscBase + "frontend/src/b.tsx(50,1): error TS2339: Property 'x' does not exist on type 'never'.\n";
  assert.equal(erroresNuevos(leerSalidaTsc(tscBase).errores, leerSalidaTsc(cabeza).errores).nuevos.length, 1);
});

test("tsc: rutas absolutas de cada copia dentro del mensaje se normalizan", () => {
  const msg = (r) => `frontend/src/a.tsx(1,1): error TS2345: Argument of type 'import("${r}/frontend/src/x").X' is not assignable.\n${diag}`;
  const b = leerSalidaTsc(msg("/tmp/tsc-base-abc"), ["/tmp/tsc-base-abc", "/home/runner/work/maven"]);
  const c = leerSalidaTsc(msg("/home/runner/work/maven"), ["/tmp/tsc-base-abc", "/home/runner/work/maven"]);
  assert.equal(erroresNuevos(b.errores, c.errores).nuevos.length, 0);
});

test("tsc: errores sin archivo (de configuración) también se comparan", () => {
  const c = leerSalidaTsc(`error TS5083: Cannot read file 'tsconfig.base.json'.\n${diag}`);
  assert.equal(c.errores.length, 1);
  assert.equal(erroresNuevos([], c.errores).nuevos.length, 1);
});

test("tsc: una caída (stack trace, sin memoria) NO se toma por «sin errores nuevos»", () => {
  const caida = "/x/node_modules/typescript/lib/tsc.js:120000\n      throw e;\nRangeError: Maximum call stack size exceeded\n";
  const l = leerSalidaTsc(caida);
  assert.equal(l.errores.length, 0);
  const p = problemasTsc("cabeza", { codigo: 1, lectura: l, esperados: ["frontend/src/a.tsx"] });
  assert.ok(p.some((x) => x.includes("sin ningún error legible")));
  assert.ok(p.some((x) => x.includes("no son errores")));
  assert.equal(l.archivos.length, 0, "la primera línea del stack trace no es un archivo listado");
  assert.ok(problemasTsc("cabeza", { codigo: 134, lectura: leerSalidaTsc(tscBase), esperados: null })
    .some((x) => x.includes("código 134")));
});

const raizCabeza = "/home/runner/work/maven/maven";
const listado = (...rutas) => rutas.map((r) => `${raizCabeza}/${r}`).join("\n") + "\n";
const esperados = ["frontend/src/main.tsx", "frontend/src/App.tsx", "frontend/src/test/a.test.tsx"];

test("tsc: lee --listFiles sin la raíz y sin confundirlo con errores", () => {
  const l = leerSalidaTsc(listado("node_modules/typescript/lib/lib.es2020.d.ts", ...esperados) + tscBase, [raizCabeza]);
  assert.deepEqual(l.ilegibles, []);
  assert.equal(l.errores.length, 3);
  assert.deepEqual(l.archivos, ["node_modules/typescript/lib/lib.es2020.d.ts", ...esperados]);
  assert.deepEqual(problemasTsc("cabeza", { codigo: 2, lectura: l, esperados }), []);
});

test("tsc: si no revisó TODOS los archivos de frontend/src → rojo (include achicado)", () => {
  // tsconfig.app.json con include ["frontend/src/main.tsx"]: sigue viendo ~1500
  // archivos (lib y node_modules), pero deja afuera los tests y lo que main no importa.
  const achicado = leerSalidaTsc(listado("node_modules/typescript/lib/lib.es2020.d.ts", "frontend/src/main.tsx", "frontend/src/App.tsx"), [raizCabeza]);
  const p = problemasTsc("cabeza", { codigo: 0, lectura: achicado, esperados });
  assert.ok(p.some((x) => x.includes("no revisó 1 de los 3") && x.includes("frontend/src/test/a.test.tsx")), p.join("\n"));
});

test("tsc: sin --listFiles (o `cd frontend && npx tsc`, que no revisa nada) → rojo", () => {
  const vacio = leerSalidaTsc("Files:                           0\n");
  const p = problemasTsc("cabeza", { codigo: 0, lectura: vacio, esperados });
  assert.ok(p.some((x) => x.includes("no listó ningún archivo")), p.join("\n"));
  assert.deepEqual(problemasTsc("base", { codigo: 0, lectura: vacio, esperados: null }), [], "la base no se compara contra el disco");
});

test("tsc: salió con 0 pero imprimió errores → rojo (no se sabe qué pasó)", () => {
  const p = problemasTsc("cabeza", { codigo: 0, lectura: leerSalidaTsc(tscBase), esperados: null });
  assert.deepEqual(p, ["cabeza: tsc salió con 0 pero imprimió 3 error(es)"]);
});

const lineaCanario = `${CANARIO_TSC.archivo}(1,14): error ${CANARIO_TSC.codigo}: Type 'string' is not assignable to type 'number'.\n`;

test("tsc: sin el error de control (canario) la corrida no revisó tipos → rojo", () => {
  // Con `"noCheck": true`, tsc lista todos los archivos y no marca nada: los 230
  // errores viejos se veían «arreglados» y un error nuevo pasaba callado.
  const sinRevisar = leerSalidaTsc(listado("node_modules/typescript/lib/lib.es2020.d.ts", ...esperados), [raizCabeza]);
  const p = problemasTsc("cabeza", { codigo: 0, lectura: sinRevisar, esperados, canario: true });
  assert.ok(p.some((x) => x.includes("no marcó el error de control")), p.join("\n"));
  assert.deepEqual(problemasTsc("cabeza", { codigo: 0, lectura: sinRevisar, esperados }), [], "sin canario: la lectura sola no se entera");

  const revisada = leerSalidaTsc(listado(...esperados, CANARIO_TSC.archivo) + lineaCanario + tscBase, [raizCabeza]);
  assert.deepEqual(problemasTsc("cabeza", { codigo: 2, lectura: revisada, esperados, canario: true }), []);
  assert.equal(sinElCanario(revisada).errores.length, 3, "el canario no se compara");
  assert.equal(erroresNuevos(leerSalidaTsc(tscBase).errores, sinElCanario(revisada).errores).nuevos.length, 0);

  // Otro error en el archivo del canario no cuenta: tiene que ser el sembrado.
  const otro = leerSalidaTsc(`${CANARIO_TSC.archivo}(1,1): error TS2304: Cannot find name 'x'.\n`);
  assert.ok(problemasTsc("cabeza", { codigo: 2, lectura: otro, esperados: null, canario: true }).some((x) => x.includes("error de control")));
});

test("tsc: la config del canario extiende tsconfig.app.json y tira si éste usa «files»", () => {
  assert.deepEqual(JSON.parse(configDelCanario(readFileSync(new URL("../../tsconfig.app.json", import.meta.url), "utf8"))), {
    extends: "./tsconfig.app.json",
    files: [`./${CANARIO_TSC.archivo}`],
  });
  assert.throws(() => configDelCanario('{ "files": ["frontend/src/main.tsx"], "include": ["frontend/src"] }'), /usa «files»/);
});

test("tsc: la anotación de GitHub apunta al archivo y escapa saltos", () => {
  const [e] = leerSalidaTsc("frontend/src/a.tsx(3,7): error TS1: 100% roto\n").errores;
  assert.equal(anotacion(e), "::error file=frontend/src/a.tsx,line=3,col=7,title=tsc: error nuevo::error TS1: 100%25 roto");
});

// ─── el filtro `paths` ───────────────────────────────────────────────────────

test("paths: los patrones se leen como el filtro de GitHub", () => {
  const cubre = (p, ruta) => globARegex(p).test(ruta);
  assert.ok(cubre("frontend/**", "frontend/src/a/b.tsx"));
  assert.ok(!cubre("frontend/**", "frontendx/a.ts"));
  assert.ok(cubre("tsconfig*.json", "tsconfig.app.json"));
  assert.ok(!cubre("frontend/*", "frontend/src/a.ts"), "«*» no cruza carpetas");
  assert.ok(cubre("supabase/**/index.ts", "supabase/index.ts"), "«**/» también es ninguna carpeta");
  assert.ok(cubre("supabase/**/index.ts", "supabase/functions/x/index.ts"));
  assert.ok(!cubre("nginx.conf", "nginxxconf"), "el punto es un punto");
  assert.ok(globARegex("a/*.{ts,tsx}", { llaves: true }).test("a/b.tsx"));
  // Lo que no sabe leer lo rechaza: un patrón mal leído daría por cubierto lo que no lo está.
  for (const raro of ["a/?.ts", "a/[ab].ts", "!a/**", "a/{b,c}"]) assert.throws(() => globARegex(raro), /no sabe leer/, raro);
});

test("paths: se leen del workflow real, y un bloque que no se entiende tira", () => {
  const yml = readFileSync(new URL("../../.github/workflows/guard-frontend.yml", import.meta.url), "utf8");
  const patrones = patronesDePaths(yml);
  assert.ok(patrones.includes("frontend/**"));
  assert.ok(patrones.includes("tsconfig*.json"));
  const con = (cuerpo) => `on:\n  pull_request:\n${cuerpo}\njobs:\n  x: {}\n`;
  assert.deepEqual(patronesDePaths(con('    paths:\n      - "a/**"   # comentario\n      - b.json\n      # otro\n      - \'c\'')), ["a/**", "b.json", "c"]);
  assert.throws(() => patronesDePaths(con("    branches: [main]")), /no tiene «paths:»/);
  assert.throws(() => patronesDePaths(con("    paths: [a, b]")), /no tiene «paths:»/);
  assert.throws(() => patronesDePaths(con('    paths:\n      - "a/**"\n      "b"')), /no entiende/);
  assert.throws(() => patronesDePaths("on: push\n"), /pull_request/);
});

const ts = createRequire(import.meta.url)("typescript");

test("paths: de un test salen todas sus cadenas (no los comentarios); del resto, solo lo importado", () => {
  const fuente = `
    import { x } from "../lib/x";
    // leer("supabase/functions/comentario.ts") no es leer
    const a = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");
    const b = import.meta.glob(["/supabase/migrations/1_a.sql", "/infra/y.mjs"], { query: "?raw" });
    const c = \`supabase/functions/\${nombre}/index.ts\`;
    const d = await import("./perezoso");
    const e = "/docs/ruta-de-la-app";
  `;
  const todo = cadenasDelFuente(ts, fuente, "frontend/src/test/a.test.ts", { todo: true });
  for (const c of ["../lib/x", "nginx.conf", "/supabase/migrations/1_a.sql", "/infra/y.mjs", "supabase/functions/*/index.ts", "./perezoso"]) {
    assert.ok(todo.includes(c), `${c} en ${JSON.stringify(todo)}`);
  }
  assert.ok(!todo.some((c) => c.includes("comentario")), "un comentario no es una lectura");
  const imports = cadenasDelFuente(ts, fuente, "frontend/src/lib/a.ts", { todo: false });
  assert.deepEqual(imports.sort(), ["../lib/x", "./perezoso", "/infra/y.mjs", "/supabase/migrations/1_a.sql"].sort());
});

const repo = new Set([
  "frontend/src/test/a.test.ts",
  "frontend/src/lib/x.ts",
  "nginx.conf",
  "supabase/functions/f/index.ts",
  "supabase/functions/g/index.ts",
  "supabase/functions/_shared/cors.ts",
  "supabase/migrations/1_a.sql",
  "infra/y.mjs",
  "docs/guia.md",
]);
const carpetasDe = (archivos) => {
  const c = new Set();
  for (const a of archivos) for (let d = a.slice(0, a.lastIndexOf("/")); d; d = d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "") c.add(d);
  return c;
};
const entradas = { carpetasDeLaRaiz: ["frontend", "supabase", "infra", "docs"], archivosDeLaRaiz: ["nginx.conf"] };

test("paths: qué cadena es una ruta del repo", () => {
  const { relativas, desdeLaRaiz } = citasDeRutas(
    ["./x", "../../supabase/y", "/supabase/migrations/1_a.sql?raw", "nginx.conf", "supabase", "ver supabase/x", "supabase/x.ts es un ejemplo", "https://a/b", "/dashboard", ""],
    entradas,
  );
  assert.deepEqual(relativas, ["./x", "../../supabase/y"]);
  assert.deepEqual(desdeLaRaiz, ["supabase/migrations/1_a.sql", "nginx.conf"], "«supabase» sola es una palabra y «ver …» es un texto");
});

test("paths: un template que empieza con la raíz (`${RAIZ}/Dockerfile`) también es una ruta", () => {
  const fuente = "const R = process.cwd();\n" +
    "const a = readFileSync(`${R}/Dockerfile`);\n" +
    "const b = readFileSync(`${process.cwd()}/.github/workflows/deploy-edge-functions.yml`);\n" +
    "const c = readFileSync(`${__dirname}/../../supabase/y`);\n" +
    "const d = `${base}/${r.slice(2)}`;\n";
  const cadenas = cadenasDelFuente(ts, fuente, "frontend/src/test/zz.test.ts", { todo: true });
  assert.ok(cadenas.includes("*/Dockerfile"), JSON.stringify(cadenas));
  const { relativas, desdeLaRaiz } = citasDeRutas(cadenas, {
    carpetasDeLaRaiz: [...entradas.carpetasDeLaRaiz, ".github"],
    archivosDeLaRaiz: [...entradas.archivosDeLaRaiz, "Dockerfile"],
  });
  assert.deepEqual(desdeLaRaiz, ["Dockerfile", ".github/workflows/deploy-edge-functions.yml"]);
  assert.deepEqual(relativas, ["../../supabase/y"], "con la carpeta del test adelante, lo que sigue es relativo");
});

test("paths: una cita son los archivos que existen (glob, carpeta, import sin extensión)", () => {
  const carpetas = carpetasDe(repo);
  assert.deepEqual(archivosDeLaCita("supabase/functions/*/index.ts", repo, carpetas), ["supabase/functions/f/index.ts", "supabase/functions/g/index.ts"]);
  assert.deepEqual(archivosDeLaCita("frontend/src/lib/x", repo, carpetas), ["frontend/src/lib/x.ts"]);
  assert.deepEqual(archivosDeLaCita("supabase/migrations", repo, carpetas), ["supabase/migrations/1_a.sql"]);
  assert.deepEqual(archivosDeLaCita("supabase/functions/no-existe.ts", repo, carpetas), []);
});

test("paths: sigue la cadena (test → edge function → lo que ésta importa) y marca lo que el filtro no cubre", () => {
  const fuentes = {
    "frontend/src/test/a.test.ts": 'import { x } from "../lib/x"; const f = readFileSync("supabase/functions/f/index.ts"); const n = "nginx.conf";',
    "frontend/src/lib/x.ts": 'export const docs = "/docs/guia.md"; import("../../../infra/y.mjs");',
    "supabase/functions/f/index.ts": 'import { cors } from "../_shared/cors.ts"; const s = "supabase/migrations/1_a.sql";',
    "infra/y.mjs": "export {};",
    "supabase/functions/_shared/cors.ts": "export const cors = 1;",
  };
  const citadas = lecturasDeLaGuarda({
    fuentes: ["frontend/src/test/a.test.ts", "frontend/src/lib/x.ts"],
    archivosDelRepo: [...repo],
    cadenasDe: (ruta, o) => cadenasDelFuente(ts, fuentes[ruta] ?? "", ruta, o),
    esTest: (ruta) => ruta.endsWith(".test.ts"),
  });
  assert.equal(citadas.get("supabase/functions/f/index.ts"), "frontend/src/test/a.test.ts");
  assert.equal(citadas.get("supabase/functions/_shared/cors.ts"), "supabase/functions/f/index.ts", "lo que importa la edge function también");
  assert.equal(citadas.get("infra/y.mjs"), "frontend/src/lib/x.ts", "un import() del código de la app");
  assert.ok(citadas.has("nginx.conf"));
  assert.ok(!citadas.has("docs/guia.md"), "en el código de la app una cadena es una ruta de la app, no una lectura");
  assert.ok(!citadas.has("supabase/migrations/1_a.sql"), "de una edge function (no es un test) solo cuentan sus imports");

  // La línea base tiene que poder fallar: con solo frontend/** queda todo afuera.
  const sinCubrir = lecturasSinCubrir(citadas, ["frontend/**"]).map((x) => x.ruta);
  assert.deepEqual(sinCubrir, ["infra/y.mjs", "nginx.conf", "supabase/functions/_shared/cors.ts", "supabase/functions/f/index.ts"]);
  assert.deepEqual(lecturasSinCubrir(citadas, ["frontend/**", "supabase/functions/**", "infra/**", "nginx.conf"]), []);
});

test("paths: problemasDelFiltro — falta un requerido, algo sin cubrir, una excepción vieja", () => {
  const citadas = new Map([["nginx.conf", "frontend/src/test/n.test.ts"], [".gitignore", "frontend/src/test/c.test.ts"]]);
  const noSonLecturas = new Map([[".gitignore", "un nombre de ejemplo"]]);
  assert.deepEqual(
    problemasDelFiltro({ patrones: ["frontend/**", "nginx.conf"], requeridos: ["frontend/**"], citadas, noSonLecturas }),
    [],
  );
  const p = problemasDelFiltro({ patrones: ["nginx.conf"], requeridos: ["frontend/**"], citadas, noSonLecturas });
  assert.ok(p.some((x) => x.includes("falta «frontend/**»")), p.join("\n"));
  const q = problemasDelFiltro({ patrones: ["frontend/**"], requeridos: [], citadas, noSonLecturas });
  assert.ok(q.some((x) => x.startsWith("nginx.conf (lo lee frontend/src/test/n.test.ts)")), q.join("\n"));
  assert.ok(!q.some((x) => x.startsWith(".gitignore")), "la excepción no se reporta");
  const r = problemasDelFiltro({ patrones: ["frontend/**", "nginx.conf"], requeridos: [], citadas: new Map([["nginx.conf", "x"]]), noSonLecturas });
  assert.ok(r.some((x) => x.includes("«.gitignore» ya no la cita nadie")), r.join("\n"));
});
