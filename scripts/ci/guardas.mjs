// Piezas puras de las guardas del frontend (.github/workflows/guard-frontend.yml).
// Sin dependencias: corren con el node del runner. Sus pruebas están en
// guardas.test.mjs (`node --test scripts/ci/guardas.test.mjs`).
//
// Por qué existen, y no un simple `npx vitest run && npx tsc`:
//  - vitest: un archivo de test que NO CARGA (error de compilación, import roto)
//    no suma nada a la línea «Tests»; solo aparece en «Test Files N failed». El
//    16/09 una guarda nueva no cargaba y «Tests 140 passed» salía igual que antes.
//    Por eso se lee «Test Files», y además se cuenta cuántos archivos de test hay
//    en disco: si vitest ve menos, alguno quedó afuera sin avisar.
//  - tsc: main arrastra ~220 errores viejos, así que «tsc sin errores» haría fallar
//    todos los PR. Y el número solo no sirve: la base se mueve, y un error nuevo se
//    esconde detrás de uno viejo que otro PR arregló. Se compara la LISTA contra la
//    base, sin (línea,col) porque cualquier cambio arriba corre las líneas.

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const sinColores = (s) => String(s).replace(ANSI, "");

// ─── vitest ──────────────────────────────────────────────────────────────────

const ESTADOS = ["failed", "passed", "skipped", "todo"];

/** Una línea de resumen de vitest, p. ej. « Test Files  8 failed | 205 passed (213)».
 *  Toma la ÚLTIMA aparición: un test puede imprimir cualquier cosa antes. */
function leerLineaResumen(texto, etiqueta) {
  const re = new RegExp(`^\\s*${etiqueta}\\s+(.+?)\\s*\\((\\d+)\\)\\s*$`, "gm");
  const todas = [...texto.matchAll(re)];
  if (!todas.length) return null;
  const m = todas[todas.length - 1];
  const cuenta = { failed: 0, passed: 0, skipped: 0, todo: 0, total: Number(m[2]), ilegible: null };
  for (const parte of m[1].split("|").map((p) => p.trim())) {
    const p = parte.match(/^(\d+)\s+([a-z]+)$/);
    if (!p || !ESTADOS.includes(p[2])) {
      cuenta.ilegible = parte;
      continue;
    }
    cuenta[p[2]] += Number(p[1]);
  }
  return cuenta;
}

/** Lee el resumen de `vitest run`: «Test Files», «Tests» y los errores sueltos
 *  (unhandled) que vitest cuenta aparte en la línea «Errors». */
export function leerResumenVitest(salida) {
  const texto = sinColores(salida);
  const errores = [...texto.matchAll(/^\s*Errors\s+(\d+)\s+errors?\b/gm)];
  // « FAIL  frontend/src/x.test.tsx > describe > it» o « FAIL  frontend/src/x.test.tsx [ ... ]»
  const archivosQueFallan = new Set();
  for (const m of texto.matchAll(/^\s*FAIL\s+(\S+\.(?:test|spec)\.tsx?)\b/gm)) archivosQueFallan.add(m[1]);
  return {
    archivos: leerLineaResumen(texto, "Test Files"),
    pruebas: leerLineaResumen(texto, "Tests"),
    erroresSueltos: errores.length ? Number(errores[errores.length - 1][1]) : 0,
    archivosQueFallan: [...archivosQueFallan].sort(),
  };
}

/** Qué impide dar la corrida por buena. Vacío = verde.
 *  `enDisco` = cuántos archivos de test hay en frontend/src (null = no comparar,
 *  p. ej. si se corrió un subconjunto). */
export function problemasVitest({ codigo, resumen, enDisco }) {
  const problemas = [];
  const a = resumen.archivos;
  if (!a) {
    problemas.push("no apareció la línea «Test Files»: vitest se cayó antes de terminar (o cambió el formato del resumen)");
  } else {
    if (a.ilegible) problemas.push(`la línea «Test Files» trae algo que esta guarda no entiende: «${a.ilegible}»`);
    if (a.failed > 0) problemas.push(`${a.failed} archivo(s) de test fallaron o NO CARGARON («Test Files ${a.failed} failed»)`);
    if (a.passed === 0) problemas.push("ningún archivo de test pasó: la corrida no probó nada");
    const suma = a.failed + a.passed + a.skipped + a.todo;
    if (!a.ilegible && suma !== a.total) problemas.push(`la línea «Test Files» no cierra: ${suma} ≠ ${a.total}`);
    if (enDisco != null && a.total !== enDisco) {
      problemas.push(
        `vitest vio ${a.total} archivo(s) de test y en frontend/src hay ${enDisco}: alguno quedó afuera ` +
          "(¿cambió el include de vitest.config.ts?)",
      );
    }
  }
  const t = resumen.pruebas;
  if (!t) problemas.push("no apareció la línea «Tests»");
  else {
    if (t.ilegible) problemas.push(`la línea «Tests» trae algo que esta guarda no entiende: «${t.ilegible}»`);
    if (t.failed > 0) problemas.push(`${t.failed} prueba(s) fallaron`);
  }
  if (resumen.erroresSueltos > 0) problemas.push(`${resumen.erroresSueltos} error(es) sin atrapar (línea «Errors»)`);
  if (codigo !== 0) problemas.push(`vitest salió con código ${codigo}`);
  return problemas;
}

/** ¿Los argumentos extra achican la corrida? (filtros de archivo, --shard, -t…).
 *  Entonces no se compara contra la cuenta en disco. Las opciones con valor van
 *  con «=» (--testTimeout=30000): un valor suelto se lee como filtro. */
export function corridaParcial(extra) {
  return extra.some(
    (a) => !a.startsWith("-") || /^--(shard|project|testNamePattern|changed|related)\b/.test(a) || /^-t\b/.test(a),
  );
}

