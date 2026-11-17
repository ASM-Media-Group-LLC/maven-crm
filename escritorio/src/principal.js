'use strict';

// MAVEN DE ESCRITORIO (Windows y Mac).
//
// Por qué existe (Alvaro, 17/11/2026): el 70 % de las llamadas que se caen se
// caen con la pestaña de Chrome escondida. Chrome duerme los relojes y las
// conexiones de las pestañas ocultas, y en computadores no muy fuertes lo hace
// antes y más fuerte. Esta app abre la MISMA Maven de producción
// (https://app.maven-ai.me), sin reescribir nada, pero en una ventana propia
// que no se duerme en segundo plano:
//
//   · backgroundThrottling: false + los interruptores de Chromium de abajo:
//     los relojes y la conexión siguen a ritmo normal aunque la ventana esté
//     minimizada o tapada por otra app.
//   · Mientras haya cámara, micrófono o llamada abiertos, se le pide al sistema
//     que no suspenda la app (powerSaveBlocker 'prevent-app-suspension').
//   · Cámara, micrófono, pantalla y avisos concedidos SOLO a app.maven-ai.me.
//   · Compartir pantalla con un selector propio (pantallas y ventanas).
//   · Solo se navega dentro de *.maven-ai.me; lo demás se abre en el navegador.
//   · La sesión queda guardada (no hay que entrar cada vez) y hay un solo
//     ejemplar abierto.
//
// La página no recibe nada de Node: contextIsolation, sandbox y sin
// nodeIntegration. El único preload es el del selector de pantalla, que es una
// página local nuestra.

const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  powerSaveBlocker,
  screen,
  session,
  shell,
  systemPreferences,
  webContents: todosLosContenidos,
} = require('electron');
const { ORIGEN_APP, destinoDeNavegacion, destinoDeVentanaNueva, tienePermisos } = require('./origenes');
const { elegirTextos } = require('./textos');

const ES_MAC = process.platform === 'darwin';
const ES_WINDOWS = process.platform === 'win32';

// Para probar contra un servidor local o de pruebas, SOLO sin empaquetar:
//   MAVEN_URL=http://localhost:8080 npm run iniciar
const URL_DEV = !app.isPackaged && process.env.MAVEN_URL ? process.env.MAVEN_URL : null;
const URL_INICIO = URL_DEV || `${ORIGEN_APP}/`;
const EXTRAS = URL_DEV ? [new URL(URL_DEV).origin] : [];

const ICONO = path.join(__dirname, '..', 'recursos', 'icono.png');
const PAGINA_SELECTOR = path.join(__dirname, 'selector', 'selector.html');
const PRELOAD_SELECTOR = path.join(__dirname, 'selector', 'preload.js');
const PAGINA_SIN_CONEXION = path.join(__dirname, 'sin-conexion', 'sin-conexion.html');
const FONDO = '#0c121d'; // el azul marino de Maven: lo que se ve mientras carga

/** Lo que la página puede pedir (y solo app.maven-ai.me). Todo lo demás se niega. */
const PERMISOS = new Set([
  'media', // cámara y micrófono
  'display-capture',
  'notifications',
  'fullscreen',
  'clipboard-read',
  'clipboard-sanitized-write',
  'screen-wake-lock',
  'speaker-selection',
  'persistent-storage',
]);

// ── Que no se duerma ─────────────────────────────────────────────────────────
// Tienen que ir ANTES de que arranque Chromium (antes de `ready`).
//   · disable-renderer-backgrounding: no baja la prioridad de la página oculta.
//   · disable-background-timer-throttling: los relojes no se espacian.
//   · disable-backgrounding-occluded-windows: tapada por otra ventana = visible.
//   · IntensiveWakeUpThrottling: Chrome junta los relojes a 1 por minuto tras 5
//     min oculta; justo lo que mataba el pulso de la llamada.
//   · CalculateNativeWinOcclusion: Windows marcaba como oculta la ventana tapada.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'IntensiveWakeUpThrottling,CalculateNativeWinOcclusion');

// Windows agrupa la ventana y muestra los avisos con este id (el mismo appId
// del instalador).
if (ES_WINDOWS) app.setAppUserModelId('me.maven-ai.escritorio');

