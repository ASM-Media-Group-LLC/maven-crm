// MAVEN PARA EL COMPUTADOR (Mac y Windows).
//
// Es una «cáscara»: la ventana abre app.maven-ai.me tal cual. Todo lo que se
// sube a producción le llega solo, sin publicar versión nueva de la app. Lo
// que la cáscara agrega (Alvaro, 17/11/2026):
//   - Abre sola al prender el computador.
//   - La X no la cierra: queda en la barra junto al reloj y sigue en Cowork y
//     recibiendo avisos. Para salir: menú de la barra → Salir.
//   - El número de chats sin leer en el ícono (Dock en Mac, barra en Windows).
//   - Un atajo para traerla al frente desde cualquier lado: Ctrl+Alt+M.
//   - Compartir pantalla con selector propio (pantallas y ventanas).
//   - Sigue corriendo a toda velocidad aunque esté escondida (llamadas, Argos).
// Versión 2 (17/11/2026):
//   - Sin barra de título: Maven ocupa toda la ventana en azul marino, con los
//     botones del sistema encima (como Slack o Granola).
//   - Se actualiza sola (actualizar.js).
//   - Llamada entrante en una ventanita encima de todo (llamada.js).
//   - Ventanita flotante: Maven chico y siempre encima (Ctrl+Alt+F).
//   - Argos: inactividad de todo el computador y app/página al frente (apps.js).

const {
  app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, session,
  globalShortcut, desktopCapturer, systemPreferences,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { iniciarActualizaciones } = require("./actualizar");
const { avisarLlamada, cerrarAvisoLlamada } = require("./llamada");
const { iniciarVigiaDeApps, segundosInactivo } = require("./apps");
const { pantallaPermitida, primeraVezSinPermiso, guiaPermisoPantalla, pedirPermisoSiToca, pedirAMacOS } = require("./permisoPantalla");
const { revisarCamaraYMicrofono } = require("./permisoCamaraWindows");
const { guardarAcceso, leerAcceso, olvidarAcceso, hayAccesoGuardado } = require("./acceso");
const { vigilarVentana, leerYBorrarCierres } = require("./recuperarse");
const { esLlamada, prepararVentanaDeLlamada, mostrarVentana } = require("./ventanaDeLlamada");

const URL_MAVEN = process.env.MAVEN_URL || "https://app.maven-ai.me/login";
const ORIGENES_MAVEN = new Set(["https://app.maven-ai.me", "https://maven-ai.me", "https://www.maven-ai.me"]);
const ATAJO = "Control+Alt+M";
const ATAJO_FLOTANTE = "Control+Alt+F";
const esMac = process.platform === "darwin";

let ventana = null;
let bandeja = null;
const estado = require("./estado"); // estado.saliendo: true = cerrar de verdad
let sinLeer = 0;
let buscarActualizacion = () => {}; // lo pone iniciarActualizaciones al arrancar

const esDeMaven = (url) => {
  try {
    const u = new URL(url);
    return ORIGENES_MAVEN.has(u.origin) || new URL(URL_MAVEN).origin === u.origin;
  } catch {
    return false;
  }
};

// ── Preferencias (un json en la carpeta de datos de la app) ─────────────────
const archivoAjustes = () => path.join(app.getPath("userData"), "ajustes.json");
function leerAjustes() {
  try { return JSON.parse(fs.readFileSync(archivoAjustes(), "utf8")); } catch { return {}; }
}
function guardarAjustes(a) {
  try { fs.writeFileSync(archivoAjustes(), JSON.stringify(a, null, 2)); } catch { /* sin disco: se pierde y ya */ }
}

function abrirAlPrender(si) {
  app.setLoginItemSettings({ openAtLogin: si });
  guardarAjustes({ ...leerAjustes(), abrirAlPrender: si });
}

// ── Una sola copia abierta ───────────────────────────────────────────────────
// Probándola desde el código usa su propia carpeta: no choca con la app instalada.
if (!app.isPackaged) app.setPath("userData", path.join(app.getPath("appData"), "Maven (pruebas)"));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // En Windows un link maven:// abre otra copia con el link en argv: esta lo recibe.
  app.on("second-instance", (_e, argv) => {
    const enlace = (argv || []).find((a) => typeof a === "string" && a.startsWith(`${PROTOCOLO}://`));
    if (enlace) abrirEnlace(enlace);
    else mostrar();
  });
}

