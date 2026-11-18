// ARGOS DESDE EL COMPUTADOR: QUÉ APP Y QUÉ PÁGINA, Y CUÁNTO SIN TOCAR NADA.
//
// Alvaro (17/11/2026): «app y página», como Hubstaff. Cada 5 s se mira la
// ventana que está al frente (app + título de la ventana, que en un navegador
// es el título de la página) y los segundos sin tocar teclado ni mouse en
// TODO el computador. Los tramos seguidos de la misma app y título se juntan,
// y cada minuto se le pasan a la página, que los guarda con la sesión de la
// persona (tabla argos_uso_apps). La cáscara no tiene llaves ni escribe nada.
//
// Permisos: en Mac el título de la ventana necesita «Grabación de pantalla»
// (el mismo de compartir pantalla). Sin ese permiso queda solo el nombre de
// la app. No se pide Accesibilidad.
//
// OJO (17/11/2026): get-windows, para revisar ese permiso, abre una captura de
// pantalla, y si falta macOS muestra su aviso. Por eso solo se le piden
// títulos cuando macOS YA dio el permiso (pantallaPermitida solo consulta, no
// muestra nada). Así este vigía nunca hace saltar el aviso de macOS.
const { powerMonitor } = require("electron");
const { pantallaPermitida } = require("./permisoPantalla");

const MUESTRA_MS = 5000;
const ENVIO_MS = 60 * 1000;
const INACTIVO_S = 60; // más de 1 min sin tocar nada = ese rato cuenta como inactivo

let leerVentana = null;
let titulosRotos = false; // con permiso y aun así falló: sin títulos hasta reabrir Maven (sin reintentos)
async function ventanaAlFrente() {
  try {
    if (!leerVentana) leerVentana = (await import("get-windows")).activeWindow;
    const conTitulos = !titulosRotos && pantallaPermitida();
    let w;
    try {
      w = await leerVentana({ accessibilityPermission: false, screenRecordingPermission: conTitulos });
    } catch (e) {
      if (!conTitulos) throw e;
      titulosRotos = true;
      w = await leerVentana({ accessibilityPermission: false, screenRecordingPermission: false });
    }
    if (!w) return null;
    return {
      app: String(w.owner?.name ?? "").slice(0, 120) || "Desconocida",
      titulo: String(w.title ?? "").slice(0, 300),
      url: typeof w.url === "string" ? w.url.slice(0, 500) : null,
    };
  } catch {
    return null;
  }
}

function iniciarVigiaDeApps(enviar) {
  let tramo = null;      // { app, titulo, url, desde, hasta, segundos, inactivos }
  let lote = [];

  const cerrarTramo = () => {
    if (tramo && tramo.segundos > 0) lote.push(tramo);
    tramo = null;
  };

  // Una lectura a la vez (18/11/2026): en Mac cada lectura es un proceso aparte.
  // Si el Mac está cargado y una tarda más de 5 s, antes se apilaban sin tope;
  // ahora se salta la vuelta. Una lectura que tarda más de 4 s no frena la
  // muestra, pero no se lanza otra hasta que esa termine.
  let leyendo = false;
  let lectura = null;
  setInterval(async () => {
    if (leyendo) return;
    leyendo = true;
    try {
      await muestra();
    } finally {
      leyendo = false;
    }
  }, MUESTRA_MS);

  async function muestra() {
    const ahora = Date.now();
    const inactivo = powerMonitor.getSystemIdleTime();
    const bloqueada = powerMonitor.getSystemIdleState(INACTIVO_S) === "locked";
    const w = bloqueada
      ? { app: "Pantalla bloqueada", titulo: "", url: null }
      : lectura
        ? null
        : await Promise.race([
            (lectura = ventanaAlFrente().finally(() => { lectura = null; })),
            new Promise((r) => setTimeout(() => r(null), 4000)),
          ]);
    if (!w) return;
    const paso = MUESTRA_MS / 1000;
    if (!tramo || tramo.app !== w.app || tramo.titulo !== w.titulo) {
      cerrarTramo();
      tramo = { ...w, desde: new Date(ahora - MUESTRA_MS).toISOString(), hasta: new Date(ahora).toISOString(), segundos: 0, inactivos: 0 };
    }
    tramo.segundos += paso;
    if (inactivo >= INACTIVO_S || bloqueada) tramo.inactivos += paso;
    tramo.hasta = new Date(ahora).toISOString();
  }

  setInterval(() => {
    // El tramo abierto se manda partido: lo que va hasta ahora sale y sigue uno nuevo igual.
    if (tramo && tramo.segundos > 0) {
      lote.push({ ...tramo });
      tramo = { ...tramo, desde: tramo.hasta, segundos: 0, inactivos: 0 };
    }
    if (!lote.length) return;
    const salida = lote;
    lote = [];
    enviar(salida);
  }, ENVIO_MS);
}

/** Segundos sin tocar teclado ni mouse en todo el computador. */
function segundosInactivo() {
  return powerMonitor.getSystemIdleTime();
}

module.exports = { iniciarVigiaDeApps, segundosInactivo };
