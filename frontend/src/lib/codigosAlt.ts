// Windows escribe caracteres con Alt + números del teclado numérico: Alt+64 es
// «@». Con Bloq Num APAGADO esas teclas son flechas, Inicio, RePág…, y Alt +
// flecha izquierda/derecha es «Atrás»/«Adelante» del navegador: escribir la
// arroba en el Correo te sacaba al chat del que venías (Keila, 02/10). Se
// frena la navegación de ESAS teclas y nada más: el carácter lo compone Windows
// al soltar Alt, aparte, así que se sigue escribiendo.
export function esAltDelTecladoNumerico(
  e: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "code" | "key">,
): boolean {
  // Con Bloq Num prendido llega el dígito y el navegador no hace nada con él.
  return e.altKey && !e.ctrlKey && !e.metaKey && e.code.startsWith("Numpad") && !/^[0-9]$/.test(e.key);
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (esAltDelTecladoNumerico(e)) e.preventDefault();
  }, true);
}