// ── Los links de Maven abren en la app (Alvaro, 17/11/2026: «que me abran la
// aplicación cuando lo quiero abrir, no en el navegador») ─────────────────────
// La página, en el navegador, ofrece «Abrir en la app» con maven://abrir?ruta=/…
// El sistema se lo pasa a la app: en Mac por «open-url», en Windows por argv.
const PROTOCOLO = "maven";
let enlacePendiente = null;

/** maven://abrir?ruta=/call/x → https://app.maven-ai.me/call/x. Solo rutas de Maven. */
function destinoDeEnlace(enlace) {
  try {
    const u = new URL(enlace);
    if (u.protocol !== `${PROTOCOLO}:`) return null;
    const ruta = u.searchParams.get("ruta") || "/";
    if (!ruta.startsWith("/") || ruta.startsWith("//")) return null;
    const destino = new URL(ruta, "https://app.maven-ai.me");
    return destino.origin === "https://app.maven-ai.me" ? destino : null;
  } catch {
    return null;
  }
}

function abrirEnlace(enlace) {
  const destino = destinoDeEnlace(enlace);
  if (!destino) return mostrar();
  if (!ventana) {
    enlacePendiente = destino.href;
    if (app.isReady()) crearVentana();
    return;
  }
  // Si Maven ya está cargado, la ruta se abre ADENTRO (sin recargar): una
  // llamada o un Cowork en curso no se cortan.
  const actual = ventana.webContents.getURL();
  if (actual.startsWith("https://app.maven-ai.me/")) {
    ventana.webContents.send("maven:abrir-ruta", destino.pathname + destino.search + destino.hash);
  } else {
    ventana.loadURL(destino.href);
  }
  mostrar();
}

app.on("open-url", (e, enlace) => {
  e.preventDefault();
  if (app.isReady()) abrirEnlace(enlace);
  else { const d = destinoDeEnlace(enlace); if (d) enlacePendiente = d.href; }
});
if (process.platform === "win32") {
  const enlace = process.argv.find((a) => typeof a === "string" && a.startsWith(`${PROTOCOLO}://`));
  const d = enlace ? destinoDeEnlace(enlace) : null;
  if (d) enlacePendiente = d.href;
}

function mostrar() {
  if (!ventana) return crearVentana();
  if (ventana.isMinimized()) ventana.restore();
  ventana.show();
  ventana.focus();
}