let textos = elegirTextos('es');
let ventanaPrincipal = null;

// ── Un solo ejemplar ─────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) {
      ventanaPrincipal = crearVentanaPrincipal();
      return;
    }
    if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
    ventanaPrincipal.show();
    ventanaPrincipal.focus();
  });

  app.whenReady().then(arrancar);
}

function arrancar() {
  textos = elegirTextos(app.getLocale());
  app.setAboutPanelOptions({
    applicationName: 'Maven',
    applicationVersion: app.getVersion(),
    copyright: '© ASM Media Group LLC',
  });

  configurarSesion(session.defaultSession);
  Menu.setApplicationMenu(armarMenu());
  ventanaPrincipal = crearVentanaPrincipal();
  vigilarLlamadas();

  app.on('activate', () => {
    // Mac: clic en el ícono del Dock sin ventanas abiertas.
    if (BrowserWindow.getAllWindows().length === 0) ventanaPrincipal = crearVentanaPrincipal();
  });
}

app.on('window-all-closed', () => {
  if (!ES_MAC) app.quit();
});

// ── Ventanas ─────────────────────────────────────────────────────────────────

/** Las preferencias de TODAS las ventanas que muestran Maven. */
function preferenciasSeguras(extra = {}) {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    backgroundThrottling: false,
    spellcheck: true,
    ...extra,
  };
}

function crearVentanaPrincipal() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1440, Math.round(width * 0.9)),
    height: Math.min(960, Math.round(height * 0.9)),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Maven',
    backgroundColor: FONDO,
    icon: ES_MAC ? undefined : ICONO,
    autoHideMenuBar: !ES_MAC,
    webPreferences: preferenciasSeguras(),
  });
  // Se muestra al pintar; si internet va lento, igual aparece a los 3 s.
  const mostrar = () => { if (!win.isDestroyed() && !win.isVisible()) win.show(); };
  win.once('ready-to-show', mostrar);
  setTimeout(mostrar, 3000);
  win.on('closed', () => { if (ventanaPrincipal === win) ventanaPrincipal = null; });
  // Si falla (sin internet), lo atiende did-fail-load con la página sin conexión.
  win.loadURL(URL_INICIO).catch(() => {});
  return win;
}

// Reglas para CUALQUIER contenido web que se cree (ventana principal, la de la
// llamada, el selector, la página sin conexión).
app.on('web-contents-created', (_evento, contenido) => {
  contenido.on('will-attach-webview', (e) => e.preventDefault());
  contenido.setWindowOpenHandler((detalles) => abrirVentanaNueva(detalles));
  contenido.on('will-navigate', (e) => vigilarNavegacion(contenido, e, e.url));
  contenido.on('will-redirect', (e) => { if (e.isMainFrame) vigilarNavegacion(contenido, e, e.url); });
  contenido.on('will-prevent-unload', (e) => preguntarAntesDeSalir(contenido, e));
  contenido.on('context-menu', (_e, params) => menuContextual(contenido, params));
  contenido.on('render-process-gone', (_e, detalles) => revivir(contenido, detalles));
  contenido.on('did-fail-load', (_e, codigo, _descripcion, url, esPrincipal) => {
    // -3 = cancelada (la cancela la regla de navegación o la misma página).
    if (!esPrincipal || codigo === -3) return;
    if (destinoDeNavegacion(url, EXTRAS) !== 'maven') return;
    const t = textos.sinConexion;
    contenido
      .loadFile(PAGINA_SIN_CONEXION, {
        query: { volver: url, titulo: t.titulo, detalle: t.detalle, reintentar: t.reintentar },
      })
      .catch(() => {});
  });
  contenido.on('media-started-playing', revisarLlamadaPronto);
  contenido.on('media-paused', revisarLlamadaPronto);
});

