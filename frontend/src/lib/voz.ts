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

/** Habla el texto. Devuelve false si este navegador no puede hablar. */
export function hablar(texto: string, opciones?: { volumen?: number; velocidad?: number }): boolean {
  try {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return false;
    // Si venía diciendo otra cosa, se corta: dos frases encimadas no se
    // entienden y es peor que una sola.
    sintesis.cancel();
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
    u.onstart = () => { arranco = true; };
    u.onerror = (e) => {
      const motivo = (e as SpeechSynthesisErrorEvent).error;
      if (motivo === "canceled" || motivo === "interrupted") return;  // normal
      console.warn("[Voz] El navegador rechazo hablar:", motivo, "— el aviso escrito sigue estando.");
    };
    window.setTimeout(() => {
      if (!arranco) {
        console.warn("[Voz] Se pidio hablar y nunca arranco. Frase:", texto.slice(0, 60));
      }
    }, 2500);

    sintesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
