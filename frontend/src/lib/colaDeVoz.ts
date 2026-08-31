// Una cola para los avisos hablados del tablero del supervisor.
//
// ── EL PROBLEMA ─────────────────────────────────────────────────────────────
//
// `hablar()` empieza CORTANDO la frase anterior (`speechSynthesis.cancel()`).
// Está bien cuando hay una frase cada tanto — dos frases encimadas no se
// entienden. Pero cortar y arrancar muchas veces en el mismo instante es
// justamente lo que TRABA el motor de Chromium: queda con `speaking = true`,
// deja de emitir eventos, y no se recupera ni recargando la página. Hay que
// cerrar el navegador entero.
//
// Y el tablero del supervisor es el único lugar que dispara ráfagas así. La
// diferencia con el lado del chatter no es el código, es CUÁNTA gente vigila:
//
//   · el chatter se vigila a sí mismo    → 1 frase cada 90 segundos
//   · el tablero vigila a TODOS          → 3 avisos × N personas, de una
//
// Con once chatters eso son hasta treinta y tres `cancel()+speak()` en el mismo
// tick. Medido en producción el 31/08/2026: la consola del supervisor mostraba
// dos frases seguidas de la MISMA persona (cámara apagada + sin compartir
// pantalla), las dos con "se pidió hablar y nunca arrancó" — la segunda había
// cortado a la primera, y el motor ya estaba muerto.
//
// Se agravó ese mismo día: hasta el arreglo de los avisos repetidos, cada
// problema sonaba UNA vez y después se callaba para siempre. Eso, sin querer,
// mantenía el motor tranquilo.
//
// ── LO QUE HACE ─────────────────────────────────────────────────────────────
//
// 1. AGRUPA POR PERSONA. Dos problemas de Daniela son UNA frase, no dos que se
//    pisan: "Daniela Lopez tiene la cámara apagada y no marcó pausa, y lleva 8
//    minutos sin compartir pantalla."
// 2. HABLA DE A UNA. Espera a que termine cada frase antes de la siguiente, así
//    `cancel()` no llega a cortar nada. La ráfaga desaparece.
// 3. AVISA SI LA VOZ ESTÁ MUERTA. Si varias frases seguidas no arrancan, se
//    puede mostrar en pantalla en vez de dejarlo en una consola que nadie mira.
//
// NO se toca cómo habla `voz.ts` — solo CUÁNTAS VECES POR SEGUNDO se le pide.

import { hablar, type FinDeFrase } from "./voz";

/** Cuánto se espera para juntar los avisos de un mismo ciclo. Los tres efectos
 *  del tablero corren en el mismo commit de React, así que con muy poco alcanza
 *  para agruparlos; el resto es margen. */
const VENTANA_LOTE_MS = 900;

/** Respiro entre frases. Sin él se encadenan sin aire y suena a máquina. */
const AIRE_ENTRE_FRASES_MS = 400;

/** Tope de frases esperando. Si el tablero se vuelve loco, mejor perder avisos
 *  viejos que acumular una cola que va a tardar minutos en vaciarse — un aviso
 *  de hace cinco minutos ya no le sirve a nadie. */
const MAX_EN_COLA = 12;

/** Cuántas frases seguidas sin arrancar antes de dar la voz por muerta. Una
 *  sola puede ser una carrera; dos ya es el motor trabado. */
const FALLAS_PARA_DARLA_POR_MUERTA = 2;

type Aviso = { persona: string; predicados: string[]; volumen?: number };

let pendientes = new Map<string, Aviso>();
let temporizadorLote: number | null = null;
let cola: { frase: string; volumen?: number }[] = [];
let hablando = false;
let fallasSeguidas = 0;
let yaAvisamosQueEstaMuerta = false;
const oyentesDeFalla = new Set<(motivo: string) => void>();

/** Avisa cuando la voz parece muerta (varias frases que no arrancan).
 *  Devuelve la función para desuscribirse. */
export function alFallarLaVoz(cb: (motivo: string) => void): () => void {
  oyentesDeFalla.add(cb);
  return () => { oyentesDeFalla.delete(cb); };
}

function armarFrase(a: Aviso): string {
  // "Daniela Lopez" + ["tiene la cámara apagada", "lleva 8 minutos sin
  // compartir pantalla"] → "Daniela Lopez tiene la cámara apagada, y lleva 8
  // minutos sin compartir pantalla."
  const cuerpo = a.predicados.join(", y ");
  return `${a.persona} ${cuerpo}.`.replace(/\.+$/, ".");
}

function vaciarLote(): void {
  temporizadorLote = null;
  for (const aviso of pendientes.values()) {
    if (cola.length >= MAX_EN_COLA) break;
    cola.push({ frase: armarFrase(aviso), volumen: aviso.volumen });
  }
  pendientes = new Map();
  siguiente();
}

function siguiente(): void {
  if (hablando) return;
  const item = cola.shift();
  if (!item) return;

  hablando = true;
  const seguir = () => {
    hablando = false;
    window.setTimeout(siguiente, AIRE_ENTRE_FRASES_MS);
  };

  const ok = hablar(item.frase, {
    volumen: item.volumen,
    onInicio: () => {
      // Arrancó: la voz está viva. Se perdona todo lo anterior.
      fallasSeguidas = 0;
      yaAvisamosQueEstaMuerta = false;
    },
    onFin: (como: FinDeFrase) => {
      if (como === "nunca-arranco") anotarFalla("el navegador aceptó la frase pero nunca la reprodujo");
      seguir();
    },
  });

  // `hablar` devolvió false: no hay síntesis en este navegador. No se llama a
  // `onFin`, así que la cola tiene que avanzar desde acá o queda trabada.
  if (!ok) {
    anotarFalla("este navegador no tiene síntesis de voz");
    seguir();
  }
}

function anotarFalla(motivo: string): void {
  fallasSeguidas += 1;
  if (fallasSeguidas < FALLAS_PARA_DARLA_POR_MUERTA || yaAvisamosQueEstaMuerta) return;
  yaAvisamosQueEstaMuerta = true;
  for (const cb of oyentesDeFalla) {
    try { cb(motivo); } catch { /* un oyente roto no puede callar al resto */ }
  }
}

/**
 * Encola un aviso hablado.
 *
 * @param persona   a quién se refiere; es la clave por la que se agrupa.
 * @param predicado lo que le pasa, SIN el nombre: "tiene la cámara apagada".
 *                  Se junta con los otros predicados de la misma persona.
 */
export function encolarVoz(persona: string, predicado: string, opciones?: { volumen?: number }): void {
  if (!persona || !predicado) return;
  const previo = pendientes.get(persona);
  if (previo) {
    // Mismo problema dos veces en el mismo lote: no se repite.
    if (!previo.predicados.includes(predicado)) previo.predicados.push(predicado);
  } else {
    pendientes.set(persona, { persona, predicados: [predicado], volumen: opciones?.volumen });
  }
  if (temporizadorLote === null) {
    temporizadorLote = window.setTimeout(vaciarLote, VENTANA_LOTE_MS);
  }
}

/** Solo para tests. */
export function _reiniciarColaDeVoz(): void {
  if (temporizadorLote !== null) { window.clearTimeout(temporizadorLote); temporizadorLote = null; }
  pendientes = new Map();
  cola = [];
  hablando = false;
  fallasSeguidas = 0;
  yaAvisamosQueEstaMuerta = false;
  oyentesDeFalla.clear();
}
