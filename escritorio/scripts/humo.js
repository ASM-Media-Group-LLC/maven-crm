'use strict';

// PRUEBA DE HUMO de la app de escritorio: la abre de verdad contra producción,
// SIN iniciar sesión, y revisa lo que importa. No toca cuentas ni pide cámara.
//
//   npm run humo -- --salida=/carpeta/para/capturas
//
// Qué revisa:
//   1. Que cargue la página de entrada de Maven (captura de la ventana).
//   2. Que la página vea concedidos cámara, micrófono y avisos (sin abrirlos).
//   3. Que MINIMIZADA siga «visible» y los relojes sigan a ritmo normal.
//   4. Que los enlaces de afuera vayan al navegador y no se abran dentro.
//   5. Que window.open('about:blank') abra otra ventana de la app.
//   6. Que el selector de pantalla se abra (con fuentes de mentira, para no
//      pedirle permiso de grabación al Mac) y que cancelar llegue a la página.
//   7. Que con un video en vivo en la página se pida al sistema no suspender.
//
// Aislada: usa una carpeta de datos temporal, no abre el navegador (se anota
// a dónde habría ido) y no comparte nada.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const { app, BrowserWindow, desktopCapturer, nativeImage, powerSaveBlocker, shell } = electron;

const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice('--salida='.length)
  || fs.mkdtempSync(path.join(os.tmpdir(), 'maven-humo-'));
fs.mkdirSync(salida, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'maven-humo-datos-')));

const externos = [];
shell.openExternal = async (url) => { externos.push(url); };

const icono = nativeImage.createFromPath(path.join(__dirname, '..', 'recursos', 'icono.png'));
desktopCapturer.getSources = async () => [
  { id: 'screen:1:0', name: 'Entire screen', display_id: '1', thumbnail: icono.resize({ width: 320 }), appIcon: null },
  { id: 'window:11:0', name: 'Chrome — Bandeja de entrada', display_id: '', thumbnail: icono.resize({ width: 200 }), appIcon: icono.resize({ width: 16 }) },
  { id: 'window:12:0', name: 'Hoja de cálculo <script>alert(1)</script>', display_id: '', thumbnail: icono.resize({ width: 200 }), appIcon: null },
];

const bloqueos = [];
const iniciarBloqueo = powerSaveBlocker.start.bind(powerSaveBlocker);
powerSaveBlocker.start = (tipo) => { bloqueos.push(tipo); return iniciarBloqueo(tipo); };