// ── La ventana ───────────────────────────────────────────────────────────────
function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    title: "Maven",
    backgroundColor: "#101827",
    icon: path.join(__dirname, "..", "build", "bandeja.png"),
    show: false,
    // Sin la barra blanca del sistema: la página llega hasta arriba y los
    // botones de cerrar/minimizar quedan encima, sobre el azul marino. La
    // página marca su barra de arriba como «arrastrable» (clase en-escritorio).
    ...(esMac
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 18 } }
      : { titleBarStyle: "hidden", titleBarOverlay: { color: "#101827", symbolColor: "#c9d1e0", height: 44 } }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // Escondida en la barra tiene que seguir igual de viva: llamadas, Cowork,
      // Argos y avisos. Sin esto Chromium la frena al minimizarla.
      backgroundThrottling: false,
    },
  });

  ventana.once("ready-to-show", () => ventana.show());

  // MÁS LIVIANA (Alvaro, 18/11/2026). Con backgroundThrottling apagado la
  // página cree que siempre está a la vista (document.visibilityState queda en
  // "visible" aunque la ventana esté minimizada o escondida en la barra), así
  // que seguía decodificando la cámara de cada compañero todo el día. Se le
  // avisa a la página cuándo de verdad nadie la ve, y ella pausa ese video
  // (frontend/src/lib/videoEscondido.ts). La llamada, el audio y Argos siguen.
  const avisarVisibilidad = () => {
    if (!ventana || ventana.isDestroyed()) return;
    ventana.webContents.send("maven:visible", ventana.isVisible() && !ventana.isMinimized());
  };
  for (const ev of ["minimize", "restore", "hide", "show"]) ventana.on(ev, avisarVisibilidad);

  // La X esconde; solo «Salir» (o Cmd+Q) cierra de verdad.
  ventana.on("close", (e) => {
    if (estado.saliendo) return;
    e.preventDefault();
    ventana.hide();
  });
  ventana.on("closed", () => { ventana = null; });
  // Si la página se cuelga o se queda en blanco, Maven vuelve sola (recuperarse.js).
  // Vuelve a donde estaba (Cowork, Messenger…); si no se sabe, al inicio.
  vigilarVentana(ventana, () => {
    const wc = ventana?.webContents;
    if (!wc) return;
    const donde = wc.getURL();
    if (donde && esDeMaven(donde)) wc.reload();
    else wc.loadURL(URL_MAVEN).catch(() => {});
  });

  // Lo de Maven se queda adentro; cualquier otro link abre en el navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (esDeMaven(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          backgroundColor: "#101827",
          webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
        },
      };
    }
    if (/^https?:|^mailto:|^tel:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // La ventana de una llamada no se esconde detrás de Maven: al perder el foco
  // se achica a una ventanita siempre encima (ventanaDeLlamada.js, 18/11/2026).
  ventana.webContents.on("did-create-window", (hija, { url }) => {
    if (esDeMaven(url) && esLlamada(url)) prepararVentanaDeLlamada(hija);
  });
  ventana.webContents.on("will-navigate", (e, url) => {
    if (!esDeMaven(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Clic derecho: cortar, copiar, pegar y la ortografía.
  ventana.webContents.on("context-menu", (_e, p) => {
    const items = [];
    for (const s of p.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: s, click: () => ventana.webContents.replaceMisspelling(s) });
    }
    if (p.misspelledWord) items.push({ type: "separator" });
    if (p.linkURL) {
      items.push({ label: "Copiar enlace", click: () => require("electron").clipboard.writeText(p.linkURL) });
      items.push({ type: "separator" });
    }
    if (p.isEditable) items.push({ role: "cut", label: "Cortar" });
    if (p.selectionText || p.isEditable) items.push({ role: "copy", label: "Copiar" });
    if (p.isEditable) items.push({ role: "paste", label: "Pegar" }, { role: "selectAll", label: "Seleccionar todo" });
    if (p.mediaType === "image") items.push({ label: "Copiar imagen", click: () => ventana.webContents.copyImageAt(p.x, p.y) });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  ventana.webContents.setUserAgent(`${ventana.webContents.getUserAgent()} MavenEscritorio/${app.getVersion()}`);
  ventana.loadURL(enlacePendiente || URL_MAVEN);
  enlacePendiente = null;

  // Prueba desde el código: MAVEN_CAPTURA=/ruta.png guarda cómo se ve y cierra.
  if (!app.isPackaged && process.env.MAVEN_CAPTURA) {
    ventana.webContents.once("did-finish-load", () => setTimeout(async () => {
      fs.writeFileSync(process.env.MAVEN_CAPTURA, (await ventana.capturePage()).toPNG());
      estado.saliendo = true;
      app.quit();
    }, 6000));
  }
}

// ── Permisos: cámara, micrófono, avisos, pantalla completa… solo para Maven ──
// Cowork le avisa a la app que comparta la pantalla completa sin preguntar
// (Alvaro, 17/11/2026): así se puede volver a compartir sola tras una caída.
let pantallaAutomatica = false;
ipcMain.on("maven:pantalla-auto", (e, si) => {
  if (esDeMaven(e.sender.getURL())) pantallaAutomatica = Boolean(si);
});

function configurarPermisos() {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((wc, permiso, responder) => {
    const deMaven = esDeMaven(wc.getURL());
    responder(deMaven);
    // Windows no pregunta: si tiene apagada la cámara o el micrófono para las
    // apps, Cowork se quedaba sin imagen o sin voz sin avisar. Aquí se explica.
    if (deMaven && permiso === "media") revisarCamaraYMicrofono(ventana);
  });
  s.setPermissionCheckHandler((_wc, _permiso, origen) => esDeMaven(origen || ""));
  s.setSpellCheckerLanguages(["es", "en-US"].filter((l) => s.availableSpellCheckerLanguages.includes(l)));

  // Compartir pantalla: Maven pide getDisplayMedia y acá se elige qué compartir.
  s.setDisplayMediaRequestHandler(async (pedido, responder) => {
    try {
      // Mac sin «Grabación de pantalla»: Maven explica cómo arreglarlo en el
      // mismo clic (antes el primer intento fallaba mudo) y, una vez por
      // arranque, deja que macOS muestre su propio aviso. Nunca se insiste más
      // de una vez cada 10 minutos (Cowork vuelve a pedir la pantalla sola).
      if (!pantallaPermitida()) {
        if (primeraVezSinPermiso()) {
          await pedirAMacOS(); // pone a Maven en la lista de Ajustes con su aviso
          await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
        }
        guiaPermisoPantalla(ventana);
        return responder({});
      }
      // Cowork (la página prendió pantallaAutomatica): la pantalla principal,
      // sin la ventanita para elegir.
      if (pantallaAutomatica && esDeMaven(pedido.securityOrigin || pedido.frame?.url || "")) {
        const pantallas = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
        const principal = String(require("electron").screen.getPrimaryDisplay().id);
        const pantalla = pantallas.find((f) => f.display_id === principal) || pantallas[0];
        if (pantalla) {
          return responder({ video: pantalla, ...(pedido.audioRequested && !esMac ? { audio: "loopback" } : {}) });
        }
      }
      const fuentes = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 200 },
        fetchWindowIcons: false,
      });
      const elegida = await elegirFuente(fuentes);
      if (!elegida) return responder({});
      // En Windows se puede mandar también el sonido del computador.
      responder({ video: elegida, ...(pedido.audioRequested && !esMac ? { audio: "loopback" } : {}) });
    } catch {
      responder({});
    }
  });
}

// Ventanita para elegir pantalla o ventana (como la de Chrome).
function elegirFuente(fuentes) {
  return new Promise((resolver) => {
    const selector = new BrowserWindow({
      parent: ventana ?? undefined,
      modal: true,
      width: 760,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Compartir pantalla",
      backgroundColor: "#101827",
      show: false,
      webPreferences: { preload: path.join(__dirname, "selector-preload.js"), contextIsolation: true, sandbox: true },
    });
    let listo = false;
    const terminar = (id) => {
      if (listo) return;
      listo = true;
      ipcMain.removeHandler("selector:fuentes");
      ipcMain.removeAllListeners("selector:elegir");
      resolver(id ? fuentes.find((f) => f.id === id) : null);
      if (!selector.isDestroyed()) selector.close();
    };
    ipcMain.handle("selector:fuentes", () =>
      fuentes.map((f) => ({ id: f.id, nombre: f.name, pantalla: f.id.startsWith("screen:"), imagen: f.thumbnail.toDataURL() })),
    );
    ipcMain.on("selector:elegir", (_e, id) => terminar(id));
    selector.on("closed", () => terminar(null));
    selector.once("ready-to-show", () => selector.show());
    selector.setMenuBarVisibility(false);
    selector.loadFile(path.join(__dirname, "selector.html"));
  });
}

// ── Ventanita flotante ───────────────────────────────────────────────────────
// Maven se achica a una ventana chica, siempre encima, abajo a la derecha:
// sigues viendo Cowork o la llamada mientras trabajas en otra app. Se entra y
// sale con Ctrl+Alt+F, desde el menú de la barra o desde la página.
let antesDeFlotar = null;
function flotante(si = !antesDeFlotar) {
  if (!ventana) return false;
  const { screen } = require("electron");
  if (si && !antesDeFlotar) {
    antesDeFlotar = { bounds: ventana.getBounds(), maximizada: ventana.isMaximized() };
    if (ventana.isFullScreen()) ventana.setFullScreen(false);
    if (ventana.isMaximized()) ventana.unmaximize();
    const area = screen.getDisplayMatching(ventana.getBounds()).workArea;
    const ancho = 480, alto = 320;
    ventana.setMinimumSize(320, 220);
    ventana.setBounds({ x: area.x + area.width - ancho - 20, y: area.y + area.height - alto - 20, width: ancho, height: alto }, true);
    ventana.setAlwaysOnTop(true, "floating");
    ventana.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    ventana.show();
  } else if (!si && antesDeFlotar) {
    ventana.setAlwaysOnTop(false);
    ventana.setVisibleOnAllWorkspaces(false);
    ventana.setMinimumSize(960, 620);
    ventana.setBounds(antesDeFlotar.bounds, true);
    if (antesDeFlotar.maximizada) ventana.maximize();
    antesDeFlotar = null;
    ventana.focus();
  }
  ventana.webContents.send("maven:flotante", Boolean(antesDeFlotar));
  armarMenuBandeja();
  return Boolean(antesDeFlotar);
}

// ── Lo que la página le pide a la app (preload.js) ──────────────────────────
const deLaVentana = (e) => ventana && e.sender === ventana.webContents;
// «Volver a la llamada» (la barra de Maven): la ventana de la llamada se trae al
// frente. Solo una ventana de llamada de Maven puede pedirlo para sí misma.
ipcMain.handle("maven:mostrar-esta-ventana", (e) => {
  const url = e.sender.getURL();
  if (!esDeMaven(url) || !esLlamada(url)) return false;
  return mostrarVentana(BrowserWindow.fromWebContents(e.sender));
});
ipcMain.handle("maven:flotante", (e, si) => (deLaVentana(e) ? flotante(si === undefined ? undefined : Boolean(si)) : false));
ipcMain.handle("maven:inactividad", (e) => (deLaVentana(e) ? segundosInactivo() : null));
// El correo y la contraseña guardados en este equipo (acceso.js). Solo la
// ventana de Maven: leerlos, únicamente en su pantalla de entrada; guardarlos,
// desde Maven (al entrar, la página ya puede ir camino al inicio).
const enLaEntradaDeMaven = (e) => {
  if (!deLaVentana(e)) return false;
  const url = e.sender.getURL();
  try { return esDeMaven(url) && new URL(url).pathname.startsWith("/login"); } catch { return false; }
};
ipcMain.handle("maven:acceso-leer", (e) => (enLaEntradaDeMaven(e) ? leerAcceso() : null));
ipcMain.handle("maven:acceso-guardar", (e, correo, clave) => {
  if (!deLaVentana(e) || !esDeMaven(e.sender.getURL())) return false;
  const ok = guardarAcceso(correo, clave);
  armarMenuBandeja();
  return ok;
});
// Cuánta memoria usa la app y cuánta tiene el equipo (17/11/2026: el equipo usa
// Windows de 8 GB o menos). Va en la salud de las llamadas para ver quién sufre.
// Y desde el 18/11/2026 también el procesador, para el medidor de la app
// (cuánto del procesador usa todo el computador y cuánto Maven).
let cpuPrevio = null;
function cpuDelEquipo() {
  const t = require("os").cpus().reduce((a, c) => {
    const total = Object.values(c.times).reduce((x, y) => x + y, 0);
    return { total: a.total + total, libre: a.libre + c.times.idle };
  }, { total: 0, libre: 0 });
  const antes = cpuPrevio;
  cpuPrevio = t;
  if (!antes || t.total <= antes.total) return null;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - (t.libre - antes.libre) / (t.total - antes.total)))));
}
ipcMain.handle("maven:memoria", (e) => {
  if (!deLaVentana(e)) return null;
  const metricas = app.getAppMetrics();
  const kb = metricas.reduce((t, m) => t + (m.memory?.workingSetSize ?? 0), 0);
  const nucleos = Math.max(1, require("os").cpus().length);
  const cpuApp = metricas.reduce((t, m) => t + (m.cpu?.percentCPUUsage ?? 0), 0) / nucleos;
  const gb = (b) => Math.round((b / 1024 ** 3) * 10) / 10;
  return {
    app_mb: Math.round(kb / 1024), equipo_gb: gb(require("os").totalmem()), libre_gb: gb(require("os").freemem()),
    cpu_equipo_pct: cpuDelEquipo(), cpu_app_pct: Math.round(cpuApp),
  };
});
ipcMain.handle("maven:ultimo-cierre", (e) => (deLaVentana(e) ? leerYBorrarCierres() : []));
ipcMain.handle("maven:llamada", (e, datos) => (deLaVentana(e) ? avisarLlamada(datos, () => mostrar()) : "cerrada"));
ipcMain.on("maven:llamada-fin", (e, id) => { if (deLaVentana(e)) cerrarAvisoLlamada(id); });

