#!/usr/bin/env node
// Corre tsc con tsconfig.app.json sobre la cabeza y sobre la base, y falla solo si
// la cabeza trae un error que la base no tenía. (Con `-p .guarda-tsc.json`, una
// config que extiende tsconfig.app.json y le suma el canario: ver abajo.)
//
//   node scripts/ci/tsc-sin-errores-nuevos.mjs [--base=<ref>] [--secuencial]
//
// - La base es `git merge-base HEAD <ref>` (por defecto origin/main). En el PR, el
//   workflow pasa --base=HEAD^1: HEAD es el merge que arma GitHub y HEAD^1 es main
//   tal como está ahora, así que se compara exactamente contra lo que va a quedar.
// - La base se arma en un worktree aparte. Si package.json y package-lock.json no
//   cambiaron, usa el mismo node_modules (enlace); si cambiaron, instala el suyo,
//   para que un tipo que cambió con una dependencia se vea como nuevo.
// - Se compara la LISTA (archivo + código + mensaje, sin línea ni columna), no el
//   número. Ver guardas.mjs.
// - tsc corre SIEMPRE revisando tipos, diga lo que diga tsconfig.app.json: la línea
//   de comandos lleva `--noCheck false` (con `"noCheck": true` tsc lista todos los
//   archivos, no marca ningún error y todo lo viejo se vería «arreglado»). Y, por si
//   aparece otra forma de apagar la revisión, cada árbol lleva un error de control
//   (CANARIO_TSC en guardas.mjs): si tsc no lo marca, la corrida no vale.
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANARIO_TSC, anotacion, configDelCanario, erroresNuevos, leerSalidaTsc, problemasTsc, sinElCanario } from "./guardas.mjs";

// El límite del heap de cada tsc. El de V8 por defecto depende de la memoria de la
// máquina: en el runner privado de GitHub (7 GB) queda cerca de 1,75 GB y tsc ya usa
// ~1,56 GB en este repo, así que al crecer el frontend se caería (código 134) en
// todos los PR. Dos tsc a 3 GB entran en 7 GB; lo que usan de verdad es ~1,9 GB cada uno.
const MEMORIA_TSC_MB = 3072;

const args = process.argv.slice(2);
const opcion = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const baseRef = opcion("base") ?? "origin/main";
const secuencial = args.includes("--secuencial");

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const raiz = git("rev-parse", "--show-toplevel");
const cabezaSha = git("rev-parse", "HEAD");
const baseSha = git("merge-base", "HEAD", baseRef);

/** Los .ts/.tsx de frontend/src en disco, como los lista tsc sin la raíz
 *  («frontend/src/x.tsx»). Tienen que estar todos en su --listFiles. */
function fuentesDelFrontend(dir, rel = "frontend/src") {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) res.push(...fuentesDelFrontend(ruta, `${rel}/${e.name}`));
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) res.push(`${rel}/${e.name}`);
  }
  return res;
}

/** Siembra el canario en la raíz de un árbol: el archivo con el error de control y
 *  la config que lo suma al programa de tsconfig.app.json. Devuelve lo que escribió,
 *  para borrarlo después. */
function sembrarCanario(dir) {
  let tsconfigApp = "";
  try {
    tsconfigApp = readFileSync(join(dir, "tsconfig.app.json"), "utf8");
  } catch {
    // Sin tsconfig.app.json el extends falla, tsc no marca el canario y da rojo.
  }
  const config = configDelCanario(tsconfigApp);
  const escritos = [join(dir, CANARIO_TSC.archivo), join(dir, CANARIO_TSC.config)];
  writeFileSync(escritos[0], CANARIO_TSC.fuente);
  writeFileSync(escritos[1], config);
  return escritos;
}

