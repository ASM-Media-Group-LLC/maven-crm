#!/usr/bin/env node
// Corre `tsc --noEmit -p tsconfig.app.json` sobre la cabeza y sobre la base, y
// falla solo si la cabeza trae un error que la base no tenía.
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
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anotacion, erroresNuevos, leerSalidaTsc, problemasTsc } from "./guardas.mjs";

const args = process.argv.slice(2);
const opcion = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const baseRef = opcion("base") ?? "origin/main";
const secuencial = args.includes("--secuencial");

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const raiz = git("rev-parse", "--show-toplevel");
const cabezaSha = git("rev-parse", "HEAD");
const baseSha = git("merge-base", "HEAD", baseRef);

function contarFuentes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) n += contarFuentes(ruta);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) n++;
  }
  return n;
}

function correrTsc(dir) {
  return new Promise((ok) => {
    const inicio = Date.now();
    const hijo = spawn(
      process.execPath,
      [join(dir, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.app.json", "--pretty", "false", "--diagnostics"],
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
let salidaFinal = 1;
try {
  const minimoDeArchivos = contarFuentes(join(raiz, "frontend", "src"));
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
    ...problemasTsc("base", { codigo: base.codigo, lectura: lBase, minimoDeArchivos: null }),
    ...problemasTsc("cabeza", { codigo: cabeza.codigo, lectura: lCabeza, minimoDeArchivos }),
  ];
  const { nuevos, arreglados } = erroresNuevos(lBase.errores, lCabeza.errores);

  console.log(`\n── guarda de tsc ──`);
  const memoria = (l) => (l.diagnosticos["Memory used"] != null ? `${Math.round(l.diagnosticos["Memory used"] / 1024)} MB` : "? MB");
  console.log(`base:   ${lBase.errores.length} error(es), ${lBase.diagnosticos.Files ?? "?"} archivos, ${base.segundos} s, ${memoria(lBase)}`);
  console.log(`cabeza: ${lCabeza.errores.length} error(es), ${lCabeza.diagnosticos.Files ?? "?"} archivos, ${cabeza.segundos} s, ${memoria(lCabeza)}`);
  console.log(`nuevos: ${nuevos.length} · arreglados: ${arreglados}`);
  for (const e of nuevos) {
    console.log(anotacion(e));
    console.log(`  NUEVO  ${e.archivo ? `${e.archivo}(${e.linea},${e.columna}): ` : ""}${e.mensaje}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const filas = [
      "### tsc (`tsconfig.app.json`) contra la base",
      "",
      `| | errores | archivos |`,
      "|---|---|---|",
      `| base \`${baseSha.slice(0, 8)}\` | ${lBase.errores.length} | ${lBase.diagnosticos.Files ?? "?"} |`,
      `| cabeza \`${cabezaSha.slice(0, 8)}\` | ${lCabeza.errores.length} | ${lCabeza.diagnosticos.Files ?? "?"} |`,
      "",
      `Nuevos: **${nuevos.length}** · arreglados: ${arreglados}`,
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
} finally {
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
