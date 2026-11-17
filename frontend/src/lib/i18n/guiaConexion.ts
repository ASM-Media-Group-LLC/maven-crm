// Guía de conexión (/conexion, Alvaro 17/11/2026): probar el internet con la
// prueba real de la llamada y los consejos para que no se caiga.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_GUIA_CONEXION = ["guiaConexion."] as const;

export const guiaConexion = {
  // ── Encabezado ──
  "guiaConexion.titulo": { es: "Guía de conexión", en: "Connection guide" },
  "guiaConexion.subtitulo": {
    es: "Para que no se te caiga la llamada: prueba tu internet y sigue estos consejos.",
    en: "Keep your calls from dropping: test your internet and follow these tips.",
  },

  // ── La prueba ──
  "guiaConexion.prueba.titulo": { es: "Prueba tu internet", en: "Test your internet" },
  "guiaConexion.prueba.desc": {
    es: "Tarda unos segundos y mide lo mismo que mide la llamada de Cowork.",
    en: "It takes a few seconds and measures the same thing the Cowork call measures.",
  },
  "guiaConexion.prueba.boton": { es: "Probar mi internet", en: "Test my internet" },
  "guiaConexion.prueba.probando": { es: "Probando…", en: "Testing…" },
  "guiaConexion.prueba.otraVez": { es: "Probar otra vez", en: "Test again" },
  "guiaConexion.prueba.error": { es: "No se pudo hacer la prueba", en: "The test couldn't run" },
  "guiaConexion.prueba.errorDesc": {
    es: "Revisa que tengas internet y vuelve a intentarlo.",
    en: "Check that you're online and try again.",
  },
  "guiaConexion.prueba.enLlamada": {
    es: "Estás en una llamada: la prueba mide lo que te queda libre, así que puede salir un poco más baja.",
    en: "You're on a call: the test measures what's left over, so it may come out a bit lower.",
  },
  "guiaConexion.prueba.wifi": {
    es: "Aunque salga bien, el Wi-Fi puede cortarse a ratos. Si usas Wi-Fi, el cable es lo más seguro.",
    en: "Even if it looks good, Wi-Fi can drop out now and then. If you're on Wi-Fi, a cable is the safest bet.",
  },

  // ── El veredicto ──
  "guiaConexion.veredicto.bien.titulo": { es: "Tu internet aguanta la llamada", en: "Your internet can handle the call" },
  "guiaConexion.veredicto.bien.desc": {
    es: "Alcanza para tu cámara, tu pantalla y las del equipo.",
    en: "It's enough for your camera, your screen and the team's.",
  },
  "guiaConexion.veredicto.justo.titulo": { es: "Tu internet va justo", en: "Your internet is borderline" },
  "guiaConexion.veredicto.justo.desc": {
    es: "La llamada funciona, pero puede trabarse si alguien más usa el internet o si el Wi-Fi baja. Sigue los consejos de abajo.",
    en: "The call works, but it may stutter if someone else uses the internet or the Wi-Fi dips. Follow the tips below.",
  },
  "guiaConexion.veredicto.malo.titulo": { es: "Con este internet la llamada se va a cortar", en: "With this connection the call will drop" },
  "guiaConexion.veredicto.malo.desc": {
    es: "Conéctate por cable o acércate al router, cierra lo que esté gastando internet y vuelve a probar.",
    en: "Plug in a cable or move closer to the router, close whatever is using the internet and test again.",
  },
  "guiaConexion.veredicto.incompleta.titulo": { es: "La prueba quedó incompleta", en: "The test didn't finish" },
  "guiaConexion.veredicto.incompleta.desc": {
    es: "No se pudo medir la subida. Vuelve a probar en un momento.",
    en: "Upload couldn't be measured. Try again in a moment.",
  },

  // ── El semáforo de cada medida ──
  "guiaConexion.semaforo.bien": { es: "Bien", en: "Good" },
  "guiaConexion.semaforo.justo": { es: "Justo", en: "Fair" },
  "guiaConexion.semaforo.malo": { es: "Malo", en: "Poor" },
  "guiaConexion.semaforo.sinDato": { es: "Sin dato", en: "No data" },
  "guiaConexion.menosDe": { es: "menos de {n}", en: "under {n}" },

  "guiaConexion.subida.titulo": { es: "Subida", en: "Upload" },
  "guiaConexion.subida.desc": {
    es: "Lo que mandas: tu cámara y tu pantalla. Es la que más pesa en la llamada. Ideal: {n} Mbps o más.",
    en: "What you send: your camera and screen. It matters most on calls. Ideal: {n} Mbps or more.",
  },
  "guiaConexion.bajada.titulo": { es: "Bajada", en: "Download" },
  "guiaConexion.bajada.desc": {
    es: "Lo que recibes: las voces y las cámaras del equipo. Ideal: {n} Mbps o más.",
    en: "What you receive: the team's voices and cameras. Ideal: {n} Mbps or more.",
  },
  "guiaConexion.respuesta.titulo": { es: "Respuesta", en: "Response time" },
  "guiaConexion.respuesta.desc": {
    es: "Cuánto tarda el servidor en contestarte. Menos es mejor. Ideal: menos de {n} ms.",
    en: "How long the server takes to answer you. Lower is better. Ideal: under {n} ms.",
  },

  // ── Consejos ──
  "guiaConexion.consejos.titulo": { es: "Seis consejos para que no se te caiga", en: "Six tips to keep your call from dropping" },
  "guiaConexion.consejo.cable.titulo": { es: "Usa cable de red, no Wi-Fi", en: "Use a network cable, not Wi-Fi" },
  "guiaConexion.consejo.cable.desc": {
    es: "El cable no se corta como el Wi-Fi. Si tu computador no tiene la entrada, sirve un adaptador USB a red.",
    en: "A cable doesn't drop out like Wi-Fi. If your computer has no port for it, a USB-to-Ethernet adapter works.",
  },
  "guiaConexion.consejo.router.titulo": { es: "Acércate al router", en: "Get closer to the router" },
  "guiaConexion.consejo.router.desc": {
    es: "Si usas Wi-Fi, trabaja cerca del router, sin paredes ni puertas en medio.",
    en: "If you use Wi-Fi, work near the router, with no walls or doors in between.",
  },
  "guiaConexion.consejo.cerrar.titulo": { es: "Cierra lo que gasta internet", en: "Close whatever eats bandwidth" },
  "guiaConexion.consejo.cerrar.desc": {
    es: "Netflix, YouTube, descargas y pestañas pesadas. Si en tu casa alguien ve videos o juega en línea, también te quita internet.",
    en: "Netflix, YouTube, downloads and heavy tabs. If someone at home is streaming or gaming online, that takes bandwidth from you too.",
  },
  "guiaConexion.consejo.pestana.titulo": { es: "No escondas la pestaña de Maven", en: "Don't hide the Maven tab" },
  "guiaConexion.consejo.pestana.desc": {
    es: "Durante la llamada déjala a la vista. Si la minimizas o pasas a otra pestaña, el navegador la frena y la llamada se corta. Si necesitas otra página, ábrela en otra ventana.",
    en: "Keep it visible during the call. If you minimize it or switch to another tab, the browser slows it down and the call drops. If you need another page, open it in a separate window.",
  },
  "guiaConexion.consejo.reiniciar.titulo": { es: "Reinicia el router si va lento", en: "Restart the router if it's slow" },
  "guiaConexion.consejo.reiniciar.desc": {
    es: "Desconéctalo 30 segundos, vuelve a conectarlo y espera unos 2 minutos a que vuelva el internet.",
    en: "Unplug it for 30 seconds, plug it back in and wait about 2 minutes for the internet to come back.",
  },
  "guiaConexion.consejo.chrome.titulo": { es: "Usa Chrome actualizado", en: "Use an up-to-date Chrome" },
  "guiaConexion.consejo.chrome.desc": {
    es: "Menú ⋮ → Ayuda → Información de Google Chrome. Si aparece «Volver a iniciar», tócalo.",
    en: "Menu ⋮ → Help → About Google Chrome. If you see «Relaunch», click it.",
  },

  // ── Si se cae ──
  "guiaConexion.caida.titulo": { es: "Si se te cae la llamada", en: "If your call drops" },
  "guiaConexion.caida.paso1": {
    //  : espacio que no corta, así «⌘ + R» no se parte entre dos renglones.
    es: "Recarga la página: F5 en Windows, ⌘ + R en Mac, o el botón ⟳ del navegador.",
    en: "Reload the page: F5 on Windows, ⌘ + R on a Mac, or the browser's ⟳ button.",
  },
  "guiaConexion.caida.paso2": { es: "Vuelve a entrar a tu sala de Cowork.", en: "Join your Cowork room again." },
  "guiaConexion.caida.paso3": {
    es: "Si se vuelve a caer, prueba tu internet aquí arriba y sigue los consejos. Si sigue igual, avísale a tu supervisor.",
    en: "If it drops again, test your internet above and follow the tips. If nothing changes, let your supervisor know.",
  },
  "guiaConexion.caida.irACowork": { es: "Ir a Cowork", en: "Go to Cowork" },
} as const satisfies Record<string, { es: string; en: string }>;
