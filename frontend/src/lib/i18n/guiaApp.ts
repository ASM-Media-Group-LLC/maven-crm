// Guía para instalar la app de Maven (/app, Alvaro 18/11/2026): desde el
// viernes 20/11 Cowork en el computador va solo en la app. Paso a paso para Mac
// y Windows, con dibujos.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_GUIA_APP = ["guiaApp."] as const;

export const guiaApp = {
  // ── Encabezado ──
  "guiaApp.titulo": { es: "Instala la app de Maven", en: "Install the Maven app" },
  "guiaApp.subtitulo": {
    es: "Cowork en el computador funciona en la app de Maven. Se instala en dos minutos.",
    en: "On a computer, Cowork runs in the Maven app. It installs in two minutes.",
  },
  "guiaApp.subtituloFecha": {
    es: "Desde el {fecha}, Cowork en el computador funciona solo en la app de Maven. Se instala en dos minutos.",
    en: "From {fecha}, Cowork on a computer only works in the Maven app. It installs in two minutes.",
  },

  // ── Dónde está mirando ──
  "guiaApp.yaEnApp.titulo": { es: "Ya estás en la app de Maven", en: "You're already in the Maven app" },
  "guiaApp.yaEnApp.desc": {
    es: "Todo listo: Cowork abre aquí. Usa esta guía para ayudar a un compañero.",
    en: "You're all set: Cowork opens here. Use this guide to help a teammate.",
  },
  "guiaApp.celular.titulo": { es: "En el celular no necesitas la app", en: "You don't need the app on your phone" },
  "guiaApp.celular.desc": {
    es: "Cowork en el celular sigue igual. Abre esta guía en tu computador para instalarla ahí.",
    en: "Cowork on your phone works as before. Open this guide on your computer to install it there.",
  },

  // ── Arriba: descargar o abrir ──
  "guiaApp.inicio.titulo": { es: "La app de Maven para computador", en: "The Maven desktop app" },
  "guiaApp.inicio.desc": {
    es: "Descárgala, instálala y entra con tu mismo correo y contraseña de Maven. Después se abre y se actualiza sola.",
    en: "Download it, install it and sign in with your usual Maven email and password. After that it opens and updates by itself.",
  },
  "guiaApp.descargarPara": { es: "Descargar para {sistema}", en: "Download for {sistema}" },
  "guiaApp.yaLaTengo": { es: "Ya la tengo: abrir en la app", en: "I have it: open in the app" },
  "guiaApp.yaLaTengoAyuda": {
    es: "Si al tocar «Ya la tengo» no se abre nada, todavía no está instalada: sigue los pasos.",
    en: "If nothing opens when you tap “I have it”, it isn't installed yet: follow the steps.",
  },
  "guiaApp.irACowork": { es: "Ir a Cowork", en: "Go to Cowork" },

  // ── Los pasos ──
  "guiaApp.pasos.titulo": { es: "Paso a paso", en: "Step by step" },
  "guiaApp.sistema": { es: "Elige tu computador", en: "Choose your computer" },
  "guiaApp.esteEquipo": { es: "Este equipo", en: "This computer" },

  "guiaApp.paso.descargar.titulo": { es: "Descarga la app", en: "Download the app" },
  "guiaApp.paso.descargar.desc": {
    es: "Toca «Descargar para {sistema}». El archivo {archivo} se guarda en tu carpeta Descargas.",
    en: "Tap “Download for {sistema}”. The file {archivo} is saved to your Downloads folder.",
  },

  "guiaApp.paso.instalar.titulo": { es: "Instálala", en: "Install it" },
  "guiaApp.paso.instalar.windows": {
    es: "Abre {archivo} desde Descargas. Se instala sola y se abre sola.",
    en: "Open {archivo} from Downloads. It installs and opens by itself.",
  },
  "guiaApp.paso.instalar.windowsAviso": {
    es: "Si sale un aviso azul «Windows protegió tu PC», toca «Más información» y después «Ejecutar de todas formas». Es normal los primeros días: la app es de Maven y está firmada.",
    en: "If a blue “Windows protected your PC” warning shows up, tap “More info” and then “Run anyway”. It's normal for the first few days: the app is Maven's and it's signed.",
  },
  "guiaApp.paso.instalar.mac": {
    es: "Abre {archivo} desde Descargas. En la ventana que aparece, arrastra el ícono de Maven a la carpeta Aplicaciones.",
    en: "Open {archivo} from Downloads. In the window that appears, drag the Maven icon onto the Applications folder.",
  },
  "guiaApp.paso.instalar.macAbrir": {
    es: "Después ábrela desde Aplicaciones (o toca ⌘ + espacio y escribe «Maven»).",
    en: "Then open it from Applications (or press ⌘ + Space and type “Maven”).",
  },

  "guiaApp.paso.entrar.titulo": { es: "Entra con tu mismo correo y contraseña", en: "Sign in with your usual email and password" },
  "guiaApp.paso.entrar.desc": {
    es: "Son los mismos con los que entras a Maven aquí. No hay que crear ninguna cuenta nueva.",
    en: "The same ones you use for Maven here. No new account needed.",
  },
  "guiaApp.paso.entrar.olvide": { es: "¿No recuerdas tu contraseña?", en: "Forgot your password?" },
  "guiaApp.paso.entrar.restablecer": { es: "Restablécela aquí", en: "Reset it here" },

  "guiaApp.paso.permisos.titulo": { es: "Da los permisos", en: "Allow the permissions" },
  "guiaApp.paso.permisos.mac": {
    es: "La primera vez, Maven te pide la cámara y el micrófono: toca «Permitir».",
    en: "The first time, Maven asks for your camera and microphone: tap “Allow”.",
  },
  "guiaApp.paso.permisos.macPantalla": {
    es: "La primera vez que compartas pantalla, macOS pide «Grabación de pantalla y audio del sistema». Abre Configuración del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema, activa Maven y toca «Salir y volver a abrir».",
    en: "The first time you share your screen, macOS asks for “Screen & System Audio Recording”. Open System Settings → Privacy & Security → Screen & System Audio Recording, turn Maven on and tap “Quit & Reopen”.",
  },
  "guiaApp.paso.permisos.macArreglo": {
    es: "¿Maven ya aparece activado y te lo sigue pidiendo? Selecciónalo, quítalo con «−», agrégalo otra vez con «+» (desde Aplicaciones) y vuelve a abrir Maven.",
    en: "Maven already shows as on but it keeps asking? Select it, remove it with “−”, add it again with “+” (from Applications) and reopen Maven.",
  },
  "guiaApp.paso.permisos.windows": {
    es: "Si Maven te pide la cámara o el micrófono, toca «Permitir».",
    en: "If Maven asks for your camera or microphone, tap “Allow”.",
  },
  "guiaApp.paso.permisos.windowsArreglo": {
    es: "¿No se te ve la cámara o no se te escucha? Abre Configuración → Privacidad y seguridad → Cámara (y después Micrófono) y activa «Permitir que las aplicaciones de escritorio accedan».",
    en: "Camera not showing or nobody can hear you? Open Settings → Privacy & security → Camera (and then Microphone) and turn on “Let desktop apps access”.",
  },

  "guiaApp.paso.listo.titulo": { es: "Listo", en: "You're done" },
  "guiaApp.paso.listo.cowork": {
    es: "Cowork se abre en la app: entra desde ahí cada día.",
    en: "Cowork opens in the app: start there every day.",
  },
  "guiaApp.paso.listo.sola": {
    es: "Se abre sola al prender el computador y se actualiza sola.",
    en: "It opens by itself when you turn on your computer and updates itself.",
  },
  "guiaApp.paso.listo.cerrarMac": {
    es: "Cerrar la ventana no la apaga: sigue arriba, en la barra de menú. Toca el ícono de Maven para volver.",
    en: "Closing the window doesn't quit it: it stays up top in the menu bar. Click the Maven icon to go back.",
  },
  "guiaApp.paso.listo.cerrarWindows": {
    es: "Cerrar la ventana no la apaga: sigue abajo a la derecha, junto al reloj. Toca el ícono de Maven para volver.",
    en: "Closing the window doesn't quit it: it stays at the bottom right, next to the clock. Click the Maven icon to go back.",
  },
  "guiaApp.paso.listo.abrir": { es: "Abrir Cowork en la app", en: "Open Cowork in the app" },

  // ── Los dibujos (lo que se ve en pantalla en cada paso) ──
  "guiaApp.dibujo.descargas": { es: "Descargas", en: "Downloads" },
  "guiaApp.dibujo.smartscreen": { es: "Windows protegió tu PC", en: "Windows protected your PC" },
  "guiaApp.dibujo.masInformacion": { es: "Más información", en: "More info" },
  "guiaApp.dibujo.ejecutar": { es: "Ejecutar de todas formas", en: "Run anyway" },
  "guiaApp.dibujo.noEjecutar": { es: "No ejecutar", en: "Don't run" },
  "guiaApp.dibujo.aplicaciones": { es: "Aplicaciones", en: "Applications" },
  "guiaApp.dibujo.correo": { es: "Correo", en: "Email" },
  "guiaApp.dibujo.correoEjemplo": { es: "tu.correo@maven-ai.me", en: "your.email@maven-ai.me" },
  "guiaApp.dibujo.contrasena": { es: "Contraseña", en: "Password" },
  "guiaApp.dibujo.entrar": { es: "Entrar", en: "Sign in" },
  "guiaApp.dibujo.pideCamara": {
    es: "«Maven» quiere usar la cámara y el micrófono",
    en: "“Maven” would like to use the camera and microphone",
  },
  "guiaApp.dibujo.noPermitir": { es: "No permitir", en: "Don't allow" },
  "guiaApp.dibujo.permitir": { es: "Permitir", en: "Allow" },
  "guiaApp.dibujo.grabacionPantalla": { es: "Grabación de pantalla y audio del sistema", en: "Screen & System Audio Recording" },
  "guiaApp.dibujo.salirYAbrir": { es: "Salir y volver a abrir", en: "Quit & Reopen" },
  "guiaApp.dibujo.camaraWindows": { es: "Privacidad y seguridad › Cámara", en: "Privacy & security › Camera" },
  "guiaApp.dibujo.appsEscritorio": {
    es: "Permitir que las aplicaciones de escritorio accedan",
    en: "Let desktop apps access",
  },
  "guiaApp.dibujo.coworkAbierto": { es: "Cowork abierto en la app", en: "Cowork open in the app" },
} as const;