function correrTsc(dir) {
  return new Promise((ok) => {
    const inicio = Date.now();
    const hijo = spawn(
      process.execPath,
      [
        `--max-old-space-size=${MEMORIA_TSC_MB}`,
        join(dir, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "-p",
        CANARIO_TSC.config,
        // Pisa un `"noCheck": true` del tsconfig (TS >= 5.6; uno más viejo no conoce
        // la opción, no revisa nada, no marca el canario y da rojo).
        "--noCheck",
        "false",
        "--pretty",
        "false",
        "--diagnostics",
        "--listFiles",
      ],
      { cwd: dir, env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let salida = "";
    hijo.stdout.on("data", (b) => (salida += b));
    hijo.stderr.on("data", (b) => (salida += b));
    hijo.on("error", (e) => ok({ codigo: 127, salida: `no se pudo arrancar tsc: ${e.message}`, segundos: 0 }));
    hijo.on("close", (c, senal) => ok({ codigo: c ?? (senal ? 128 : 1), salida, segundos: Math.round((Date.now() - inicio) / 1000) }));
  });
}

console.log(`cabeza: ${cabezaSha}`);
console.log(`base:   ${baseSha} (merge-base con ${baseRef})`);

let dirBase = null;
let sembrados = [];
let salidaFinal = 1;
try {
  const esperados = fuentesDelFrontend(join(raiz, "frontend", "src"));
  sembrados = sembrarCanario(raiz);
  let base;
  let cabeza;
  if (baseSha === cabezaSha) {
    console.log("La cabeza ES la base: no hay nada que comparar.");
    cabeza = await correrTsc(raiz);
    base = cabeza;
  } else {
    dirBase = mkdtempSync(join(tmpdir(), "tsc-base-"));
    git("worktree", "add", "--detach", "--quiet", dirBase, baseSha);
    // Contra el árbol de trabajo (no contra HEAD): en una prueba local también cuenta
    // lo que todavía no se commiteó. `git diff --quiet` sale con 1 si hay diferencias.
    let cambiaron = false;
    try {
      execFileSync("git", ["diff", "--quiet", baseSha, "--", "package.json", "package-lock.json"], { stdio: "ignore" });
    } catch {
      cambiaron = true;
    }
    if (cambiaron) {
      console.log("package.json o package-lock.json cambiaron: la base instala sus propias dependencias.");
      execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: dirBase, stdio: "inherit" });
    } else {
      symlinkSync(join(raiz, "node_modules"), join(dirBase, "node_modules"), "dir");
    }
    sembrarCanario(dirBase);
    console.log(secuencial ? "tsc: base y cabeza, una después de la otra…" : "tsc: base y cabeza a la vez…");
    if (secuencial) {
      base = await correrTsc(dirBase);
      cabeza = await correrTsc(raiz);
    } else {
      [base, cabeza] = await Promise.all([correrTsc(dirBase), correrTsc(raiz)]);
    }
  }

  const raices = [raiz, dirBase].filter(Boolean).flatMap((r) => [r, realpathSync(r)]);
  const lBase = leerSalidaTsc(base.salida, raices);
  const lCabeza = leerSalidaTsc(cabeza.salida, raices);
  const problemas = [
    ...problemasTsc("base", { codigo: base.codigo, lectura: lBase, esperados: null, canario: true }),
    ...problemasTsc("cabeza", { codigo: cabeza.codigo, lectura: lCabeza, esperados, canario: true }),
  ];
  // Los errores del canario no son del código: se cuentan (arriba) y se sacan.
  const { nuevos, arreglados, cambiaronTexto } = erroresNuevos(sinElCanario(lBase).errores, sinElCanario(lCabeza).errores);

  console.log(`\n── guarda de tsc ──`);
  const memoria = (l) => (l.diagnosticos["Memory used"] != null ? `${Math.round(l.diagnosticos["Memory used"] / 1024)} MB` : "? MB");
  const errores = (l) => sinElCanario(l).errores.length;
  const canario = (l) => (errores(l) < l.errores.length ? "canario visto" : "SIN canario");
  console.log(`base:   ${errores(lBase)} error(es), ${lBase.archivos.length} archivos, ${base.segundos} s, ${memoria(lBase)}, ${canario(lBase)}`);
  console.log(`cabeza: ${errores(lCabeza)} error(es), ${lCabeza.archivos.length} archivos, ${cabeza.segundos} s, ${memoria(lCabeza)}, ${canario(lCabeza)}`);
  const revisados = new Set(lCabeza.archivos);
  console.log(`frontend/src: ${esperados.length} .ts/.tsx en disco; tsc los revisó todos: ${esperados.every((r) => revisados.has(r)) ? "sí" : "NO"}`);
  console.log(`nuevos: ${nuevos.length} · arreglados: ${arreglados}`);
  for (const e of nuevos) {
    console.log(anotacion(e));
    console.log(`  NUEVO  ${e.archivo ? `${e.archivo}(${e.linea},${e.columna}): ` : ""}${e.mensaje}`);
  }
  // Errores viejos con otro final de mensaje (p. ej. la unión de RPC de types.ts): aviso, no rojo.
  for (const { ahora } of cambiaronTexto) {
    console.log(`::warning file=${ahora.archivo ?? ""},line=${ahora.linea ?? 1},title=tsc: error viejo con otro texto::el mismo error que en la base, con otro final de mensaje`);
    console.log(`  CAMBIÓ EL TEXTO  ${ahora.archivo ? `${ahora.archivo}(${ahora.linea},${ahora.columna}): ` : ""}${ahora.mensaje.slice(0, 160)}`);
  }
  if (cambiaronTexto.length) console.log(`cambiaron de texto (no cuentan como nuevos): ${cambiaronTexto.length}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const filas = [
      "### tsc (`tsconfig.app.json`) contra la base",
      "",
      `| | errores | archivos |`,
      "|---|---|---|",
      `| base \`${baseSha.slice(0, 8)}\` | ${errores(lBase)} | ${lBase.archivos.length} |`,
      `| cabeza \`${cabezaSha.slice(0, 8)}\` | ${errores(lCabeza)} | ${lCabeza.archivos.length} |`,
      "",
      `Nuevos: **${nuevos.length}** · arreglados: ${arreglados} · viejos con otro texto: ${cambiaronTexto.length}`,
      "",
      ...nuevos.map((e) => `- \`${e.archivo ?? "(global)"}${e.archivo ? `:${e.linea}` : ""}\` ${e.mensaje.replace(/\|/g, "\\|")}`),
      ...(problemas.length ? ["", `**No se pudo comparar:** ${problemas.join("; ")}`] : []),
      "",
    ];
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, filas.join("\n"));
    } catch {
      /* el resumen es un extra */
    }
  }

  if (problemas.length) {
    console.log("\nROJO: la corrida de tsc no sirve para comparar:");
    for (const p of problemas) console.log(`  - ${p}`);
    for (const [nombre, r] of [["base", base], ["cabeza", cabeza]]) {
      console.log(`\n── salida de tsc (${nombre}, últimas 40 líneas) ──`);
      console.log(r.salida.split("\n").slice(-40).join("\n"));
    }
  } else if (nuevos.length) {
    console.log(`\nROJO: ${nuevos.length} error(es) de tipos nuevo(s) respecto de la base.`);
  } else {
    console.log("\nVERDE: ningún error de tipos nuevo.");
    salidaFinal = 0;
  }
} catch (e) {
  // Lo que no es de tsc (la config del canario, git): rojo con el motivo, no un stack trace.
  console.log(`\nROJO: la guarda de tsc no pudo correr: ${e?.message ?? e}`);
} finally {
  for (const f of sembrados) rmSync(f, { force: true });
  if (dirBase) {
    try {
      git("worktree", "remove", "--force", dirBase);
    } catch {
      rmSync(dirBase, { recursive: true, force: true });
      try {
        git("worktree", "prune");
      } catch {
        /* nada */
      }
    }
  }
}
process.exit(salidaFinal);