/** Solo Maven se queda dentro; lo demás va al navegador del sistema o se bloquea. */
function vigilarNavegacion(contenido, evento, url) {
  const destino = destinoDeNavegacion(url, EXTRAS);
  if (destino === 'maven') return;
  evento.preventDefault();
  if (destino === 'externo') abrirAfuera(url);
  // Una ventana que se abrió en blanco para llevarla afuera (la vista previa
  // del Drive): ya se abrió en el navegador, la ventana vacía sobra.
  const actual = contenido.getURL();
  if (!actual || actual === 'about:blank') {
    const win = BrowserWindow.fromWebContents(contenido);
    if (win && win !== ventanaPrincipal) win.close();
  }
}

/** window.open y enlaces con target="_blank". */
function abrirVentanaNueva({ url, features }) {
  const destino = destinoDeVentanaNueva(url, EXTRAS);
  if (destino === 'dentro') {
    // Si la página pidió un tamaño (imprimir un cobro), se respeta.
    const pidioTamano = /\b(width|height)=/.test(features || '');
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...(pidioTamano ? {} : { width: 1100, height: 760 }),
        minWidth: 400,
        minHeight: 300,
        backgroundColor: FONDO,
        icon: ES_MAC ? undefined : ICONO,
        autoHideMenuBar: !ES_MAC,
        webPreferences: preferenciasSeguras(),
      },
    };
  }
  if (destino === 'externo') abrirAfuera(url);
  return { action: 'deny' };
}

function abrirAfuera(url) {
  // destinoDeNavegacion ya filtró a http, https, mailto y tel.
  shell.openExternal(url).catch((err) => console.error('[maven] no se pudo abrir afuera:', err));
}

/** La página tiene un `beforeunload` (llamada, subida, correo a medio
 *  escribir). Electron no muestra nada por sí solo: sin esto, la ventana
 *  simplemente no se cerraba. Se pregunta como lo haría Chrome. */
function preguntarAntesDeSalir(contenido, evento) {
  const win = BrowserWindow.fromWebContents(contenido);
  const opciones = {
    type: 'question',
    buttons: [textos.salir, textos.quedarme],
    defaultId: 1,
    cancelId: 1,
    title: 'Maven',
    message: textos.salirTitulo,
    detail: textos.salirDetalle,
  };
  const eleccion = win ? dialog.showMessageBoxSync(win, opciones) : dialog.showMessageBoxSync(opciones);
  if (eleccion === 0) evento.preventDefault(); // preventDefault = salir igual
}

/** Si la página se cae (falta de memoria, error del motor), se recarga sola,
 *  pero no más de 3 veces por minuto para no entrar en un bucle. */
