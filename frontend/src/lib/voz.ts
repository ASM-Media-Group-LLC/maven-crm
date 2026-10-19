// Voz del navegador, en español neutro.
//
// La usan el supervisor de encuadre (que le habla a la persona que quedó fuera
// de cuadro) y el dashboard del coordinador (que le dice a quién le pasa). Cada
// una suena en SU propia máquina: no viaja por la llamada, no gasta ancho de
// banda y no queda dentro de la grabación.
//
// Si el equipo no tiene síntesis de voz instalada no pasa nada: quien llame se
// entera por el valor de retorno y el aviso escrito sigue estando igual.

// ── NO AGREGAR NADA A ESTE ARCHIVO SIN LEER ESTO ────────────────────────────
//
// Esta funcion es corta a proposito. Ya se intento "mejorarla" dos veces en una
// noche y las dos rompieron la voz para todo el equipo:
//
// 1. Una guarda que se negaba a hablar hasta que `getVoices()` tuviera algo.
//    Hay navegadores donde la lista se llena RECIEN DESPUES del primer speak():
//    candado perfecto, silencio total.
//
// 2. Un "desbloqueo" que pronunciaba una cadena vacia (" ") al primer clic,
//    para destrabar la sintesis. Hace lo contrario: pronunciar vacio TRABA la
//    cola de Chromium. El motor queda con speaking=true y cero eventos, y el
//    trabe sobrevive a recargar la pagina Y a cambiar de sitio — hay que cerrar
//    el navegador entero. Paso en produccion, en Chrome y en Brave a la vez.
//
// Lo unico que se le agrego y que SI es seguro son los console.warn de abajo:
// no cambian ningun comportamiento, solo hacen visible el fallo. Antes, cuando
// la voz no salia, no quedaba ni una linea en ningun lado.
//
// Regla: si no estas seguro de que un cambio aca no puede callar la voz, no lo
// hagas. Un aviso de supervision que no suena no se nota hasta que importa.

/** Cómo terminó una frase. `nunca-arranco` = el navegador aceptó el pedido y
 *  la frase jamás empezó a sonar; es el cuadro del motor trabado. */
export type FinDeFrase = "fin" | "error" | "nunca-arranco";

/** Habla el texto. Devuelve false si este navegador no puede hablar.
 *
 *  `onInicio` y `onFin` son ADITIVOS y opcionales: no cambian nada de cómo se
 *  habla. Existen para poder ENCADENAR frases en vez de dispararlas todas
 *  juntas — que es lo que trababa el motor de Chromium. `onFin` se llama
 *  siempre exactamente una vez (termine, falle, o nunca arranque), porque quien
 *  encadena no puede quedarse esperando para siempre.
 *
 *  ⚠️ Si esta función devuelve `false`, `onFin` NO se va a llamar: no llegó a
 *  haber frase. Quien encadene tiene que mirar el retorno. */
export function hablar(
  texto: string,
  opciones?: {
    volumen?: number;
    velocidad?: number;
    onInicio?: () => void;
    onFin?: (como: FinDeFrase) => void;
  },
): boolean {
  try {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return false;
    // Si venía diciendo otra cosa, se corta: dos frases encimadas no se
    // entienden y es peor que una sola. Pero SOLO si de verdad hay algo sonando
    // o en cola: un cancel() sobre un motor INACTIVO es, en Chromium, uno de los
    // gestos que lo TRABAN (queda speaking=true y sin eventos). La cola del
    // supervisor llama a hablar() con el motor ya quieto entre frase y frase, así
    // que antes esto disparaba un cancel() ocioso por CADA aviso durante todo el
    // turno. Si el motor ya está trabado, speaking vale true igual, así que el
    // corte se sigue intentando justo cuando queremos destrabarlo.
    if (sintesis.speaking || sintesis.pending) {
      try { sintesis.cancel(); } catch { /* noop */ }
    }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-419";
    u.rate = opciones?.velocidad ?? 0.95;
    u.volume = opciones?.volumen ?? 0.9;
    const voz = sintesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (voz) u.voice = voz;

    // Observabilidad, sin cambiar comportamiento: si el navegador acepta el
    // pedido y nunca arranca, que quede dicho. Un sistema de alertas que falla
    // callado es peor que uno que se cae.
    let arranco = false;
    // `onFin` se llama UNA sola vez pase lo que pase. Si se llamara dos veces,
    // quien encadena frases adelantaria la cola de a dos y volveria a encimar
    // — que es justo lo que se quiere evitar.
    let termino = false;
    // Latido que mantiene vivo el motor (ver abajo, junto al speak). Se apaga en
    // CUALQUIER salida de la frase para no dejar un timer colgado.
    let latido: number | undefined;
    const pararLatido = () => {
      if (latido !== undefined) { window.clearInterval(latido); latido = undefined; }
    };
    const terminar = (como: FinDeFrase) => {
      if (termino) return;
      termino = true;
      pararLatido();
      opciones?.onFin?.(como);
    };

    u.onstart = () => { arranco = true; opciones?.onInicio?.(); };
    u.onend = () => terminar("fin");
    u.onerror = (e) => {
      const motivo = (e as SpeechSynthesisErrorEvent).error;
      if (motivo === "canceled" || motivo === "interrupted") { terminar("error"); return; }  // normal
      console.warn("[Voz] El navegador rechazo hablar:", motivo, "— el aviso escrito sigue estando.");
      terminar("error");
    };
    window.setTimeout(() => {
      if (!arranco) {
        console.warn("[Voz] Se pidio hablar y nunca arranco. Frase:", texto.slice(0, 60));
        // Se la da por muerta para que la cola SIGA. Si se dejara colgada, una
        // sola frase trabada callaria todos los avisos que vengan detras.
        terminar("nunca-arranco");
      }
    }, 2500);

    // Chrome PAUSA la síntesis cuando la pestaña pasa a segundo plano o tras unos
    // segundos de habla, y el tablero del supervisor casi siempre está en segundo
    // plano: la frase se ACEPTA (speaking=true) y nunca suena — el "aceptó pero
    // nunca reprodujo" que se veía en pantalla. resume() la destraba y es no-op si
    // el motor no está pausado (el mismo gesto que ya usamos con el AudioContext en
    // notificationSound y useLiveKit). Va ANTES del speak por si quedó pausado de
    // una frase anterior, y además LATE mientras esta frase esté en vuelo: el
    // resume() de antes del speak corre sin que el navegador lo frene; el latido
    // cubre la pausa de los ~15 s en primer plano (en segundo plano el navegador
    // ralentiza los timers, pero para entonces el resume() de arriba ya hizo lo suyo).
    try { sintesis.resume(); } catch { /* noop */ }
    sintesis.speak(u);
    latido = window.setInterval(() => {
      try {
        // Cuando el motor ya no habla, la frase terminó: el latido se apaga solo
        // aunque onend nunca haya llegado (motor trabado a mitad de frase).
        if (!sintesis.speaking) { pararLatido(); return; }
        sintesis.resume();
      } catch { pararLatido(); }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}
