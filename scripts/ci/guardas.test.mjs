// node --test scripts/ci/guardas.test.mjs
// Las guardas del frontend también tienen que PODER FALLAR: cada caso rojo de acá
// es una forma real en que una corrida rota podría pasar por verde.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anotacion,
  corridaParcial,
  erroresNuevos,
  leerResumenVitest,
  leerSalidaTsc,
  problemasTsc,
  problemasVitest,
} from "./guardas.mjs";

// ─── vitest ──────────────────────────────────────────────────────────────────

const verde = `
 ✓ frontend/src/test/i18n/sinEspanolNuevo.test.ts (3 tests) 120ms

 Test Files  213 passed (213)
      Tests  1721 passed (1721)
   Start at  11:02:03
   Duration  61.20s
`;

test("vitest: todo verde y la cuenta en disco coincide → sin problemas", () => {
  const r = leerResumenVitest(verde);
  assert.deepEqual(r.archivos, { failed: 0, passed: 213, skipped: 0, todo: 0, total: 213, ilegible: null });
  assert.equal(r.pruebas.passed, 1721);
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: 213 }), []);
});

test("vitest: con colores ANSI (CI=true los prende) se lee igual", () => {
  const conColores = "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m213 passed\x1b[39m\x1b[22m\x1b[90m (213)\x1b[39m\n" +
    "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m1721 passed\x1b[39m\x1b[22m\x1b[90m (1721)\x1b[39m\n";
  const r = leerResumenVitest(conColores);
  assert.equal(r.archivos.total, 213);
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: 213 }), []);
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
  const p = problemasVitest({ codigo: 0, resumen: r, enDisco: 213 });
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
  assert.equal(problemasVitest({ codigo: 1, resumen: r, enDisco: 213 }).length, 3);
});

test("vitest: sin línea de resumen (se cayó antes) → rojo aunque el código sea 0", () => {
  const p = problemasVitest({ codigo: 0, resumen: leerResumenVitest("Segmentation fault\n"), enDisco: 213 });
  assert.ok(p.some((x) => x.includes("«Test Files»")));
});

test("vitest: menos archivos que en disco (un include que deja afuera) → rojo", () => {
  const r = leerResumenVitest(" Test Files  200 passed (200)\n      Tests  1500 passed (1500)\n");
  const p = problemasVitest({ codigo: 0, resumen: r, enDisco: 213 });
  assert.ok(p.some((x) => x.includes("vio 200") && x.includes("hay 213")), p.join("\n"));
  assert.deepEqual(problemasVitest({ codigo: 0, resumen: r, enDisco: null }), [], "corrida parcial: no se compara");
});

test("vitest: salteados y todo cierran la cuenta; errores sueltos → rojo", () => {
  const salida = " Test Files  210 passed | 3 skipped (213)\n      Tests  1700 passed | 20 skipped | 1 todo (1721)\n   Errors  1 error\n";
  const r = leerResumenVitest(salida);
  assert.equal(r.archivos.skipped, 3);
  assert.equal(r.pruebas.todo, 1);
  const p = problemasVitest({ codigo: 1, resumen: r, enDisco: 213 });
  assert.ok(p.some((x) => x.includes("sin atrapar")));
  assert.ok(p.some((x) => x.includes("código 1")));
});

test("vitest: una palabra desconocida en el resumen no se ignora", () => {
  const r = leerResumenVitest(" Test Files  1 exploded | 212 passed (213)\n      Tests  1721 passed (1721)\n");
  assert.equal(r.archivos.ilegible, "1 exploded");
  assert.ok(problemasVitest({ codigo: 0, resumen: r, enDisco: 213 }).some((x) => x.includes("no entiende")));
});

test("vitest: se toma el ÚLTIMO resumen (un test puede imprimir uno falso)", () => {
  const salida = " Test Files  213 passed (213)\n      Tests  1 passed (1)\n...\n Test Files  1 failed | 212 passed (213)\n      Tests  1 failed | 1720 passed (1721)\n";
  assert.equal(leerResumenVitest(salida).archivos.failed, 1);
});

test("vitest: qué argumentos achican la corrida", () => {
  assert.equal(corridaParcial([]), false);
  assert.equal(corridaParcial(["--testTimeout=30000", "--maxWorkers=2"]), false);
  assert.equal(corridaParcial(["frontend/src/test/admin"]), true);
  assert.equal(corridaParcial(["--shard=1/3"]), true);
  assert.equal(corridaParcial(["-t", "algo"]), true);
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
  const p = problemasTsc("cabeza", { codigo: 1, lectura: l, minimoDeArchivos: 900 });
  assert.ok(p.some((x) => x.includes("sin ningún error legible")));
  assert.ok(p.some((x) => x.includes("no son errores")));
  assert.ok(problemasTsc("cabeza", { codigo: 134, lectura: leerSalidaTsc(tscBase), minimoDeArchivos: null })
    .some((x) => x.includes("código 134")));
});

test("tsc: si mira menos archivos que los que tiene frontend/src, no revisó el frontend", () => {
  // Como `cd frontend && npx tsc --noEmit`: resuelve un tsconfig vacío y da 0 siempre.
  const vacio = leerSalidaTsc("Files:                           0\n");
  const p = problemasTsc("cabeza", { codigo: 0, lectura: vacio, minimoDeArchivos: 900 });
  assert.ok(p.some((x) => x.includes("no revisó el frontend")), p.join("\n"));
  assert.ok(problemasTsc("cabeza", { codigo: 0, lectura: leerSalidaTsc(""), minimoDeArchivos: 900 })
    .some((x) => x.includes("Files:")));
  assert.deepEqual(problemasTsc("cabeza", { codigo: 2, lectura: leerSalidaTsc(tscBase), minimoDeArchivos: 900 }), []);
});

test("tsc: la anotación de GitHub apunta al archivo y escapa saltos", () => {
  const [e] = leerSalidaTsc("frontend/src/a.tsx(3,7): error TS1: 100% roto\n").errores;
  assert.equal(anotacion(e), "::error file=frontend/src/a.tsx,line=3,col=7,title=tsc: error nuevo::error TS1: 100%25 roto");
});