/** Los archivos que vitest.config.ts incluye: frontend/src/**\/*.{test,spec}.{ts,tsx}. */
export const ES_ARCHIVO_DE_TEST = /\.(test|spec)\.tsx?$/;

// ─── tsc ─────────────────────────────────────────────────────────────────────

const CON_ARCHIVO = /^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/;
const SIN_ARCHIVO = /^(error TS\d+: .*)$/;
// Lo que suma --diagnostics al final: «Files:   1532», «Check time:  61.23s», «Memory used: 1234567K».
const DIAGNOSTICO = /^([A-Za-z][A-Za-z /]*?):\s+([\d.]+)([KMGs]?)\s*$/;

/** Saca las raíces absolutas (la cabeza y la copia de la base) de una línea, para
 *  que un `import("/ruta/de/esta/copia/frontend/src/x")` dentro del mensaje diga
 *  lo mismo en las dos. De la más larga a la más corta. */
function sinRaices(linea, raices) {
  let s = linea;
  for (const r of [...raices].filter(Boolean).sort((a, b) => b.length - a.length)) {
    s = s.split(r.endsWith("/") ? r : r + "/").join("");
  }
  return s;
}

/** Lee la salida de `tsc --noEmit --pretty false [--diagnostics]`.
 *  - `errores`: una entrada por error, con `clave` = archivo + código + mensaje, SIN
 *    (línea,col). Las líneas con sangría son la continuación del error de arriba
 *    («Type X is not assignable…» → «Property y is missing…») y no cuentan aparte.
 *  - `diagnosticos`: lo de --diagnostics (Files, Check time…).
 *  - `ilegibles`: líneas que no son ni error ni diagnóstico. Si hay alguna, tsc no
 *    terminó bien (un stack trace, un «FATAL ERROR» de memoria) y la lista no vale. */
export function leerSalidaTsc(salida, raices = []) {
  const errores = [];
  const diagnosticos = {};
  const ilegibles = [];
  for (const cruda of sinColores(salida).split(/\r?\n/)) {
    if (!cruda.trim()) continue;
    if (/^\s/.test(cruda)) continue;
    const linea = sinRaices(cruda, raices);
    const m = linea.match(CON_ARCHIVO);
    if (m) {
      errores.push({ archivo: m[1], linea: Number(m[2]), columna: Number(m[3]), mensaje: m[4], clave: `${m[1]}: ${m[4]}` });
      continue;
    }
    const g = linea.match(SIN_ARCHIVO);
    if (g) {
      errores.push({ archivo: null, linea: null, columna: null, mensaje: g[1], clave: g[1] });
      continue;
    }
    const d = linea.match(DIAGNOSTICO);
    if (d) {
      diagnosticos[d[1].trim()] = Number(d[2]);
      continue;
    }
    ilegibles.push(cruda);
  }
  return { errores, diagnosticos, ilegibles };
}

/** Por qué una corrida de tsc no sirve para comparar. Vacío = sirve.
 *  tsc sale con 0 sin errores y con 1 o 2 con errores (2 con --noEmit); cualquier
 *  otra cosa, o un código de error sin ningún error leído, es que se cayó.
 *  `minimoDeArchivos`: cuántos .ts/.tsx hay en frontend/src. Si tsc miró menos, no
 *  revisó el frontend (como `cd frontend && npx tsc`, que siempre da 0). */
export function problemasTsc(nombre, { codigo, lectura, minimoDeArchivos }) {
  const p = [];
  if (![0, 1, 2].includes(codigo)) p.push(`${nombre}: tsc salió con código ${codigo} (¿se quedó sin memoria?)`);
  if (codigo !== 0 && lectura.errores.length === 0) p.push(`${nombre}: tsc salió con código ${codigo} sin ningún error legible`);
  if (codigo === 0 && lectura.errores.length > 0) p.push(`${nombre}: tsc salió con 0 pero imprimió ${lectura.errores.length} error(es)`);
  if (lectura.ilegibles.length) {
    p.push(`${nombre}: tsc imprimió ${lectura.ilegibles.length} línea(s) que no son errores:\n    ${lectura.ilegibles.slice(0, 5).join("\n    ")}`);
  }
  const archivos = lectura.diagnosticos.Files;
  if (minimoDeArchivos != null) {
    if (archivos == null) p.push(`${nombre}: falta la línea «Files:» de --diagnostics`);
    else if (archivos < minimoDeArchivos) {
      p.push(`${nombre}: tsc miró ${archivos} archivo(s) y solo frontend/src tiene ${minimoDeArchivos}: no revisó el frontend`);
    }
  }
  return p;
}

/** Los errores de la cabeza que la base no tiene, contando repeticiones (si un
 *  archivo tenía el mismo error 2 veces y ahora 3, el tercero es nuevo).
 *  `arreglados` = cuántos de la base ya no están (solo para informar). */
export function erroresNuevos(base, cabeza) {
  const cuenta = new Map();
  for (const e of base) cuenta.set(e.clave, (cuenta.get(e.clave) ?? 0) + 1);
  const nuevos = [];
  for (const e of cabeza) {
    const n = cuenta.get(e.clave) ?? 0;
    if (n > 0) cuenta.set(e.clave, n - 1);
    else nuevos.push(e);
  }
  let arreglados = 0;
  for (const n of cuenta.values()) arreglados += n;
  return { nuevos, arreglados };
}

/** Anotación de GitHub (queda marcada en el archivo del PR). */
export function anotacion(e) {
  const msg = e.mensaje.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  if (!e.archivo) return `::error title=tsc: error nuevo::${msg}`;
  return `::error file=${e.archivo},line=${e.linea},col=${e.columna},title=tsc: error nuevo::${msg}`;
}