const caidas = new Map();
function revivir(contenido, detalles) {
  if (detalles.reason === 'clean-exit' || contenido.isDestroyed()) return;
  const ahora = Date.now();
  const recientes = (caidas.get(contenido.id) || []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  caidas.set(contenido.id, recientes);
  console.error(`[maven] la página se cayó (${detalles.reason}); recargando`);
  if (recientes.length <= 3) contenido.reload();
}

// ── Permisos ─────────────────────────────────────────────────────────────────

function configurarSesion(ses) {
  // La sesión por defecto ya se guarda en disco (carpeta de datos de la app):
  // quien entra una vez no tiene que volver a poner su contraseña.

  ses.setPermissionCheckHandler((_contenido, permiso, origen, detalles) => {
    const desde = origen || detalles?.requestingUrl || '';
    return PERMISOS.has(permiso) && tienePermisos(desde, EXTRAS);
  });

  ses.setPermissionRequestHandler((contenido, permiso, responder, detalles) => {
    const desde = detalles?.requestingUrl || contenido?.getURL() || '';
    if (!PERMISOS.has(permiso) || !tienePermisos(desde, EXTRAS)) {
      responder(false);
      return;
    }
    if (permiso === 'media') {
      accesoDelSistema(detalles?.mediaTypes || [], contenido).then(responder, () => responder(false));
      return;
    }
    responder(true);
  });

  ses.setDisplayMediaRequestHandler(pedirPantalla);
}

/** En el Mac, además del permiso de la página, el SISTEMA tiene que dejar usar
 *  la cámara y el micrófono. La primera vez pregunta macOS; si ya se negó, se
 *  explica dónde activarlo (una sola vez por tipo, para no insistir). */
const avisadosMac = new Set();
async function accesoDelSistema(tipos, contenido) {
  if (!ES_MAC) return true;
  const pedidos = [];
  if (tipos.includes('video')) pedidos.push('camera');
  if (tipos.includes('audio')) pedidos.push('microphone');
  for (const tipo of pedidos) {
    const estado = systemPreferences.getMediaAccessStatus(tipo);
    if (estado === 'granted') continue;
    if (estado === 'not-determined' && (await systemPreferences.askForMediaAccess(tipo))) continue;
    avisarAccesoMac(tipo, contenido);
    return false;
  }
  return true;
}

function avisarAccesoMac(tipo, contenido) {
  if (avisadosMac.has(tipo)) return;
  avisadosMac.add(tipo);
  const camara = tipo === 'camera';
  const win = contenido ? BrowserWindow.fromWebContents(contenido) : null;
  const opciones = {
    type: 'warning',
    buttons: [textos.abrirAjustes, textos.cerrar],
    defaultId: 0,
    cancelId: 1,
    title: 'Maven',
    message: textos.accesoTitulo.replace('{tipo}', camara ? textos.camara : textos.microfono),
    detail: textos.accesoDetalle.replace('{lugar}', camara ? textos.lugarCamara : textos.lugarMicrofono),
  };
  const promesa = win ? dialog.showMessageBox(win, opciones) : dialog.showMessageBox(opciones);
  promesa.then(({ response }) => {
    if (response !== 0) return;
    const panel = camara ? 'Privacy_Camera' : 'Privacy_Microphone';
    shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${panel}`);
  });
}

// ── Compartir pantalla ───────────────────────────────────────────────────────
// La página llama a getDisplayMedia (botón de compartir de la llamada o de
// Cowork) y aquí se abre el selector propio: pantallas y ventanas con su
// miniatura. Cowork exige PANTALLA COMPLETA: si se elige una ventana, la página
// lo nota (displaySurface) y pide de nuevo, igual que en Chrome.
//
// Sonido: en Windows se puede sumar el sonido del computador (casilla, apagada
// de entrada). En el Mac, Electron todavía no captura el sonido del sistema.

const selectores = new Map(); // id del contenido del selector → { datos, terminar }

async function pedirPantalla(pedido, responder) {
  try {
    if (!pedido.videoRequested || !tienePermisos(pedido.securityOrigin, EXTRAS)) {
      responder(null);
      return;
    }
    const fuentes = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    const eleccion = await abrirSelector(ventanaDelPedido(pedido), fuentes, pedido.audioRequested);
    const fuente = eleccion && fuentes.find((f) => f.id === eleccion.id);
    if (!fuente) {
      responder(null);
      return;
    }
    const flujos = { video: fuente };
    if (eleccion.conAudio && ES_WINDOWS) flujos.audio = 'loopback';
    responder(flujos);
  } catch (err) {
    console.error('[maven] no se pudo compartir pantalla:', err);
    responder(null);
  }
}

function ventanaDelPedido(pedido) {
  try {
    const contenido = pedido.frame ? todosLosContenidos.fromFrame(pedido.frame) : null;
    const win = contenido ? BrowserWindow.fromWebContents(contenido) : null;
    if (win && !win.isDestroyed()) return win;
  } catch {
    // el marco ya no existe
  }
  return ventanaPrincipal && !ventanaPrincipal.isDestroyed() ? ventanaPrincipal : null;
}

function abrirSelector(padre, fuentes, pideAudio) {
  return new Promise((resolver) => {
    const padreVisible = padre && padre.isVisible() && !padre.isMinimized();
    const win = new BrowserWindow({
      parent: padreVisible ? padre : undefined,
      modal: Boolean(padreVisible),
      width: 780,
      height: 580,
      minWidth: 520,
      minHeight: 400,
      show: false,
      title: textos.selector.titulo,
      backgroundColor: FONDO,
      icon: ES_MAC ? undefined : ICONO,
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: preferenciasSeguras({ preload: PRELOAD_SELECTOR, spellcheck: false }),
    });
    const id = win.webContents.id;
    let listo = false;
    const terminar = (resultado) => {
      if (listo) return;
      listo = true;
      selectores.delete(id);
      resolver(resultado);
      if (!win.isDestroyed()) win.close();
    };
    selectores.set(id, {
      terminar,
      datos: {
        textos: textos.selector,
        fuentes: fuentes.map((f) => ({
          id: f.id,
          nombre: f.name,
          tipo: f.id.startsWith('screen:') ? 'pantalla' : 'ventana',
          miniatura: f.thumbnail && !f.thumbnail.isEmpty() ? f.thumbnail.toDataURL() : null,
          icono: f.appIcon && !f.appIcon.isEmpty() ? f.appIcon.toDataURL() : null,
        })),
        audio: Boolean(pideAudio) && ES_WINDOWS,
        permisoMac: ES_MAC ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
      },
    });
    win.on('closed', () => terminar(null));
    win.once('ready-to-show', () => win.show());
    win.loadFile(PAGINA_SELECTOR);
  });
}

/** Solo responde a la página del selector (archivo local nuestro) que está abierta. */
function selectorDe(evento) {
  const entrada = selectores.get(evento.sender.id);
  const url = evento.senderFrame?.url || '';
  if (!entrada || !url.startsWith('file:') || !url.endsWith('/selector.html')) return null;
  return entrada;
}

ipcMain.handle('selector:datos', (evento) => selectorDe(evento)?.datos ?? null);
ipcMain.on('selector:elegir', (evento, eleccion) => {
  const selector = selectorDe(evento);
  if (!selector) return;
  const id = typeof eleccion?.id === 'string' ? eleccion.id : null;
  selector.terminar(id ? { id, conAudio: eleccion.conAudio === true } : null);
});
ipcMain.on('selector:cancelar', (evento) => selectorDe(evento)?.terminar(null));
ipcMain.on('selector:abrir-ajustes', (evento) => {
  if (!selectorDe(evento) || !ES_MAC) return;
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

// ── Que el sistema no suspenda la app durante una llamada ────────────────────
// Hay llamada si alguna ventana de Maven tiene un <video> o <audio> con una
// transmisión en vivo (cámara propia, la de otros, el audio de la sala). Se
// mira cada 15 s y cada vez que algo empieza o deja de sonar. La revisión corre
// en un mundo aislado: la página no la ve ni la puede tocar.

const MUNDO_SONDA = 1001;
const SONDA = `(() => {
  for (const el of document.querySelectorAll('video, audio')) {
    const s = el.srcObject;
    if (s && typeof s.getTracks === 'function' && s.getTracks().some((t) => t.readyState === 'live')) return true;
  }
  return false;
})()`;
let bloqueo = null;
let revisionPendiente = null;

async function hayLlamada() {
  for (const win of BrowserWindow.getAllWindows()) {
    const contenido = win.webContents;
    if (contenido.isDestroyed() || destinoDeNavegacion(contenido.getURL(), EXTRAS) !== 'maven') continue;
    try {
      if (await contenido.executeJavaScriptInIsolatedWorld(MUNDO_SONDA, [{ code: SONDA }])) return true;
    } catch {
      // la página está cargando o se cerró: cuenta como sin llamada
    }
  }
  return false;
}

async function revisarLlamada() {
  const activa = await hayLlamada();
  if (activa && bloqueo === null) {
    bloqueo = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!activa && bloqueo !== null) {
    powerSaveBlocker.stop(bloqueo);
    bloqueo = null;
  }
}

function revisarLlamadaPronto() {
  if (revisionPendiente) return;
  revisionPendiente = setTimeout(() => {
    revisionPendiente = null;
    revisarLlamada();
  }, 1500);
}

function vigilarLlamadas() {
  setInterval(revisarLlamada, 15_000);
}

// ── Menús ────────────────────────────────────────────────────────────────────

function armarMenu() {
  const t = textos;
  const contenidoEnFoco = (win) => (win && !win.isDestroyed() ? win.webContents : null);
  const plantilla = [
    ES_MAC
      ? {
          label: app.name,
          submenu: [
            { role: 'about', label: t.acercaDe },
            { type: 'separator' },
            { role: 'hide', label: t.ocultar },
            { role: 'hideOthers', label: t.ocultarOtros },
            { role: 'unhide', label: t.mostrarTodo },
            { type: 'separator' },
            { role: 'quit', label: t.salirDeMaven },
          ],
        }
      : { label: t.archivo, submenu: [{ role: 'quit', label: t.salirDeMaven }] },
    {
      label: t.edicion,
      submenu: [
        { role: 'undo', label: t.deshacer },
        { role: 'redo', label: t.rehacer },
        { type: 'separator' },
        { role: 'cut', label: t.cortar },
        { role: 'copy', label: t.copiar },
        { role: 'paste', label: t.pegar },
        { role: 'selectAll', label: t.seleccionarTodo },
      ],
    },
    {
      label: t.ver,
      submenu: [
        {
          label: t.inicio,
          accelerator: 'CmdOrCtrl+Shift+H',
          click: (_item, win) => contenidoEnFoco(win)?.loadURL(URL_INICIO).catch(() => {}),
        },
        {
          label: t.atras,
          accelerator: ES_MAC ? 'Cmd+[' : 'Alt+Left',
          click: (_item, win) => {
            const historial = contenidoEnFoco(win)?.navigationHistory;
            if (historial?.canGoBack()) historial.goBack();
          },
        },
        {
          label: t.adelante,
          accelerator: ES_MAC ? 'Cmd+]' : 'Alt+Right',
          click: (_item, win) => {
            const historial = contenidoEnFoco(win)?.navigationHistory;
            if (historial?.canGoForward()) historial.goForward();
          },
        },
        { type: 'separator' },
        { role: 'reload', label: t.recargar },
        { role: 'forceReload', label: t.forzarRecarga },
        { type: 'separator' },
        { role: 'resetZoom', label: t.tamanoReal },
        { role: 'zoomIn', label: t.acercar },
        { role: 'zoomOut', label: t.alejar },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.pantallaCompleta },
        { type: 'separator' },
        { role: 'toggleDevTools', label: t.herramientas },
      ],
    },
    { role: 'windowMenu', label: t.ventana },
  ];
  return Menu.buildFromTemplate(plantilla);
}

/** Clic derecho: Electron no trae menú propio, sin esto no había ni «Pegar». */
function menuContextual(contenido, p) {
  const t = textos;
  const grupos = [];

  if (p.misspelledWord) {
    const sugerencias = (p.dictionarySuggestions || []).slice(0, 5).map((s) => ({
      label: s,
      click: () => contenido.replaceMisspelling(s),
    }));
    grupos.push([
      ...sugerencias,
      {
        label: t.agregarAlDiccionario,
        click: () => contenido.session.addWordToSpellCheckerDictionary(p.misspelledWord),
      },
    ]);
  }

  if (p.linkURL) {
    const enlace = [{ label: t.copiarEnlace, click: () => clipboard.writeText(p.linkURL) }];
    if (destinoDeNavegacion(p.linkURL, EXTRAS) !== 'bloqueado') {
      enlace.push({ label: t.abrirEnNavegador, click: () => abrirAfuera(p.linkURL) });
    }
    grupos.push(enlace);
  }

  if (p.mediaType === 'image' && p.hasImageContents) {
    grupos.push([{ label: t.copiarImagen, click: () => contenido.copyImageAt(p.x, p.y) }]);
  }

  if (p.isEditable) {
    grupos.push([
      { role: 'cut', label: t.cortar, enabled: p.editFlags.canCut },
      { role: 'copy', label: t.copiar, enabled: p.editFlags.canCopy },
      { role: 'paste', label: t.pegar, enabled: p.editFlags.canPaste },
      { role: 'selectAll', label: t.seleccionarTodo },
    ]);
  } else if (p.selectionText && p.selectionText.trim()) {
    grupos.push([{ role: 'copy', label: t.copiar }]);
  }

  if (grupos.length === 0) return;
  const plantilla = grupos.flatMap((g, i) => (i === 0 ? g : [{ type: 'separator' }, ...g]));
  const win = BrowserWindow.fromWebContents(contenido);
  Menu.buildFromTemplate(plantilla).popup(win ? { window: win } : {});
}
