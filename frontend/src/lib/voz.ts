// Voz del navegador, en español neutro.
//
// La usan el supervisor de encuadre (que le habla a la persona que quedó fuera
// de cuadro) y el dashboard del coordinador (que le dice a quién le pasa). Cada
// una suena en SU propia máquina: no viaja por la llamada, no gasta ancho de
// banda y no queda dentro de la grabación.
//
// Si el equipo no tiene síntesis de voz instalada no pasa nada: quien llame se
// entera por el valor de retorno y el aviso escrito sigue estando igual.

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
    sintesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
