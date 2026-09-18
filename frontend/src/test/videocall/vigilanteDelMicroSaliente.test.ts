// EL VIGILANTE DEL MICRÓFONO QUE DEJÓ DE SALIR AL AIRE.
//
// Mónica Duque, 18/09/2026: "al abrir el micrófono y después silenciarlo ya nos
// quedábamos sin audio y debíamos salir e ingresar de nuevo".
//
// El audio ENTRANTE ya tenía un vigilante que corre cada 3 s y se repara solo;
// el SALIENTE no tenía ninguno. Este es su gemelo.
//
// ⚠️ SU MODO DE FALLO PELIGROSO NO ES NO REPARAR: ES REPARAR DE MÁS. Reparar
// significa pedirle el micrófono al sistema otra vez, y eso corta la voz medio
// segundo, rearma la cadena de cancelación de ruido y puede fallar y dejar una
// pista muerta. Por eso la decisión es pura y por eso casi todas estas pruebas
// son sobre los TOPES, no sobre la detección.
import { describe, it, expect } from "vitest";
import {
  microNoEstaSaliendo,
  decidirSiRepararElMicro,
  MEMORIA_VIGILANTE_VACIA,
  TICKS_ROTO_ANTES_DE_REPARAR,
  TICKS_SOSPECHA_ANTES_DE_REPARAR,
  TICKS_SANOS_PARA_PERDONAR,
  MAX_REPARACIONES_SOLAS,
  MAX_REPARACIONES_POR_LLAMADA,
  ESPERA_ENTRE_REPARACIONES_MS,
  REPARACION_VENCE_MS,
  type SalidaDelMicro,
  type MemoriaDelVigilante,
} from "@/lib/audioDeLaLlamada";

const sano: SalidaDelMicro = {
  conectado: true,
  micEncendido: true,
  hayPista: true,
  upstreamPausado: false,
  estadoDeLaPista: "live",
  silenciadaPorElSistema: false,
};
/** Roto sin ninguna duda: la pista murió. */
const muerta: SalidaDelMicro = { ...sano, estadoDeLaPista: "ended" };
/** Solo sospechoso: el SISTEMA lo marcó `muted`. De esto el navegador se
 *  recupera solo muy seguido — lo dispara compartir pantalla con audio. */
const sospechoso: SalidaDelMicro = { ...sano, silenciadaPorElSistema: true };

const PASO = 3000; // el intervalo real del vigilante

/** Corre el vigilante N vueltas. `estadoEn` decide qué ve en cada vuelta. */
const correr = (
  n: number,
  estadoEn: (i: number) => SalidaDelMicro,
  { terminaLaReparacion = true } = {},
) => {
  let memoria: MemoriaDelVigilante = { ...MEMORIA_VIGILANTE_VACIA };
  let reparaciones = 0;
  for (let i = 0; i < n; i++) {
    const r = decidirSiRepararElMicro(estadoEn(i), memoria, 1_000_000 + i * PASO);
    memoria = r.memoria;
    if (r.reparar) {
      reparaciones++;
      // El hook pone `reparandoDesde: 0` cuando la promesa se asienta.
      if (terminaLaReparacion) memoria = { ...memoria, reparandoDesde: 0 };
    }
  }
  return { reparaciones, memoria };
};

describe("microNoEstaSaliendo — cuándo se considera roto", () => {
  it("sano es sano", () => {
    expect(microNoEstaSaliendo(sano)).toBe(false);
  });

  it("⚠️ si la persona se silenció ELLA, no hay nada roto", () => {
    // El falso positivo que convertiría el vigilante en un enemigo: pelearle el
    // micrófono a alguien que decidió callarse.
    expect(microNoEstaSaliendo({ ...muerta, micEncendido: false })).toBe(false);
    expect(microNoEstaSaliendo({ ...sano, micEncendido: false, upstreamPausado: true })).toBe(false);
  });

  it("no hace nada si no está conectada o no hay pista", () => {
    expect(microNoEstaSaliendo({ ...muerta, conectado: false })).toBe(false);
    expect(microNoEstaSaliendo({ ...muerta, hayPista: false })).toBe(false);
  });

  it("detecta los tres caminos que dejan a alguien mudo sin avisar", () => {
    expect(microNoEstaSaliendo({ ...sano, upstreamPausado: true })).toBe(true);
    expect(microNoEstaSaliendo(muerta)).toBe(true);
    expect(microNoEstaSaliendo(sospechoso)).toBe(true);
  });
});

