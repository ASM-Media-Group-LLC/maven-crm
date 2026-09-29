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

// Los estados que imprime vitest 4 en el resumen (getStateString, en
// node_modules/vitest/dist/chunks/utils.*.js): «failed», «passed», «expected fail»
// (un `test.fails` que falló, como se esperaba: NO suma a «passed»), «skipped» y
// «todo». Nombre en el resumen → campo de la cuenta.
const ESTADOS = { failed: "failed", passed: "passed", "expected fail": "expectedFail", skipped: "skipped", todo: "todo" };

/** Una línea de resumen de vitest, p. ej. « Test Files  8 failed | 205 passed (213)».
 *  Toma la ÚLTIMA aparición: un test puede imprimir cualquier cosa antes. */
function leerLineaResumen(texto, etiqueta) {
  const re = new RegExp(`^\\s*${etiqueta}\\s+(.+?)\\s*\\((\\d+)\\)\\s*$`, "gm");
  const todas = [...texto.matchAll(re)];
  if (!todas.length) return null;
  const m = todas[todas.length - 1];
  const cuenta = { failed: 0, passed: 0, expectedFail: 0, skipped: 0, todo: 0, total: Number(m[2]), ilegible: null };
  for (const parte of m[1].split("|").map((p) => p.trim())) {
    const p = parte.match(/^(\d+)\s+([a-z]+(?: [a-z]+)?)$/);
    if (!p || !Object.hasOwn(ESTADOS, p[2])) {
      cuenta.ilegible = parte;
      continue;
    }
    cuenta[ESTADOS[p[2]]] += Number(p[1]);
  }
  return cuenta;
}

/** Lo que suma una línea de resumen: tiene que dar el total entre paréntesis. */
const sumaDe = (c) => c.failed + c.passed + c.expectedFail + c.skipped + c.todo;

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
    if (!a.ilegible && sumaDe(a) !== a.total) problemas.push(`la línea «Test Files» no cierra: ${sumaDe(a)} ≠ ${a.total}`);
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
    if (!t.ilegible && sumaDe(t) !== t.total) problemas.push(`la línea «Tests» no cierra: ${sumaDe(t)} ≠ ${t.total}`);
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
// Lo que suma --listFiles: cada archivo del programa, con ruta ABSOLUTA, uno por
// línea. La primera línea de un stack trace («/x/tsc.js:120000») no termina en una
// extensión y no entra acá.
const ARCHIVO_LISTADO = /^(?:\/|[A-Za-z]:[\\/]).*\.(?:d\.)?[mc]?[tj]sx?$|^(?:\/|[A-Za-z]:[\\/]).*\.json$/;

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

/** Lee la salida de `tsc --noEmit --pretty false [--diagnostics] [--listFiles]`.
 *  - `errores`: una entrada por error, con `clave` = archivo + código + mensaje, SIN
 *    (línea,col). Las líneas con sangría son la continuación del error de arriba
 *    («Type X is not assignable…» → «Property y is missing…») y no cuentan aparte.
 *  - `diagnosticos`: lo de --diagnostics (Files, Check time…).
 *  - `archivos`: lo de --listFiles, sin las raíces (frontend/src/x.tsx, node_modules/…).
 *  - `ilegibles`: líneas que no son ni error ni diagnóstico ni archivo. Si hay alguna,
 *    tsc no terminó bien (un stack trace, un «FATAL ERROR» de memoria) y la lista no
 *    vale. */
export function leerSalidaTsc(salida, raices = []) {
  const errores = [];
  const diagnosticos = {};
  const archivos = [];
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
    if (ARCHIVO_LISTADO.test(cruda.trimEnd())) {
      archivos.push(linea.trimEnd().replace(/\\/g, "/"));
      continue;
    }
    ilegibles.push(cruda);
  }
  return { errores, diagnosticos, archivos, ilegibles };
}

/** Por qué una corrida de tsc no sirve para comparar. Vacío = sirve.
 *  tsc sale con 0 sin errores y con 1 o 2 con errores (2 con --noEmit); cualquier
 *  otra cosa, o un código de error sin ningún error leído, es que se cayó.
 *  `esperados`: los .ts/.tsx que hay en disco en frontend/src (rutas desde la raíz;
 *  null = no comparar). Tienen que estar TODOS en lo que listó --listFiles: si falta
 *  alguno, tsc no lo revisó y sus errores se verían como «arreglados». Pasa con
 *  `cd frontend && npx tsc` (un tsconfig vacío, siempre 0) y con un include achicado
 *  (p. ej. a frontend/src/main.tsx, que deja afuera todos los tests). Contar no
 *  alcanza: «Files» suma ~1500 .d.ts de lib y de node_modules, y un include
 *  achicado sigue por encima de cualquier umbral. */