// ── El número de chats sin leer ──────────────────────────────────────────────
let insigniaPuesta = false;
ipcMain.on("maven:insignia", (_e, n, dibujo) => {
  // El chat lo manda en cada cambio de conversaciones, aunque el número sea el
  // mismo: si no cambió, no se vuelve a leer disco ni rearmar el menú (8 h de uso).
  const nuevo = Math.max(0, Number(n) || 0);
  if (nuevo === sinLeer && insigniaPuesta) return;
  insigniaPuesta = true;
  sinLeer = nuevo;
  if (esMac) {
    app.dock?.setBadge(sinLeer > 0 ? String(sinLeer > 99 ? "99+" : sinLeer) : "");
  } else if (ventana) {
    ventana.setOverlayIcon(sinLeer > 0 && dibujo ? nativeImage.createFromDataURL(dibujo) : null, sinLeer > 0 ? `${sinLeer} sin leer` : "");
  }
  if (!esMac) app.setBadgeCount(sinLeer); // Linux/Unity; en Windows no hace nada
  if (bandeja) bandeja.setToolTip(sinLeer > 0 ? `Maven — ${sinLeer} sin leer` : "Maven");
  armarMenuBandeja();
});

// ── La barra junto al reloj ──────────────────────────────────────────────────
function crearBandeja() {
  let img = nativeImage.createFromPath(path.join(__dirname, "..", "build", "bandeja.png"));
  img = img.resize({ width: esMac ? 18 : 16, height: esMac ? 18 : 16 });
  bandeja = new Tray(img);
  bandeja.setToolTip("Maven");
  bandeja.on("click", () => mostrar());
  armarMenuBandeja();
}

