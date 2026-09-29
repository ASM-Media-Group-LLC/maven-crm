#!/usr/bin/env node
// El filtro `paths` de guard-frontend.yml tiene que cubrir todo lo que la guarda
// lee. Si un test de frontend/src lee supabase/functions/x/index.ts y un PR toca
// solo ese archivo, la guarda no corre y el test roto llega a main en verde.
//
//   node scripts/ci/filtro-cubre-lecturas.mjs
//
// Sale con 1 y dice qué sumar a `paths:` si algo queda afuera. Lo corre
// guard-frontend.yml después de `npm ci` (usa el parser de typescript).
//
// Lo que NO ve: una ruta armada con pedazos sueltos (join("supabase", "functions",
// x)). Los tests de hoy no lo hacen; si alguno lo hace, que la escriba entera.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { cadenasDelFuente, globARegex, lecturasDeLaGuarda, patronesDePaths, problemasDelFiltro } from "./guardas.mjs";

const WORKFLOW = ".github/workflows/guard-frontend.yml";

// De dónde parte la búsqueda: lo que la guarda corre por su cuenta (vitest, tsc,
// el build y las pruebas de scripts/ci).
const RAICES = ["frontend/**", "scripts/ci/**", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts", "postcss.config.js"];
// Lo que tiene que estar en paths tal cual, además de las raíces: no se cita con
// una cadena desde el código, pero npm, tsc y vite lo leen.
const REQUERIDOS = [...RAICES, "package.json", "package-lock.json", "tsconfig*.json", WORKFLOW];
// Los tests de vitest (el include de vitest.config.ts): se leen enteros, porque
// toda cadena puede ser una ruta. El resto, solo sus imports. guardas.test.mjs
// tampoco se lee entero: sus cadenas son ejemplos inventados, y lo único que lee
// de afuera es este workflow (que ya está en REQUERIDOS).
const ES_TEST = /^frontend\/src\/.*\.(?:test|spec)\.tsx?$/;
const ES_CODIGO = /\.(?:[mc]?[tj]sx?)$/;
// Cadenas que parecen una ruta del repo y no son una lectura.
const NO_SON_LECTURAS = new Map([
  [".gitignore", "claveDeArchivo.test.ts la usa como nombre de archivo de ejemplo"],
]);

const raiz = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const ts = createRequire(join(raiz, "package.json"))("typescript");
const archivosDelRepo = execFileSync("git", ["-C", raiz, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean);

const patrones = patronesDePaths(readFileSync(join(raiz, WORKFLOW), "utf8"));
const raices = RAICES.map((p) => globARegex(p));
const fuentes = archivosDelRepo.filter((a) => ES_CODIGO.test(a) && raices.some((re) => re.test(a)));
const citadas = lecturasDeLaGuarda({
  fuentes,
  archivosDelRepo,
  cadenasDe: (ruta, opciones) => cadenasDelFuente(ts, readFileSync(join(raiz, ruta), "utf8"), ruta, opciones),
  esTest: (ruta) => ES_TEST.test(ruta),
});
const problemas = problemasDelFiltro({ patrones, requeridos: REQUERIDOS, citadas, noSonLecturas: NO_SON_LECTURAS });

const deAfuera = [...citadas.keys()].filter((r) => !raices.some((re) => re.test(r)));
console.log(`── el filtro paths de ${WORKFLOW} ──`);
console.log(`patrones: ${patrones.length} · fuentes mirados: ${fuentes.length} · lecturas de fuera de las raíces: ${deAfuera.length}`);
if (problemas.length) {
  console.log("\nROJO:");
  for (const p of problemas) console.log(`  - ${p}`);
  console.log(`::error file=${WORKFLOW},title=paths no cubre lo que lee la guarda::${problemas.length} problema(s): ver el log del paso`);
  process.exit(1);
}
console.log("VERDE: paths cubre todo lo que la guarda lee.");