export function problemasTsc(nombre, { codigo, lectura, esperados }) {
  const p = [];
  if (![0, 1, 2].includes(codigo)) p.push(`${nombre}: tsc salió con código ${codigo} (¿se quedó sin memoria?)`);
  if (codigo !== 0 && lectura.errores.length === 0) p.push(`${nombre}: tsc salió con código ${codigo} sin ningún error legible`);
  if (codigo === 0 && lectura.errores.length > 0) p.push(`${nombre}: tsc salió con 0 pero imprimió ${lectura.errores.length} error(es)`);
  if (lectura.ilegibles.length) {
    p.push(`${nombre}: tsc imprimió ${lectura.ilegibles.length} línea(s) que no son errores:\n    ${lectura.ilegibles.slice(0, 5).join("\n    ")}`);
  }
  if (esperados != null) {
    const revisados = new Set(lectura.archivos);
    const faltan = esperados.filter((r) => !revisados.has(r));
    if (!lectura.archivos.length) p.push(`${nombre}: tsc no listó ningún archivo (¿falta --listFiles?): no se sabe qué revisó`);
    else if (faltan.length) {
      p.push(
        `${nombre}: tsc no revisó ${faltan.length} de los ${esperados.length} archivo(s) de frontend/src ` +
          `(¿se achicó el include de tsconfig.app.json?): ${faltan.slice(0, 5).join(", ")}${faltan.length > 5 ? ", …" : ""}`,
      );
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

// ─── el filtro `paths` de guard-frontend.yml ─────────────────────────────────
//
// La guarda corre solo si el PR toca alguna ruta de `on.pull_request.paths`. Pero
// los tests de frontend/src también LEEN archivos de fuera de frontend/ (edge
// functions, migraciones, nginx.conf: con fs o con import.meta.glob ?raw) y los
// IMPORTAN (tsc y vitest revisan esos módulos). Un PR que toca solo uno de esos
// archivos rompe el test y no lo corre nadie: se mergea en verde. Estas piezas
// juntan lo que la guarda lee de fuera y dicen qué no dispara el filtro.

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Un patrón de rutas a RegExp, con la semántica del filtro de GitHub: `*` = lo
 *  que sea menos «/», `**` = lo que sea, `**\/` = cero o más carpetas.
 *  `llaves: true` acepta además {a,b} (los globs de vite; el filtro de GitHub no
 *  las tiene). Lo que no sabe leer (`?`, `[`, `!`, `+`…) lo RECHAZA: un patrón mal
 *  leído daría por cubierto lo que no lo está. */
export function globARegex(patron, { llaves = false } = {}) {
  let re = "";
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === "*") {
      if (patron[i + 1] !== "*") re += "[^/]*";
      else if (patron[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "{" && llaves) {
      const fin = patron.indexOf("}", i);
      const opciones = fin < 0 ? null : patron.slice(i + 1, fin).split(",");
      if (!opciones || opciones.some((o) => /[*?[\]{}!+\\]/.test(o))) {
        throw new Error(`el patrón «${patron}» tiene llaves que esta guarda no sabe leer`);
      }
      re += `(?:${opciones.map(escaparRegex).join("|")})`;
      i = fin;
    } else if ("?+[]{}!\\()@".includes(c)) {
      throw new Error(`el patrón «${patron}» usa «${c}» y esta guarda no sabe leerlo`);
    } else re += escaparRegex(c);
  }
  return new RegExp(`^${re}$`);
}

/** Los patrones de `paths:` bajo `on: pull_request:` de un workflow. Lector mínimo
 *  de YAML: la lista de `- "patrón"` más adentro que la clave. Si no la encuentra o
 *  no entiende una línea, tira: sin patrones no hay nada que comparar. */
export function patronesDePaths(yml) {
  const lineas = String(yml).split(/\r?\n/);
  const sangria = (l) => l.match(/^\s*/)[0].length;
  const util = (l) => l.trim() && !/^\s*#/.test(l);
  const pr = lineas.findIndex((l) => /^\s+pull_request:\s*$/.test(l));
  if (pr < 0) throw new Error("el workflow no tiene «pull_request:»");
  let i = pr + 1;
  for (; i < lineas.length; i++) {
    if (!util(lineas[i])) continue;
    if (sangria(lineas[i]) <= sangria(lineas[pr])) throw new Error("«pull_request:» no tiene «paths:»");
    if (/^\s+paths:\s*$/.test(lineas[i])) break;
  }
  if (i >= lineas.length) throw new Error("«pull_request:» no tiene «paths:»");
  const clave = sangria(lineas[i]);
  const patrones = [];
  for (const l of lineas.slice(i + 1)) {
    if (!util(l)) continue;
    if (sangria(l) <= clave) break;
    const m = l.match(/^\s*-\s+(?:"([^"]*)"|'([^']*)'|([^\s#"']+))\s*(?:#.*)?$/);
    if (!m) throw new Error(`una línea de «paths:» que esta guarda no entiende: «${l.trim()}»`);
    patrones.push(m[1] ?? m[2] ?? m[3]);
  }
  if (!patrones.length) throw new Error("«paths:» está vacío");
  return patrones;
}

const posix = {
  /** join + normalize de rutas con «/», sin tocar el disco. Null si se sale de la raíz. */
  resolver(dir, rel) {
    const partes = [];
    for (const p of `${dir}/${rel}`.split("/")) {
      if (!p || p === ".") continue;
      if (p === "..") {
        if (!partes.length) return null;
        partes.pop();
      } else partes.push(p);
    }
    return partes.join("/");
  },
  dir: (ruta) => (ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : ""),
};

const ES_CODIGO = /\.(?:[mc]?[tj]sx?)$/;
const EXTENSIONES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx", ".json", "/index.ts", "/index.tsx", "/index.js"];

/** Las cadenas literales de un fuente, leídas con el parser de TypeScript (`ts` es
 *  el módulo typescript: se recibe para que este archivo no dependa de nada).
 *  - `todo: true` (los tests): TODAS las cadenas. Un test lee rutas con fs, con
 *    `new URL(rel, import.meta.url)`, con import.meta.glob o con un ayudante propio
 *    (`leer("supabase/…")`); lo que tienen en común es que la ruta es una cadena.
 *    Los comentarios no cuentan: nombrar un archivo no es leerlo.
 *  - `todo: false` (el resto): solo lo que se importa (import/export … from,
 *    import(), import.meta.glob). En el código de la app «/docs» es una ruta de la
 *    app, no del repo.
 *  Un template `a/${x}/b` queda como el glob «a/*\/b». */
export function cadenasDelFuente(ts, texto, archivo, { todo }) {
  const tipo = /\.[mc]?jsx?$/.test(archivo) ? ts.ScriptKind.JSX : archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, false, tipo);
  const cadenas = [];
  const deCadena = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => "*" + s.literal.text).join("");
    return null;
  };
  const esGlobDeVite = (n) =>
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "glob" &&
    /\bimport\.meta\b/.test(n.expression.expression.getText(sf));
  const visitar = (n) => {
    if (todo) {
      const c = deCadena(n);
      if (c != null) cadenas.push(c);
    } else if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      cadenas.push(deCadena(n.moduleSpecifier) ?? "");
    } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || esGlobDeVite(n))) {
      for (const arg of n.arguments.slice(0, 1)) {
        const lista = ts.isArrayLiteralExpression(arg) ? arg.elements : [arg];
        for (const e of lista) {
          const c = deCadena(e);
          if (c != null) cadenas.push(c);
        }
      }
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      cadenas.push(deCadena(n.argument.literal) ?? "");
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return cadenas.filter(Boolean);
}

