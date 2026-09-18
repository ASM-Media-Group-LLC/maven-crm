// DOS TRAMPAS QUE YA NOS MORDIERON UNA VEZ CADA UNA.
//
// (1) `needsReAcquisition` de LiveKit incluye `!enabled`, y silenciar el micro
//     pone `enabled = false`. O sea que después de CUALQUIER silencio es
//     siempre verdadera. Usarla como guarda —lo que hicimos el 14/09— convierte
//     el caso raro en el camino de TODOS los desmuteos: cada uno mata la pista
//     y le pide el micrófono al sistema otra vez. Si ese pedido falla, queda
//     una pista muerta en el emisor y NO se emite ningún evento de los que
//     vigilamos. Es lo que reportó Mónica el 18/09.
//
// (2) El procesador de cancelación de ruido recibe un `MediaStreamTrack`, no un
//     `LocalTrack`. Con la firma mentirosa, el cuerpo hacía
//     `track.mediaStreamTrack` → `undefined` → reventaba SIEMPRE, y la
//     cancelación de ruido nunca estuvo puesta en una llamada. El compilador no
//     podía verlo porque la anotación mentía y los llamadores castean a `any`.
//
// Las dos se deshacen sin ruido en un refactor y ninguna falla de forma
// visible: simplemente deja de haber sonido para alguien.
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(
  ["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/lib/noise-suppression-processor.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

// Sin esto, una guarda que no carga nada pasa en verde sin comprobar nada.
describe("los fuentes se cargaron de verdad", () => {
  it("los dos archivos están", () => {
    expect(Object.keys(fuentes)).toHaveLength(2);
    expect(leer("useLiveKit.ts").length).toBeGreaterThan(1000);
    expect(leer("noise-suppression-processor.ts")).toContain("armarCadenaNC");
  });
});

describe("(1) el micrófono no se vuelve a pedir en cada desmuteo", () => {
  const s = leer("useLiveKit.ts");

  it("⚠️ NO se usa `needsReAcquisition` como guarda en ningún lado", () => {
    // Es la trampa: parece decir «solo si hace falta» y dice «siempre».
    const sinComentarios = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).not.toContain("needsReAcquisition");
  });

  it("se decide mirando la pista CRUDA, no la procesada", () => {
    // Con la cancelación de ruido puesta, `mediaStreamTrack` es la salida del
    // filtro: la fabricamos nosotros y nunca se marca `muted`.
    expect(s).toContain("_mediaStreamTrack");
    expect(s).toMatch(/readyState !== "live" \|\| cruda\.muted/);
  });

  it("⚠️ el fallo deja de ser mudo: avisa en pantalla, no solo en consola", () => {
    // Antes eran un console.warn y un console.error, y la persona tocaba el
    // botón del micro sin que pasara absolutamente nada visible.
    expect(s).toContain("avisarMicroIrrecuperable");
    const usos = s.match(/avisarMicroIrrecuperable\(\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
  });
});

describe("(2) la cancelación de ruido recibe lo que LiveKit le pasa de verdad", () => {
  const s = leer("noise-suppression-processor.ts");

  it("⚠️ init y restart declaran MediaStreamTrack, no LocalTrack", () => {
    expect(s).toMatch(/async init\(\{ track \}: \{ track: MediaStreamTrack;/);
    expect(s).toMatch(/async restart\(\{ track \}: \{ track: MediaStreamTrack;/);
    // Sin comentarios: el comentario del arreglo CITA la firma vieja a propósito.
    const sinComentarios = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).not.toContain("LocalTrack<Track.Kind>");
  });

  it("⚠️ NI init NI restart pueden tirar: eso dejaría gente MUDA", () => {
    // LiveKit llama a restart() DENTRO de setMediaStreamTrack, ANTES del
    // sender.replaceTrack. Si tiramos ahí, el replaceTrack nunca corre y el
    // emisor se queda con la pista vieja, que ya paramos. Dejando
    // processedTrack sin definir, LiveKit publica la CRUDA: ruido, no silencio.
    // ⚠️ Acotado hasta `destroy()`: sin el corte, la cadena que se busca abajo
    // también existe en destroy() y la prueba pasaría aunque alguien borrara la
    // línea del catch, que es la única razón por la que sale la pista cruda.
    const cuerpo = s.slice(s.indexOf("private async armar("), s.indexOf("async destroy()"));
    expect(cuerpo).toMatch(/catch \(e\) \{/);
    expect(cuerpo).toContain("this.processedTrack = undefined;");
  });

  it("⚠️ restart es NO DESTRUCTIVO: arma la nueva antes de soltar la vieja", () => {
    const restart = s.slice(s.indexOf("async restart("), s.indexOf("private async armar("));
    // El orden importa: si `destruir()` fuera primero y armar fallara, no
    // quedaría a qué volver.
    expect(restart.indexOf("await this.armar(track)")).toBeLessThan(restart.indexOf("destruir()"));
  });

  it("el AudioContext se cierra aunque falle la descarga del worklet", () => {
    // `addModule` es la única llamada de RED de la cadena y no tenía ninguna
    // protección: un 404 tras un deploy dejaba un contexto de 48 kHz vivo.
    const bloque = s.slice(s.indexOf("let fuente:"), s.indexOf("const nodos:"));
    expect(bloque).toContain("audioWorklet.addModule");
    expect(bloque).toMatch(/catch \(e\) \{\s*try \{ await ctx\.close\(\); \}/);
  });

  it("⚠️ se pasa `track`, NO `track.mediaStreamTrack`", () => {
    expect(s).toContain("armarCadenaNC(track, this.alFallar)");
    expect(s).not.toContain("armarCadenaNC(track.mediaStreamTrack");
  });
});

describe("(3) el vigilante del saliente está enganchado y decide con la función pura", () => {
  const s = leer("useLiveKit.ts");

  it("corre en el intervalo que ya existía, sin agregar otro temporizador", () => {
    expect(s).toMatch(/refreshParticipants\(\);\s*\n\s*vigilarSalidaDelMicroRef\.current\(\);/);
  });

  it("la decisión NO vive suelta en el hook", () => {
    // Su modo de fallo peligroso es reparar EN BUCLE; eso tiene que poder
    // probarse sin una llamada de verdad.
    expect(s).toContain("decidirSiRepararElMicro");
  });
});
