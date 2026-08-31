import { describe, it, expect } from "vitest";
import {
  tocaAvisar,
  olvidarAusentes,
  REPETIR_AVISO_SUPERVISOR_MS,
  type MarcasAviso,
} from "@/lib/avisosSupervisor";
import { AVISAR_COORDINADOR_MS } from "@/hooks/useFaceNudge";

// EL BUG QUE ESTO CUIDA (31/08/2026): los avisos del hub sonaban UNA sola vez
// por persona y por episodio, y no volvían a sonar hasta que la persona
// corregía el problema o se iba de la sesión. Alguien tres horas fuera de
// cuadro se anunciaba en el minuto tres y después silencio absoluto, con el
// supervisor creyendo que todo estaba en orden.
//
// Peor: la marca se pone ANTES de que suene nada, y ni la voz ni la campanita
// avisan si de verdad sonaron. Si esa única bala salía con el audio bloqueado
// —Chromium lo bloquea después de cada recarga hasta el primer clic— el
// episodio quedaba marcado y no sonaba en todo el turno.
//
// Los avisos del propio chatter SÍ se repetían (cada 90-120 s), y esa
// asimetría fue justo lo que hizo pensar que el canal estaba roto cuando lo
// que pasaba era que la alerta ya se había gastado.

describe("los avisos del supervisor se repiten mientras el problema siga", () => {
  it("la primera vez siempre avisa", () => {
    const marcas: MarcasAviso = new Map();
    expect(tocaAvisar(marcas, "ana", 1_000_000)).toBe(true);
  });

  it("NO vuelve a avisar en cada tic — el reloj del tablero corre cada segundo", () => {
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    expect(tocaAvisar(marcas, "ana", t0)).toBe(true);
    // Los siguientes sesenta tics de un segundo no pueden disparar nada: sería
    // una alarma por segundo por persona.
    for (let i = 1; i <= 60; i++) {
      expect(tocaAvisar(marcas, "ana", t0 + i * 1_000)).toBe(false);
    }
  });

  it("vuelve a avisar cuando pasó la ventana de repetición", () => {
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    expect(tocaAvisar(marcas, "ana", t0)).toBe(true);
    expect(tocaAvisar(marcas, "ana", t0 + REPETIR_AVISO_SUPERVISOR_MS - 1)).toBe(false);
    expect(tocaAvisar(marcas, "ana", t0 + REPETIR_AVISO_SUPERVISOR_MS)).toBe(true);
  });

  it("un problema que dura una hora avisa varias veces, no una", () => {
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    let avisos = 0;
    // Una hora de tics de un segundo con la persona siempre en falta.
    for (let s = 0; s <= 3_600; s++) {
      if (tocaAvisar(marcas, "ana", t0 + s * 1_000)) avisos++;
    }
    // Antes de este arreglo esto valía exactamente 1 y el resto de la hora era
    // silencio.
    expect(avisos).toBe(1 + Math.floor(3_600_000 / REPETIR_AVISO_SUPERVISOR_MS));
    expect(avisos).toBeGreaterThan(1);
  });

  it("un aviso que salió MUDO se reintenta solo: ya no se pierde el episodio", () => {
    // La marca se pone aunque el audio esté bloqueado (nadie verifica que haya
    // sonado). Lo que salva el caso es que vuelve a tocar más tarde, cuando el
    // supervisor ya hizo algún clic y el navegador dejó sonar.
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    tocaAvisar(marcas, "ana", t0);                                  // salió mudo
    expect(tocaAvisar(marcas, "ana", t0 + REPETIR_AVISO_SUPERVISOR_MS)).toBe(true);
  });

  it("cada persona lleva su propio reloj", () => {
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    expect(tocaAvisar(marcas, "ana", t0)).toBe(true);
    // Beto entra en falta un minuto después: le toca YA, no tiene que esperar
    // el turno de Ana.
    expect(tocaAvisar(marcas, "beto", t0 + 60_000)).toBe(true);
    expect(tocaAvisar(marcas, "ana", t0 + 60_000)).toBe(false);
  });

  it("si corrige y vuelve a fallar, se le avisa de inmediato", () => {
    const marcas: MarcasAviso = new Map();
    const t0 = 1_000_000;
    tocaAvisar(marcas, "ana", t0);
    marcas.delete("ana");                    // volvió a cuadro / compartió
    // Recae a los diez segundos: es un episodio NUEVO, no la continuación del
    // anterior, así que no arrastra la espera.
    expect(tocaAvisar(marcas, "ana", t0 + 10_000)).toBe(true);
  });

  it("no le mueve el reloj a quien está bien: solo se llama con el problema confirmado", () => {
    const marcas: MarcasAviso = new Map();
    tocaAvisar(marcas, "ana", 1_000_000);
    expect(marcas.has("beto")).toBe(false);
  });
});

describe("las marcas con reloj olvidan a quien se fue", () => {
  it("olvidarAusentes funciona con Map, no solo con Set", () => {
    const marcas: MarcasAviso = new Map([["ana", 1_000_000], ["beto", 1_000_000]]);
    olvidarAusentes(marcas, { ana: {} });     // beto cerró Cowork
    expect(marcas.has("beto")).toBe(false);
    expect(marcas.has("ana")).toBe(true);
  });

  it("quien se va estando en falta vuelve a disparar el aviso al reaparecer", () => {
    // Es el caso que le faltaba al aviso de PAUSA: era el único de los tres que
    // no purgaba, así que quien se desconectaba estando pasado quedaba marcado
    // y su próxima pausa excedida era muda.
    const marcas: MarcasAviso = new Map([["beto", 1_000_000]]);
    olvidarAusentes(marcas, {});                       // se fue
    expect(tocaAvisar(marcas, "beto", 1_000_030)).toBe(true);   // volvió, 30 s después
  });
});

describe("la cadencia del supervisor es más espaciada que la del chatter", () => {
  it("el supervisor no puede repetir más seguido que la propia persona", () => {
    // El chatter se vigila a sí mismo (uno); el supervisor mira nueve salas, así
    // que acá el ruido se multiplica por la gente en falta. Si esto se
    // invirtiera, el hub sería inusable y terminarían silenciándolo — que es la
    // peor forma de perder una alerta.
    expect(REPETIR_AVISO_SUPERVISOR_MS).toBeGreaterThan(120_000);
  });

  it("la repetición nunca llega antes que el primer aviso", () => {
    expect(REPETIR_AVISO_SUPERVISOR_MS).toBeGreaterThanOrEqual(AVISAR_COORDINADOR_MS);
  });
});