function armarMenuBandeja() {
  if (!bandeja) return;
  const ajustes = leerAjustes();
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: sinLeer > 0 ? `Abrir Maven (${sinLeer} sin leer)` : "Abrir Maven", click: () => mostrar() },
    { label: antesDeFlotar ? "Volver al tamaño normal" : "Ventanita flotante", click: () => flotante() },
    { label: `Atajos: ${esMac ? "Control+Option+M abrir · Control+Option+F flotante" : "Ctrl+Alt+M abrir · Ctrl+Alt+F flotante"}`, enabled: false },
    { type: "separator" },
    {
      label: "Abrir al prender el computador",
      type: "checkbox",
      checked: ajustes.abrirAlPrender !== false,
      click: (item) => abrirAlPrender(item.checked),
    },
    { label: `Buscar actualización (versión ${app.getVersion()})`, click: () => buscarActualizacion(true) },
    ...(hayAccesoGuardado()
      ? [{ label: "Olvidar mi contraseña en este equipo", click: () => { olvidarAcceso(); armarMenuBandeja(); } }]
      : []),
    { type: "separator" },
    { label: "Salir de Maven", click: () => { estado.saliendo = true; app.quit(); } },
  ]));
}

// ── Menú de arriba (en Mac hace falta para que Cmd+C / Cmd+V funcionen) ────
function crearMenu() {
  const plantilla = [
    ...(esMac ? [{
      label: "Maven",
      submenu: [
        { role: "about", label: "Acerca de Maven" },
        { label: "Buscar actualización…", click: () => buscarActualizacion(true) },
        { type: "separator" },
        { role: "hide", label: "Ocultar Maven" },
        { role: "hideOthers", label: "Ocultar otros" },
        { type: "separator" },
        { label: "Salir de Maven", accelerator: "Cmd+Q", click: () => { estado.saliendo = true; app.quit(); } },
      ],
    }] : []),
    {
      label: "Edición",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload", label: "Recargar" },
        { type: "separator" },
        { role: "resetZoom", label: "Tamaño real" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        { role: "toggleDevTools", label: "Herramientas de desarrollo", visible: false },
      ],
    },
    { role: "windowMenu", label: "Ventana" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ── Arranque ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId("me.maven-ai.escritorio"); // avisos con nombre en Windows
  // maven:// abre esta app (solo la instalada: probando desde el código no se registra).
  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOLO);

  // La primera vez queda puesta para abrir al prender (Alvaro lo pidió así).
  // (Solo en la app instalada: probarla desde el código no toca el computador.)
  const ajustes = leerAjustes();
  if (app.isPackaged && ajustes.abrirAlPrender === undefined) abrirAlPrender(true);

  // En Mac, pedir cámara y micrófono de entrada (si no, Cowork pregunta tarde).
  if (esMac) {
    systemPreferences.askForMediaAccess("camera").catch(() => {});
    systemPreferences.askForMediaAccess("microphone").catch(() => {});
  }

  configurarPermisos();
  ipcMain.handle("maven:visible", () => !ventana || (ventana.isVisible() && !ventana.isMinimized()));
  crearMenu();
  crearVentana();
  // Tras «Arreglar ahora» del permiso de pantalla: macOS vuelve a preguntar.
  ventana?.webContents.once("did-finish-load", () => pedirPermisoSiToca());
  crearBandeja();
  globalShortcut.register(ATAJO, () => {
    if (ventana && ventana.isVisible() && ventana.isFocused()) ventana.hide();
    else mostrar();
  });
  globalShortcut.register(ATAJO_FLOTANTE, () => flotante());
  buscarActualizacion = iniciarActualizaciones(() => ventana);
  iniciarVigiaDeApps((lote) => {
    if (ventana && !ventana.isDestroyed()) ventana.webContents.send("maven:apps", lote);
  });
});

app.on("activate", () => mostrar()); // clic en el Dock
app.on("before-quit", () => { estado.saliendo = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { /* sigue viva en la barra */ });
