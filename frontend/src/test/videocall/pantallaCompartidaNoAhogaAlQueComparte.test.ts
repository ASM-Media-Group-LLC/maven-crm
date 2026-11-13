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
// 13/11/2026 (Alvaro): además se ADAPTA al internet de quien comparte. Con buena
// subida, el perfil de siempre (1080p + capa chica 720p@5); con la subida floja
// (prueba real < 1,5 Mbps, modo ahorro o codificador limitado por ancho de
// banda), un perfil liviano de UNA capa 720p@5 a 500 kbps (lib/perfilDePantalla.ts).
//
// Estas guardas cuidan las decisiones, porque son fáciles de deshacer sin querer
// en un refactor y ninguna falla de forma ruidosa: si se rompen, simplemente
// vuelve a irse a 2 fps o a cortarse la llamada del que tiene poca subida.
import { describe, it, expect } from "vitest";
import {
  CAPTURA_LIVIANA, PUBLICACION_DE_PANTALLA, PUBLICACION_DE_PANTALLA_LIVIANA, PRUEBA_VIGENTE_MS,
  SUBIDA_PARA_PANTALLA_NORMAL_MBPS, elegirPerfilDePantalla, opcionesDePantalla,
} from "@/lib/perfilDePantalla";

const fuentes = import.meta.glob(["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/lib/perfilDePantalla.ts"], {
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
describe("los fuentes se cargaron de verdad", () => {
  it("useLiveKit.ts y perfilDePantalla.ts están y tienen lo que se espera", () => {
    expect(leer("useLiveKit.ts").length).toBeGreaterThan(1000);
    expect(leer("useLiveKit.ts")).toContain("setScreenShareEnabled");
    expect(leer("perfilDePantalla.ts")).toContain("const PUBLICACION_DE_PANTALLA");
  });
});

describe("la pantalla compartida se publica con su propio perfil", () => {
  const s = leer("useLiveKit.ts");

  it("⚠️ setScreenShareEnabled recibe un TERCER argumento: la publicación del perfil elegido", () => {
    // Sin el tercer argumento hereda el simulcast de cámaras, que es el bug.
    expect(s).toMatch(/setScreenShareEnabled\(\s*newState,\s*pantalla\.captura,\s*pantalla\.publicacion\s*\)/);
    expect(s).toMatch(/const pantalla = opcionesDePantalla\(perfil, captura\)/);
  });

  it("el perfil se elige al EMPEZAR a compartir, con la prueba real, el modo ahorro y la última muestra", () => {
    const toggle = s.slice(s.indexOf("const toggleScreenShare"), s.indexOf("const toggleScreenShare") + 4000);
    expect(toggle).toContain("elegirPerfilDePantalla(");
    expect(toggle).toContain("ultimaPruebaRef.current");
    expect(toggle).toContain("ahorroRef.current.activo");
    expect(toggle).toContain("ultimaMuestraRef.current?.limite_cam");
  });

  it("perfil normal: la capa chica se lee y no ahoga — 720p a 5 fps (no 540p a 15, no 360p a 3)", () => {
    // 13/11/2026 (Alvaro): a 360p@3 las miniaturas del tablero se veían
    // pixeladas y a saltos. 720p@5 se lee en chiquito y cuesta menos que el
    // 540p@15 que ahogaba al que comparte (≈4,6 M px/s contra 7,5 M px/s).
    const p = leer("perfilDePantalla.ts");
    expect(p).toMatch(/screenShareSimulcastLayers:\s*\[\s*ScreenSharePresets\.h720fps5\s*\]/);
    expect(p).not.toMatch(/ScreenSharePresets\.h540fps15|ScreenSharePresets\.h360fps3\]/);
  });

  it("⚠️ el perfil normal NO apaga el simulcast", () => {
    // Apagarlo es lo que uno haría de primera y es peor: sin capa chica, cada
    // miniatura del tablero de Cowork se trae el 1080p entero y el que sufre
    // pasa a ser el supervisor que mira varias pantallas a la vez.
    expect(PUBLICACION_DE_PANTALLA.simulcast).not.toBe(false);
    expect(PUBLICACION_DE_PANTALLA.screenShareSimulcastLayers?.length).toBe(1);
  });

  it("perfil liviano: UNA capa de 720p como mucho, 5 fps y 500 kbps — nunca más que lo que ya recibe una miniatura", () => {
    // Una sola capa a propósito: lo más grande que se trae una miniatura sigue
    // siendo 720p@5, igual que la capa chica del perfil normal.
    expect(PUBLICACION_DE_PANTALLA_LIVIANA.simulcast).toBe(false);
    expect(PUBLICACION_DE_PANTALLA_LIVIANA.screenShareEncoding?.maxFramerate).toBeLessThanOrEqual(5);
    expect(PUBLICACION_DE_PANTALLA_LIVIANA.screenShareEncoding?.maxBitrate).toBeLessThanOrEqual(600_000);
    expect(CAPTURA_LIVIANA.resolution?.width).toBeLessThanOrEqual(1280);
    expect(CAPTURA_LIVIANA.resolution?.height).toBeLessThanOrEqual(720);
  });

  it("los dos perfiles, cuando no dan abasto, achican la imagen en vez de congelarla", () => {
    // Es el fallo exacto que se midió: se aferró a los 540p y se desplomó a
    // 2,5 fps. Una pantalla que se achica se sigue leyendo; una congelada, no.
    expect(PUBLICACION_DE_PANTALLA.degradationPreference).toBe("maintain-framerate");
    expect(PUBLICACION_DE_PANTALLA_LIVIANA.degradationPreference).toBe("maintain-framerate");
  });
});

describe("qué perfil le toca a cada uno", () => {
  const sinSenales = { prueba: null, ahorroActivo: false, limiteCam: null, limitePant: null };

  it("el umbral es 1,5 Mbps de subida MEDIDA", () => {
    expect(SUBIDA_PARA_PANTALLA_NORMAL_MBPS).toBe(1.5);
  });

  it("sin ninguna señal, el normal de siempre: no se baja la calidad sin evidencia", () => {
    expect(elegirPerfilDePantalla(sinSenales)).toBe("normal");
  });

  it("buena subida medida → normal; floja → liviano", () => {
    expect(elegirPerfilDePantalla({ ...sinSenales, prueba: { subida_mbps: 4.2, edadMs: 60_000 } })).toBe("normal");
    expect(elegirPerfilDePantalla({ ...sinSenales, prueba: { subida_mbps: 1.5, edadMs: 60_000 } })).toBe("normal");
    expect(elegirPerfilDePantalla({ ...sinSenales, prueba: { subida_mbps: 1.1, edadMs: 60_000 } })).toBe("liviano");
  });

  it("una prueba vieja ya no decide", () => {
    expect(elegirPerfilDePantalla({ ...sinSenales, prueba: { subida_mbps: 0.8, edadMs: PRUEBA_VIGENTE_MS + 1 } })).toBe("normal");
  });

  it("el modo ahorro o el codificador limitado por ancho de banda → liviano, aunque la prueba haya dado bien", () => {
    const buena = { subida_mbps: 5, edadMs: 60_000 };
    expect(elegirPerfilDePantalla({ ...sinSenales, prueba: buena, ahorroActivo: true })).toBe("liviano");
    expect(elegirPerfilDePantalla({ ...sinSenales, limiteCam: "bandwidth" })).toBe("liviano");
    expect(elegirPerfilDePantalla({ ...sinSenales, limitePant: "bandwidth" })).toBe("liviano");
    // Limitado por CPU no es falta de internet: eso no cambia el perfil.
    expect(elegirPerfilDePantalla({ ...sinSenales, limiteCam: "cpu" })).toBe("normal");
  });

  it("el liviano también pide la captura chica; el normal deja la captura como venía", () => {
    const base = { audio: true, video: { displaySurface: "monitor" as const } };
    expect(opcionesDePantalla("normal", base)).toEqual({ captura: base, publicacion: PUBLICACION_DE_PANTALLA });
    const liv = opcionesDePantalla("liviano", base);
    expect(liv.publicacion).toBe(PUBLICACION_DE_PANTALLA_LIVIANA);
    expect(liv.captura).toMatchObject({ audio: true, video: { displaySurface: "monitor" }, resolution: { width: 1280, height: 720, frameRate: 5 } });
  });
});