/** De las cadenas de un fuente, las que son rutas del repo:
 *  - `relativas`: «./x», «../../supabase/y».
 *  - `desdeLaRaiz`: «supabase/functions/x.ts», «/supabase/…» (import.meta.glob),
 *    «nginx.conf». Empiezan con una entrada de la raíz del repo; una carpeta tiene
 *    que llevar algo adentro («supabase» sola es una palabra).
 *  La cadena ENTERA tiene que ser la ruta (sin el «?raw» del final): «ver
 *  supabase/x» es un texto. */
export function citasDeRutas(cadenas, { carpetasDeLaRaiz, archivosDeLaRaiz }) {
  const relativas = [];
  const desdeLaRaiz = [];
  const carpetas = new Set(carpetasDeLaRaiz);
  const archivos = new Set(archivosDeLaRaiz);
  for (const cruda of cadenas) {
    const c = cruda.replace(/\?[\w=&-]*$/, "");
    if (!c || /[\s"'`<>|\\]/.test(c)) continue;
    if (/^\.\.?\//.test(c)) {
      relativas.push(c);
      continue;
    }
    const sinBarra = c.replace(/^\//, "");
    const [primera, ...resto] = sinBarra.split("/");
    if ((carpetas.has(primera) && resto.join("")) || (archivos.has(primera) && !resto.length)) desdeLaRaiz.push(sinBarra);
  }
  return { relativas, desdeLaRaiz };
}

/** Los archivos del repo a los que se refiere una cita ya puesta desde la raíz. Un
 *  glob se expande; una carpeta son todos sus archivos (readdirSync); un import sin
 *  extensión prueba las de siempre. Lo que no existe no es una ruta: da []. */
export function archivosDeLaCita(cita, archivosDelRepo, carpetasDelRepo) {
  const c = cita.replace(/\/+$/, "");
  if (/[*{]/.test(c)) {
    const todos = [...archivosDelRepo];
    let re;
    try {
      re = globARegex(c, { llaves: true });
    } catch {
      // Un glob que esta guarda no sabe leer: se toma entera la carpeta fija de adelante.
      const fija = c.slice(0, c.search(/[*{]/));
      const carpeta = fija.slice(0, fija.lastIndexOf("/") + 1);
      return carpeta ? todos.filter((a) => a.startsWith(carpeta)) : todos;
    }
    return todos.filter((a) => re.test(a));
  }
  for (const ext of EXTENSIONES) if (archivosDelRepo.has(c + ext)) return [c + ext];
  if (carpetasDelRepo.has(c)) return [...archivosDelRepo].filter((a) => a.startsWith(c + "/"));
  return [];
}

/** Todo lo que la guarda lee de fuera de lo que ya la dispara. Parte de `fuentes`
 *  (los archivos de código que cubre el filtro: frontend/, los configs,
 *  scripts/ci/) y sigue lo que IMPORTAN, y lo que eso importa a su vez: tsc y
 *  vitest revisan toda la cadena.
 *  `cadenasDe(ruta, { todo })` → las cadenas del fuente (cadenasDelFuente). Los
 *  tests (`esTest`) se miran enteros; el resto, solo sus imports.
 *  Devuelve Map<ruta del repo, quién la cita (el primero que se encontró)>. */
export function lecturasDeLaGuarda({ fuentes, archivosDelRepo, cadenasDe, esTest }) {
  const archivos = new Set(archivosDelRepo);
  const carpetas = new Set();
  for (const a of archivos) for (let d = posix.dir(a); d; d = posix.dir(d)) carpetas.add(d);
  const raiz = [...archivos].map((a) => a.split("/")[0]);
  const entradas = {
    carpetasDeLaRaiz: [...new Set(raiz.filter((r) => carpetas.has(r)))],
    archivosDeLaRaiz: [...new Set(raiz.filter((r) => archivos.has(r)))],
  };

  const deLaGuarda = new Set(fuentes);
  const citadas = new Map();
  const pendientes = [...deLaGuarda].map((ruta) => ({ ruta, todo: esTest(ruta) }));
  const vistos = new Set();
  while (pendientes.length) {
    const { ruta, todo } = pendientes.pop();
    if (vistos.has(ruta)) continue;
    vistos.add(ruta);
    const { relativas, desdeLaRaiz } = citasDeRutas(cadenasDe(ruta, { todo }), entradas);
    const resueltas = [
      ...relativas.map((r) => posix.resolver(posix.dir(ruta), r)),
      ...desdeLaRaiz.map((r) => posix.resolver("", r)),
    ].filter(Boolean);
    for (const cita of resueltas) {
      for (const a of archivosDeLaCita(cita, archivos, carpetas)) {
        if (a === ruta) continue;
        if (!citadas.has(a)) citadas.set(a, ruta);
        // Lo que se importa se sigue (solo sus imports: no es un test de vitest).
        if (ES_CODIGO.test(a) && !deLaGuarda.has(a)) pendientes.push({ ruta: a, todo: false });
      }
    }
  }
  return citadas;
}

/** Lo que la guarda lee y el filtro `paths` no cubre: [{ ruta, desde }]. */
export function lecturasSinCubrir(citadas, patrones) {
  const res = patrones.map((p) => globARegex(p));
  return [...citadas]
    .filter(([ruta]) => !res.some((re) => re.test(ruta)))
    .map(([ruta, desde]) => ({ ruta, desde }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Qué le falta al filtro `paths`. Vacío = cubre todo.
 *  - `requeridos`: patrones que tienen que estar TAL CUAL: lo que la guarda corre
 *    por su cuenta y lo que no se cita con una cadena (package-lock, tsconfig…).
 *  - `citadas`: lo de lecturasDeLaGuarda.
 *  - `noSonLecturas`: Map<ruta, por qué> de cadenas que parecen una ruta del repo y
 *    no se leen. Una que ya no cita nadie también es un problema: se saca. */
export function problemasDelFiltro({ patrones, requeridos, citadas, noSonLecturas = new Map() }) {
  const p = [];
  for (const r of requeridos) {
    if (!patrones.includes(r)) p.push(`falta «${r}» en paths: la guarda no corre cuando eso cambia`);
  }
  for (const { ruta, desde } of lecturasSinCubrir(citadas, patrones)) {
    if (!noSonLecturas.has(ruta)) p.push(`${ruta} (lo lee ${desde}) no dispara la guarda: sumalo a paths`);
  }
  for (const ruta of noSonLecturas.keys()) {
    if (!citadas.has(ruta)) p.push(`la excepción «${ruta}» ya no la cita nadie: sacala de la lista`);
  }
  return p;
}
