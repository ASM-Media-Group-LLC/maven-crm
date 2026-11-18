// LA APP RECUERDA TU CORREO Y TU CONTRASEÑA (Alvaro, 18/11/2026: «que el app
// recuerde tu login y password»).
//
// La app de computador no trae el gestor de contraseñas de Chrome: cada vez que
// la sesión se cerraba había que escribir todo de nuevo. Ahora, al entrar a
// Maven desde la app, el correo y la contraseña quedan guardados EN ESTE
// EQUIPO y la pantalla de entrada los trae puestos.
//
// La contraseña se cifra con el llavero del sistema (safeStorage: el Llavero en
// Mac, DPAPI en Windows): solo esta app, en esta cuenta del computador, la puede
// leer. Nunca sale del equipo ni va a Maven. Si el sistema no ofrece cifrado
// de verdad (un Linux sin llavero), no se guarda la contraseña: solo el correo.
// «Olvidar mi contraseña en este equipo», en el menú de la barra, la borra.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const archivo = () => path.join(app.getPath("userData"), "acceso.json");

function cifradoDeVerdad() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // En Linux sin llavero, safeStorage «cifra» con una clave fija: no sirve.
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text") return false;
    return true;
  } catch {
    return false;
  }
}

const correoValido = (c) => typeof c === "string" && c.length > 3 && c.length <= 320 && c.includes("@");
const claveValida = (k) => typeof k === "string" && k.length > 0 && k.length <= 1024;

/** Guarda el acceso tras entrar bien. true si quedó guardado. */
function guardarAcceso(correo, clave) {
  if (!correoValido(correo)) return false;
  const datos = { correo: correo.trim() };
  if (claveValida(clave) && cifradoDeVerdad()) {
    try {
      datos.clave = safeStorage.encryptString(clave).toString("base64");
    } catch {
      // sin llavero: queda solo el correo
    }
  }
  try {
    fs.writeFileSync(archivo(), JSON.stringify(datos), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** Lo guardado: { correo, clave } (clave "" si no hay o no se pudo leer), o null. */
function leerAcceso() {
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(archivo(), "utf8"));
  } catch {
    return null;
  }
  if (!datos || !correoValido(datos.correo)) return null;
  let clave = "";
  if (typeof datos.clave === "string" && cifradoDeVerdad()) {
    try {
      clave = safeStorage.decryptString(Buffer.from(datos.clave, "base64"));
    } catch {
      clave = ""; // otra cuenta del equipo u otro llavero: se escribe de nuevo
    }
  }
  return { correo: datos.correo, clave };
}

function hayAccesoGuardado() {
  return fs.existsSync(archivo());
}

/** Borra el correo y la contraseña guardados en este equipo. */
function olvidarAcceso() {
  try {
    fs.rmSync(archivo(), { force: true });
  } catch {
    // ya no estaba
  }
  return true;
}

module.exports = { guardarAcceso, leerAcceso, olvidarAcceso, hayAccesoGuardado };
