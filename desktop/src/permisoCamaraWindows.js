// CÁMARA Y MICRÓFONO EN WINDOWS, SIN QUE FALLEN EN SILENCIO.
//
// Alvaro (18/11/2026): la guía decía «si Maven te pide la cámara, toca
// Permitir», sin haberlo visto en un Windows. Lo que hace Windows hoy: a una app
// de computador NO le pregunta nada. Tiene interruptores en Configuración →
// Privacidad y seguridad → Cámara (y lo mismo en Micrófono): el acceso a la
// cámara y «Permitir que las aplicaciones de escritorio accedan». Si alguno está
// apagado, la cámara o el micrófono no andan en Maven y nadie avisa: Cowork
// queda sin imagen o sin voz.
//
// Por eso, cuando Maven pide la cámara o el micrófono, la app mira esos
// interruptores (solo lee, no cambia nada) y, si alguno está apagado, explica
// cómo prenderlo, con un botón que abre ese ajuste. Una vez por arranque.
//
// Se miran dos fuentes: lo que Windows le contesta a la app
// (getMediaAccessStatus) y los mismos interruptores en el registro, por si una
// versión de Windows contesta «permitido» con el de las apps de escritorio
// apagado. Los Windows de prueba ya traen un interruptor por app y su propio
// «¿Permitir?»: si ahí tocan «No permitir», esto también lo ve.
const { dialog, shell, systemPreferences } = require("electron");
const { execFile } = require("node:child_process");

const esWindows = process.platform === "win32";
const CONSENTIMIENTO = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore";
const TIPOS = {
  camera: { clave: "webcam", ajuste: "ms-settings:privacy-webcam", nombre: "la cámara", acceso: "el acceso a la cámara", falla: "no se te ve" },
  microphone: { clave: "microphone", ajuste: "ms-settings:privacy-microphone", nombre: "el micrófono", acceso: "el acceso al micrófono", falla: "no se te escucha" },
};

/** Lee el «Value» de una llave del registro (Allow / Deny), o null. */
function leerValor(llave) {
  return new Promise((resolver) => {
    try {
      execFile("reg", ["query", llave, "/v", "Value"], { windowsHide: true, timeout: 3000 }, (error, salida) => {
        if (error) return resolver(null);
        const valor = /\bValue\s+REG_SZ\s+(\S+)/i.exec(String(salida));
        resolver(valor ? valor[1] : null);
      });
    } catch {
      resolver(null);
    }
  });
}

/** ¿Windows tiene apagado este tipo para Maven? Solo consulta. */
async function apagadoEnWindows(tipo) {
  if (!esWindows) return false;
  let estado = "";
  try {
    estado = systemPreferences.getMediaAccessStatus(tipo);
  } catch {
    // sin respuesta: queda el registro
  }
  if (estado === "denied" || estado === "restricted") return true;
  const { clave } = TIPOS[tipo];
  const estaApp = process.execPath.replace(/\\/g, "#"); // así nombra Windows a cada app de escritorio
  const valores = await Promise.all([
    leerValor(`HKLM\\${CONSENTIMIENTO}\\${clave}`), // acceso en todo el equipo
    leerValor(`HKCU\\${CONSENTIMIENTO}\\${clave}`), // «Permitir que las aplicaciones accedan»
    leerValor(`HKCU\\${CONSENTIMIENTO}\\${clave}\\NonPackaged`), // «… de escritorio accedan»
    leerValor(`HKCU\\${CONSENTIMIENTO}\\${clave}\\NonPackaged\\${estaApp}`), // solo Maven (Windows nuevos)
  ]);
  return valores.some((v) => typeof v === "string" && v.toLowerCase() === "deny");
}

const avisados = new Set();
let cola = Promise.resolve();

/** Maven pidió la cámara o el micrófono. Se miran los dos (Cowork usa los
 *  dos) y, si Windows tiene apagado alguno, se explica una vez por arranque. */
function revisarCamaraYMicrofono(ventana) {
  if (!esWindows) return cola;
  const pedidos = Object.keys(TIPOS).filter((tipo) => !avisados.has(tipo));
  if (!pedidos.length) return cola;
  // En fila: Cowork pide el micrófono y la cámara casi a la vez y sale un solo aviso.
  cola = cola.then(() => revisar(pedidos, ventana)).catch(() => {});
  return cola;
}

async function revisar(pedidos, ventana) {
  const apagados = [];
  for (const tipo of pedidos) {
    if (avisados.has(tipo)) continue;
    if (await apagadoEnWindows(tipo)) apagados.push(tipo);
  }
  if (!apagados.length) return;
  apagados.forEach((tipo) => avisados.add(tipo));

  const [primero] = apagados;
  const ambos = apagados.length > 1;
  const opciones = {
    type: "warning",
    title: "Maven",
    message: `Windows no deja que Maven use ${apagados.map((t) => TIPOS[t].nombre).join(" ni ")}`,
    detail:
      `Por eso en Cowork ${ambos ? "no se te ve ni se te escucha" : TIPOS[primero].falla}.\n\n` +
      `Toca «Abrir Configuración» y prende todo en esa página: ${TIPOS[primero].acceso} y ` +
      "«Permitir que las aplicaciones de escritorio accedan» (o Maven, si sale en la lista).\n" +
      (ambos ? "Haz lo mismo en Micrófono, en la misma lista de Privacidad y seguridad.\n" : "") +
      "\nDespués sal de la sala de Cowork y vuelve a entrar.",
    buttons: ["Abrir Configuración", "Ahora no"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  try {
    const { response } =
      ventana && !ventana.isDestroyed()
        ? await dialog.showMessageBox(ventana, opciones)
        : await dialog.showMessageBox(opciones);
    if (response === 0) shell.openExternal(TIPOS[primero].ajuste);
  } catch {
    // sin ventana o el diálogo no abrió: no se insiste
  }
}

module.exports = { apagadoEnWindows, revisarCamaraYMicrofono };
