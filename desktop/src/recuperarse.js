// SI LA APP SE CUELGA O SE QUEDA EN BLANCO, SE RECUPERA SOLA (Alvaro, 17/11/2026).
//
// En los equipos de 4–8 GB la página de Maven puede quedarse sin memoria: el
// proceso que la dibuja muere (la ventana queda en blanco) o se congela. Antes
// la persona quedaba con la ventana muerta hasta cerrarla a mano. Ahora:
//  · si el proceso de la página muere → se anota y se vuelve a cargar Maven;
//  · si se congela más de 20 s → se lo termina, y eso dispara lo de arriba;
//  · más de 3 caídas en 5 minutos → espera 30 s antes de recargar (no entra en
//    un bucle que trabe más el equipo).
// Lo anotado (cuándo, por qué, cuánta memoria) lo lee la página al volver
// (preload: ultimoCierre) y lo guarda en la base (tabla app_caidas).
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CONGELADA_MS = 20_000;
const VENTANA_CAIDAS_MS = 5 * 60_000;
const MAX_CAIDAS_SEGUIDAS = 3;
const ESPERA_SI_SE_REPITE_MS = 30_000;

const archivo = () => path.join(app.getPath("userData"), "ultimo-cierre.json");
const gb = (b) => Math.round((b / 1024 ** 3) * 10) / 10;

function memoriaDeLaApp() {
  try {
    const kb = app.getAppMetrics().reduce((t, m) => t + (m.memory?.workingSetSize ?? 0), 0);
    return Math.round(kb / 1024);
  } catch {
    return null;
  }
}

function anotar(motivo, codigo) {
  const fila = {
    at: new Date().toISOString(),
    motivo,
    codigo: codigo ?? null,
    ram_app_mb: memoriaDeLaApp(),
    ram_equipo_gb: gb(os.totalmem()),
    ram_libre_gb: gb(os.freemem()),
    version: app.getVersion(),
    plataforma: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux",
  };
  try {
    // Se guardan las últimas (no se pisan si se cae dos veces antes de leerlas).
    let antes = [];
    try { antes = JSON.parse(fs.readFileSync(archivo(), "utf8")); } catch { antes = []; }
    const todas = [...(Array.isArray(antes) ? antes : []), fila].slice(-10);
    fs.writeFileSync(archivo(), JSON.stringify(todas));
  } catch { /* sin disco: no se anota, pero igual se recupera */ }
}

/** Lo anotado desde la última vez, y se borra (lo lee la página una sola vez). */
function leerYBorrarCierres() {
  try {
    const todas = JSON.parse(fs.readFileSync(archivo(), "utf8"));
    fs.unlinkSync(archivo());
    return Array.isArray(todas) ? todas : [];
  } catch {
    return [];
  }
}

function vigilarVentana(ventana, recargar) {
  const caidas = [];
  let congelada = null;
  const wc = ventana.webContents;

  wc.on("render-process-gone", (_e, detalles) => {
    if (detalles.reason === "clean-exit") return;
    anotar(detalles.reason, detalles.exitCode);
    const ahora = Date.now();
    while (caidas.length && ahora - caidas[0] > VENTANA_CAIDAS_MS) caidas.shift();
    caidas.push(ahora);
    const espera = caidas.length > MAX_CAIDAS_SEGUIDAS ? ESPERA_SI_SE_REPITE_MS : 500;
    setTimeout(() => { if (!ventana.isDestroyed()) recargar(); }, espera);
  });

  wc.on("unresponsive", () => {
    if (congelada) return;
    congelada = setTimeout(() => {
      congelada = null;
      if (ventana.isDestroyed()) return;
      anotar("congelada", null);
      try { wc.forcefullyCrashRenderer(); } catch { recargar(); }
    }, CONGELADA_MS);
  });
  wc.on("responsive", () => {
    if (congelada) { clearTimeout(congelada); congelada = null; }
  });
}

module.exports = { vigilarVentana, leerYBorrarCierres, anotar };
