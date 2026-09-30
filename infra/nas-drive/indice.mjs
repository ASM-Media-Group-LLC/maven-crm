// El ÍNDICE DIARIO del Drive (corre en mini5 todas las noches, LaunchAgent
// ai.maven.nas-drive-indice).
//
// En el disco los archivos no tienen nombre ni carpeta: son
// <agencia>/<id>. El árbol («Contabilidad/2026/Balance.pdf») vive solo en la
// base de Maven. Como el Drive no tiene copia de seguridad (decisión de Jhon,
// 28/09), si la base se perdiera los archivos seguirían en el disco pero nadie
// sabría cuál es cuál. Este índice, guardado al lado de los archivos, es esa
// llave.
//
// Regla del NAS: la mini TRAE. Le pide el índice a la edge `drive` con un
// permiso firmado con el mismo DRIVE_SECRETO, y lo escribe en los DOS discos
// (si se muere uno, el índice del otro sigue):
//   /Volumes/NASx/maven-drive/<agencia>/_indice/actual.csv / actual.json
//   /Volumes/NASx/maven-drive/<agencia>/_indice/AAAA-MM-DD.csv / .json
// Se guardan los últimos 30 días.

import fsp from "node:fs/promises";
import path from "node:path";
import { firmar } from "./firma.mjs";

export const COLUMNAS = [
  "ruta", "tipo", "nombre", "dueno", "correo_dueno", "tamano", "sha256", "estado",
  "en_papelera", "archivo_en_disco", "creado", "modificado", "abierto_por_ultima_vez",
  "agencia", "agencia_id",
];
const DIAS_QUE_SE_GUARDAN = 30;

/** CSV que Excel abre bien: BOM para que lea UTF-8 (acentos), comillas
 *  dobles escapadas, y todo campo entre comillas si trae coma, comilla o
 *  salto de línea. */
export function aCsv(filas) {
  const celda = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [COLUMNAS.join(",")];
  for (const f of filas) lineas.push(COLUMNAS.map((c) => celda(f[c])).join(","));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

/** Escribe a un temporal y lo pone en su lugar: si se corta a mitad, el
 *  «actual» de ayer sigue entero en vez de quedar un archivo roto. */
async function escribirAtomico(destino, contenido) {
  const tmp = `${destino}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, contenido);
  await fsp.rename(tmp, destino);
}

export async function escribirIndice({ raices, filas, generado, fecha, conservar = DIAS_QUE_SE_GUARDAN }) {
  const porAgencia = new Map();
  for (const f of filas) {
    const lista = porAgencia.get(f.agencia_id);
    if (lista) lista.push(f); else porAgencia.set(f.agencia_id, [f]);
  }
  const resultado = { agencias: porAgencia.size, filas: filas.length, discos: [], errores: [] };
  for (const raiz of raices) {
    try {
      // ⚠️ También las agencias que ya tienen carpeta en el disco aunque hoy
      // no tengan nada: si no, cuando una agencia se queda sin archivos su
      // «actual» de ayer quedaba ahí, jurando que existen archivos borrados
      // (visto el 28/09 al limpiar la prueba).
      const enDisco = (await fsp.readdir(raiz).catch(() => [])).filter((n) => /^[0-9a-f-]{36}$/.test(n));
      const todas = new Map(porAgencia);
      for (const a of enDisco) if (!todas.has(a)) todas.set(a, []);
      for (const [agencia, lista] of todas) {
        if (!/^[0-9a-f-]{36}$/.test(agencia)) continue; // nunca una ruta rara
        const dir = path.join(raiz, agencia, "_indice");
        await fsp.mkdir(dir, { recursive: true });
        const csv = aCsv(lista);
        const json = JSON.stringify({ generado, agencia_id: agencia, filas: lista }, null, 1);
        await escribirAtomico(path.join(dir, `${fecha}.csv`), csv);
        await escribirAtomico(path.join(dir, `${fecha}.json`), json);
        await escribirAtomico(path.join(dir, "actual.csv"), csv);
        await escribirAtomico(path.join(dir, "actual.json"), json);
        // Los de más de N días se van; «actual» nunca.
        const fechas = [...new Set((await fsp.readdir(dir))
          .map((n) => n.match(/^(\d{4}-\d{2}-\d{2})\.(csv|json)$/)?.[1]).filter(Boolean))].sort();
        for (const vieja of fechas.slice(0, Math.max(0, fechas.length - conservar))) {
          await fsp.rm(path.join(dir, `${vieja}.csv`), { force: true });
          await fsp.rm(path.join(dir, `${vieja}.json`), { force: true });
        }
      }
      resultado.discos.push(raiz);
    } catch (e) {
      // Un disco que falla no frena al otro: la gracia de escribir en los dos.
      resultado.errores.push(`${raiz}: ${e.message}`);
    }
  }
  return resultado;
}

export async function pedirIndice({ funciones, secreto, fetchFn = fetch }) {
  const permiso = firmar(secreto, { op: "indice", k: "indice", e: Math.floor(Date.now() / 1000) + 300 });
  const r = await fetchFn(`${funciones}/drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "indice", permiso }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.filas)) throw new Error(`Maven contestó ${r.status}: ${j.error ?? "sin filas"}`);
  return j;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secreto = process.env.DRIVE_SECRETO ?? "";
  const funciones = (process.env.MAVEN_FUNCIONES ?? "https://lsagslbkliprespbyhts.supabase.co/functions/v1").replace(/\/+$/, "");
  const raices = (process.env.RAICES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }); // AAAA-MM-DD
  try {
    const { generado, filas } = await pedirIndice({ funciones, secreto });
    const r = await escribirIndice({ raices, filas, generado, fecha });
    console.log(`[indice] ${new Date().toISOString()} · ${r.filas} filas · ${r.agencias} agencias · discos: ${r.discos.join(", ") || "NINGUNO"}${r.errores.length ? ` · ERRORES: ${r.errores.join(" | ")}` : ""}`);
    process.exit(r.discos.length ? 0 : 1);
  } catch (e) {
    console.error(`[indice] ${new Date().toISOString()} · FALLÓ: ${e.message}`);
    process.exit(1);
  }
}
