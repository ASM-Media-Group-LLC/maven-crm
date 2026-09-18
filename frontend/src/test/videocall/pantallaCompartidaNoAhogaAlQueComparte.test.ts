// COMPARTIR PANTALLA NO PUEDE AHOGAR AL QUE COMPARTE.
//
// Medido con getStats sobre una llamada REAL (18/09/2026, Jhon ↔ Juan Pachas):
// la pantalla llegaba a 2,5 cuadros por segundo gastando 20 kbps de un
// presupuesto de 2.500, con CERO paquetes perdidos y 79 ms de ping. La red
// estaba limpia; el que no daba abasto era quien comparte. Y el 26% del audio
// de esa llamada tuvo que ser inventado por el corrector de pérdidas: la voz se
// cortaba cada vez que su máquina se saturaba.
//
// La causa: la pantalla se publicaba SIN opciones, así que heredaba el
// `simulcast: true` de publishDefaults —escrito pensando en cámaras— y LiveKit
// armaba DOS codificaciones de pantalla en paralelo (1080p@15 y 540p@15),
// encima de las TRES de la cámara.
//
// Estas guardas cuidan las tres decisiones que se tomaron, porque las tres son
// fáciles de deshacer sin querer en un refactor y ninguna falla de forma
// ruidosa: si se rompen, simplemente vuelve a irse a 2 fps.
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(["/frontend/src/hooks/useLiveKit.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

// Sin esto, una guarda que no carga nada pasa en verde sin comprobar nada.
describe("el fuente se cargó de verdad", () => {
  it("useLiveKit.ts está y tiene lo que se espera de él", () => {
    const s = leer("useLiveKit.ts");
    expect(s.length).toBeGreaterThan(1000);
    expect(s).toContain("setScreenShareEnabled");
  });
});

describe("la pantalla compartida se publica con su propio perfil", () => {
  const s = leer("useLiveKit.ts");

  it("⚠️ setScreenShareEnabled recibe un TERCER argumento", () => {
    // Sin el tercer argumento hereda el simulcast de cámaras, que es el bug.
    // El `[^)]*` evita que un salto de línea o un espacio de más lo den por roto.
    expect(s).toMatch(/setScreenShareEnabled\(\s*newState,[^)]*PUBLICACION_DE_PANTALLA\s*\)/);
  });

  it("la capa chica es barata: 360p a 3 fps, no 540p a 15", () => {
    expect(s).toMatch(/screenShareSimulcastLayers:\s*\[\s*ScreenSharePresets\.h360fps3\s*\]/);
  });

  it("⚠️ NO se apaga el simulcast del todo", () => {
    // Apagarlo es lo que uno haría de primera y es peor: sin capa chica, cada
    // miniatura del tablero de Cowork se trae el 1080p entero y el que sufre
    // pasa a ser el supervisor que mira varias pantallas a la vez.
    const perfil = s.slice(
      s.indexOf("const PUBLICACION_DE_PANTALLA"),
      s.indexOf("const PUBLICACION_DE_PANTALLA") + 400,
    );
    expect(perfil).not.toMatch(/simulcast:\s*false/);
  });

  it("cuando no da abasto achica la imagen en vez de congelarla", () => {
    // Es el fallo exacto que se midió: se aferró a los 540p y se desplomó a
    // 2,5 fps. Una pantalla que se achica se sigue leyendo; una congelada, no.
    expect(s).toMatch(/degradationPreference:\s*"maintain-framerate"/);
  });
});