require('../src/principal.js');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const anotar = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? 'OK ' : 'MAL'}  ${nombre}${detalle === undefined ? '' : `  → ${JSON.stringify(detalle)}`}`);
};

async function capturar(win, archivo) {
  const imagen = await win.webContents.capturePage();
  fs.writeFileSync(path.join(salida, archivo), imagen.toPNG());
}

async function prueba() {
  await app.whenReady();
  await esperar(500);
  const principal = BrowserWindow.getAllWindows()[0];
  const wc = principal.webContents;
  if (wc.isLoading()) await new Promise((r) => wc.once('did-stop-loading', r));
  await esperar(6000); // que React pinte

  // 1. Carga la entrada de Maven.
  const pagina = await wc.executeJavaScript(`({
    url: location.href,
    titulo: document.title,
    texto: document.body.innerText.slice(0, 300),
    agente: navigator.userAgent,
    compartir: typeof navigator.mediaDevices?.getDisplayMedia,
  })`);
  await capturar(principal, '1-entrada.png');
  anotar('carga la Maven de producción', pagina.url.startsWith('https://app.maven-ai.me/') && pagina.texto.length > 0, pagina);

  // 2. Permisos vistos por la página (consultar no enciende nada).
  const permisos = await wc.executeJavaScript(`Promise.all(['camera', 'microphone', 'notifications'].map(
    (name) => navigator.permissions.query({ name }).then((p) => name + ':' + p.state, (e) => name + ':' + e.name)
  )).then((l) => l.concat('Notification:' + Notification.permission))`);
  anotar('cámara, micrófono y avisos concedidos a app.maven-ai.me', permisos.every((p) => p.endsWith(':granted')), permisos);

  // 3. Minimizada: sigue visible y los relojes no se frenan.
  principal.minimize();
  await esperar(1500);
  const minimizada = await wc.executeJavaScript(`new Promise((r) => {
    let n = 0; const t0 = performance.now();
    const id = setInterval(() => { n++; }, 100);
    setTimeout(() => { clearInterval(id); r({ vis: document.visibilityState, oculto: document.hidden, ticks: n, ms: Math.round(performance.now() - t0) }); }, 5000);
  })`);
  anotar('minimizada sigue visible y con relojes a ritmo normal', minimizada.vis === 'visible' && minimizada.ticks >= 45, minimizada);
  principal.restore();
  await esperar(800);

  // 4. Enlaces de afuera → navegador del sistema; la ventana no se mueve.
  await wc.executeJavaScript(`window.open('https://instagram.com/maven', '_blank', 'noopener'); undefined`, true);
  await wc.executeJavaScript(`location.href = 'https://example.com/fuera'; undefined`, true);
  await esperar(1500);
  anotar('lo de afuera va al navegador', externos.includes('https://instagram.com/maven') && externos.includes('https://example.com/fuera') && wc.getURL().startsWith('https://app.maven-ai.me/'), { externos, url: wc.getURL() });
  await wc.executeJavaScript(`location.href = 'file:///etc/hosts'; undefined`, true);
  await esperar(800);
  anotar('file: se bloquea', wc.getURL().startsWith('https://app.maven-ai.me/') && !externos.some((u) => u.startsWith('file:')), wc.getURL());

  // 5. window.open('about:blank') abre otra ventana de la app.
  const antes = BrowserWindow.getAllWindows().length;
  await wc.executeJavaScript(`window.__humo = window.open('about:blank', '_blank'); undefined`, true);
  await esperar(1000);
  const despues = BrowserWindow.getAllWindows().length;
  anotar('about:blank abre ventana propia', despues === antes + 1, { antes, despues });
  await wc.executeJavaScript(`window.__humo && window.__humo.close(); undefined`);
  await esperar(500);

  // 6. Selector de pantalla: se abre, se ve, cancelar llega a la página.
  const nueva = new Promise((r) => app.once('browser-window-created', (_e, w) => r(w)));
  const resultado = wc.executeJavaScript(
    `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(() => 'compartió', (e) => e.name)`,
    true,
  );
  const selector = await nueva;
  await new Promise((r) => selector.webContents.once('did-finish-load', r));
  await esperar(800);
  const dom = await selector.webContents.executeJavaScript(`({
    tarjetas: document.querySelectorAll('.fuente').length,
    nombres: [...document.querySelectorAll('.fuente .nombre span')].map((s) => s.textContent),
    compartirActivo: !document.getElementById('compartir').disabled,
    nodeExpuesto: typeof require !== 'undefined' || typeof process !== 'undefined',
    puente: Object.keys(window.selector || {}),
  })`);
  await capturar(selector, '2-selector-pantallas.png');
  await selector.webContents.executeJavaScript(`document.getElementById('tab-ventana').click(); undefined`);
  await esperar(300);
  const ventanas = await selector.webContents.executeJavaScript(
    `[...document.querySelectorAll('.fuente .nombre span')].map((s) => s.textContent)`,
  );
  await capturar(selector, '3-selector-ventanas.png');
  anotar('el selector muestra pantallas y ventanas sin Node', dom.tarjetas === 1 && ventanas.length === 2 && !dom.nodeExpuesto, { ...dom, ventanas });
  await selector.webContents.executeJavaScript(`document.getElementById('cancelar').click(); undefined`);
  const respuesta = await resultado;
  anotar('cancelar el selector llega como cancelación', respuesta === 'NotAllowedError' || respuesta === 'AbortError', respuesta);

  // 7. Video en vivo en la página → no suspender. Un lienzo como cámara de
  //    mentira: no enciende ninguna cámara real.
  await wc.executeJavaScript(`(() => {
    const lienzo = document.createElement('canvas'); lienzo.width = 16; lienzo.height = 16;
    lienzo.getContext('2d').fillRect(0, 0, 16, 16);
    const v = document.createElement('video'); v.id = '__humo_video'; v.muted = true; v.style.display = 'none';
    v.srcObject = lienzo.captureStream(1); document.body.append(v); return v.play().then(() => 'ok', (e) => e.name);
  })()`, true);
  await esperar(17_000);
  anotar('con video en vivo se pide no suspender', bloqueos.includes('prevent-app-suspension'), bloqueos);
  await wc.executeJavaScript(`(() => { const v = document.getElementById('__humo_video'); v.srcObject.getTracks().forEach((t) => t.stop()); v.remove(); })()`);

  fs.writeFileSync(path.join(salida, 'resultado.json'), JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallas}/${resultados.length} bien. Capturas en ${salida}`);
  app.exit(fallas ? 1 : 0);
}

prueba().catch((err) => {
  console.error('la prueba se cayó:', err);
  app.exit(2);
});