describe("los umbrales, separados por gravedad", () => {
  it("el caso inequívoco espera 3 vueltas (6-9 s reales)", () => {
    // Menos que eso pisaría el debounce de 5 s que LiveKit espera antes de
    // rendirse: le romperíamos su propia recuperación.
    expect(TICKS_ROTO_ANTES_DE_REPARAR).toBe(3);
    expect(correr(2, () => muerta).reparaciones).toBe(0);
    expect(correr(3, () => muerta).reparaciones).toBe(1);
  });

  it("⚠️ el caso SOSPECHOSO (`muted` del sistema) espera MUCHO más", () => {
    // Es el que dispara compartir pantalla con audio, y el navegador se
    // recupera solo la mayoría de las veces. Reparar ahí a los 6 s mataba la
    // recuperación natural y podía dejar la pista muerta.
    expect(TICKS_SOSPECHA_ANTES_DE_REPARAR).toBeGreaterThanOrEqual(8);
    expect(correr(7, () => sospechoso).reparaciones).toBe(0);
    expect(correr(8, () => sospechoso).reparaciones).toBe(1);
  });

  it("⚠️ SIGUE siendo sospechoso aunque LiveKit ya haya vaciado el emisor", () => {
    // ESTA es la línea de tiempo REAL y por poco se nos escapa. LiveKit pausa
    // el emisor 5 s después del MISMO evento `mute`, así que a partir de la
    // segunda vuelta el estado es `muted` Y `upstreamPausado`. Si la gravedad
    // se decidiera por el síntoma, ahí el umbral caería de 8 a 3 y
    // repararíamos a los 6-9 s: justo lo que este umbral existe para evitar.
    const lineaReal = (i: number): SalidaDelMicro =>
      ({ ...sano, silenciadaPorElSistema: true, upstreamPausado: i >= 2 });
    expect(correr(7, lineaReal).reparaciones).toBe(0);
    expect(correr(8, lineaReal).reparaciones).toBe(1);
  });
});

describe("los topes — que es lo que impide que esto sea peor que el bug", () => {
  it("roto para siempre: 3 reparaciones en una hora, no más", () => {
    expect(correr(1200, () => muerta).reparaciones).toBe(MAX_REPARACIONES_SOLAS);
  });

  it("⚠️ EL MICRO QUE TITILA tampoco entra en bucle", () => {
    // ESTE es el caso que importa y el que faltaba: se rompe, se repara, anda
    // unos segundos, se vuelve a romper. Si los intentos se perdonaran con una
    // sola vuelta sana, serían ~180 getUserMedia por hora. Se perdonan solo
    // tras un minuto sano seguido.
    const { reparaciones } = correr(1200, (i) => (i % 6 < 3 ? muerta : sano));
    expect(reparaciones).toBe(MAX_REPARACIONES_SOLAS);
  });

  it("⚠️ ni con el patrón adversario justo: hay un techo de POR VIDA", () => {
    // El perdón por racha sigue dejando pasar ~98 reparaciones por hora si el
    // micro se rompe 17 vueltas y se cura 20, una y otra vez. El techo de por
    // vida es lo que lo corta: ocho intentos en una reunión ya dicen que esto
    // no lo arregla pedir el micrófono otra vez.
    const { reparaciones } = correr(1200, (i) => (i % 37 < 17 ? muerta : sano));
    expect(reparaciones).toBe(MAX_REPARACIONES_POR_LLAMADA);
    expect(MAX_REPARACIONES_POR_LLAMADA).toBe(8);
  });

  it("respeta la espera de 20 s entre intentos", () => {
    expect(ESPERA_ENTRE_REPARACIONES_MS).toBe(20_000);
    // 3+7 vueltas = 30 s: entran dos intentos como mucho.
    expect(correr(10, () => muerta).reparaciones).toBeLessThanOrEqual(2);
  });

  it("no dispara otra mientras la anterior sigue en curso", () => {
    const enCurso: MemoriaDelVigilante = {
      ...MEMORIA_VIGILANTE_VACIA, ticksRoto: 9, reparaciones: 1, reparandoDesde: 10_000_000,
    };
    const r = decidirSiRepararElMicro(muerta, enCurso, 10_005_000);
    expect(r.reparar).toBe(false);
  });

  it("⚠️ una reparación COLGADA no mata al vigilante: vence a los 30 s", () => {
    // Sin esto, una promesa que nunca se asienta (el cerrojo de LiveKit, un
    // getUserMedia que no vuelve) dejaba el vigilante inútil el resto de la
    // llamada — peor que no tenerlo.
    expect(REPARACION_VENCE_MS).toBe(30_000);
    const colgada: MemoriaDelVigilante = {
      ...MEMORIA_VIGILANTE_VACIA, ticksRoto: 9, reparaciones: 1,
      ultimaReparacion: 1_000_000, reparandoDesde: 1_000_000,
    };
    const antes = decidirSiRepararElMicro(muerta, colgada, 1_000_000 + 25_000);
    expect(antes.reparar).toBe(false);
    const despues = decidirSiRepararElMicro(muerta, colgada, 1_000_000 + 35_000);
    expect(despues.reparar).toBe(true);
  });
});

describe("el perdón de intentos", () => {
  it("⚠️ hace falta UN MINUTO sano, no una vuelta", () => {
    expect(TICKS_SANOS_PARA_PERDONAR).toBe(20);
    const gastada: MemoriaDelVigilante = {
      ...MEMORIA_VIGILANTE_VACIA, reparaciones: MAX_REPARACIONES_SOLAS,
    };
    // 19 vueltas sanas: todavía no se perdona.
    let m = gastada;
    for (let i = 0; i < 19; i++) m = decidirSiRepararElMicro(sano, m, 1000 + i * PASO).memoria;
    expect(m.reparaciones).toBe(MAX_REPARACIONES_SOLAS);
    // La vuelta 20 sí.
    m = decidirSiRepararElMicro(sano, m, 1000 + 20 * PASO).memoria;
    expect(m.reparaciones).toBe(0);
  });

  it("estar sano limpia el contador de vueltas rotas enseguida", () => {
    const r = decidirSiRepararElMicro(sano, { ...MEMORIA_VIGILANTE_VACIA, ticksRoto: 2 }, 1000);
    expect(r.memoria.ticksRoto).toBe(0);
  });
});
