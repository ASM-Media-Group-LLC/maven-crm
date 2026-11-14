// LA CÁMARA SE ADAPTA AL INTERNET DE SUBIDA (Alvaro, 13/11/2026).
//
// La mayoría del equipo sube con ~1 Mbps y la cámara se publicaba siempre igual:
// 720p@30 arriba (1,7 Mbps) más 360p y 180p. Cuando alguien la miraba en grande,
// no cabía y la llamada parpadeaba. Ahora, con la subida floja (prueba real
// < 1,5 Mbps, modo ahorro o codificador limitado por ancho de banda), la capa de
// arriba baja a 360p@15 y 350 kbps, y las de abajo se aligeran
// (lib/perfilDeCamara.ts). Se aplica EN VIVO con sender.setParameters, sin
// volver a publicar, y se deshace igual.
//
// Ninguna de estas decisiones falla de forma ruidosa si se rompe: la cámara
// simplemente vuelve a pedir lo que no cabe. Por eso las guardas.
import { describe, it, expect } from "vitest";
import {
  CAMARA_INICIAL, CAMARA_LIVIANA, MINUTOS_BUENOS_PARA_VOLVER, SUBIDA_PARA_CAMARA_NORMAL_MBPS,
  copiarTopes, elegirPerfilDeCamara, escribirTopes, siguientePerfilDeCamara, topesLivianos,
  type EstadoCamara, type SenalesDeSubida, type TopeDeCodificacion,
} from "@/lib/perfilDeCamara";
import { PRUEBA_VIGENTE_MS } from "@/lib/perfilDePantalla";

const fuentes = import.meta.glob(["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/lib/perfilDeCamara.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

const sinSenales: SenalesDeSubida = { prueba: null, ahorroActivo: false, limiteCam: null, limitePant: null };
const floja: SenalesDeSubida = { ...sinSenales, prueba: { subida_mbps: 0.9, edadMs: 60_000 } };
const buena: SenalesDeSubida = { ...sinSenales, prueba: { subida_mbps: 4, edadMs: 60_000 } };

// Las codificaciones que arma LiveKit para la cámara de 720p con el perfil normal
// (publishDefaults): 180p@20 160 kbps, 360p@20 450 kbps y 720p@30 1,7 Mbps.
const normales720 = (): TopeDeCodificacion[] => [
  { scaleResolutionDownBy: 4, maxBitrate: 160_000, maxFramerate: 20 },
  { scaleResolutionDownBy: 2, maxBitrate: 450_000, maxFramerate: 20 },
  { scaleResolutionDownBy: 1, maxBitrate: 1_700_000, maxFramerate: 30 },
];

describe("los fuentes se cargaron de verdad", () => {
  it("useLiveKit.ts y perfilDeCamara.ts están y tienen lo que se espera", () => {
    expect(leer("useLiveKit.ts").length).toBeGreaterThan(1000);
    expect(leer("useLiveKit.ts")).toContain("const aplicarCamara");
    expect(leer("perfilDeCamara.ts")).toContain("export const CAMARA_LIVIANA");
  });
});

describe("qué perfil de cámara le toca a cada uno", () => {
  it("el umbral es 1,5 Mbps de subida MEDIDA, igual que la pantalla", () => {
    expect(SUBIDA_PARA_CAMARA_NORMAL_MBPS).toBe(1.5);
  });

  it("sin ninguna señal, el normal de siempre: no se baja la calidad sin evidencia", () => {
    expect(elegirPerfilDeCamara(sinSenales)).toBe("normal");
  });

  it("buena subida medida → normal; floja → liviano", () => {
    expect(elegirPerfilDeCamara(buena)).toBe("normal");
    expect(elegirPerfilDeCamara({ ...sinSenales, prueba: { subida_mbps: 1.5, edadMs: 0 } })).toBe("normal");
    expect(elegirPerfilDeCamara({ ...sinSenales, prueba: { subida_mbps: 1.49, edadMs: 0 } })).toBe("liviano");
    expect(elegirPerfilDeCamara(floja)).toBe("liviano");
  });

  it("una prueba vieja ya no decide", () => {
    expect(elegirPerfilDeCamara({ ...sinSenales, prueba: { subida_mbps: 0.5, edadMs: PRUEBA_VIGENTE_MS + 1 } })).toBe("normal");
  });

  it("el modo ahorro o el codificador limitado por ancho de banda → liviano, aunque la prueba diga bien", () => {
    expect(elegirPerfilDeCamara({ ...buena, ahorroActivo: true })).toBe("liviano");
    expect(elegirPerfilDeCamara({ ...sinSenales, limiteCam: "bandwidth" })).toBe("liviano");
    expect(elegirPerfilDeCamara({ ...sinSenales, limitePant: "bandwidth" })).toBe("liviano");
    // Limitado por CPU no es falta de internet.
    expect(elegirPerfilDeCamara({ ...sinSenales, limiteCam: "cpu" })).toBe("normal");
  });
});

describe("a mitad de llamada: baja en el acto, vuelve sin apuro", () => {
  const pasar = (e: EstadoCamara, ...s: SenalesDeSubida[]) => s.reduce(siguientePerfilDeCamara, e);

  it("una señal mala lo pasa a liviano en el mismo minuto", () => {
    expect(pasar(CAMARA_INICIAL, floja).perfil).toBe("liviano");
  });

  it("⚠️ para volver al normal hacen falta 5 minutos seguidos sin señales malas", () => {
    // Sin esta espera la limitación desaparece justo PORQUE se bajó la calidad y
    // la cámara subiría y bajaría cada minuto.
    expect(MINUTOS_BUENOS_PARA_VOLVER).toBe(5);
    const liviana = pasar(CAMARA_INICIAL, floja);
    expect(pasar(liviana, buena, buena, buena, buena).perfil).toBe("liviano");
    expect(pasar(liviana, buena, buena, buena, buena, buena).perfil).toBe("normal");
  });

  it("una señal mala en el medio reinicia la cuenta", () => {
    const liviana = pasar(CAMARA_INICIAL, floja);
    const casi = pasar(liviana, buena, buena, buena, buena);
    expect(pasar(casi, { ...sinSenales, limiteCam: "bandwidth" }, buena).perfil).toBe("liviano");
  });

  it("con buen internet nunca baja", () => {
    expect(pasar(CAMARA_INICIAL, buena, buena, sinSenales, buena).perfil).toBe("normal");
  });
});

describe("los topes del perfil liviano", () => {
  it("arriba como mucho 360p, 15 fps y 400 kbps; las de abajo, más livianas todavía", () => {
    expect(CAMARA_LIVIANA.alta.alto).toBeLessThanOrEqual(360);
    expect(CAMARA_LIVIANA.alta.maxFramerate).toBeLessThanOrEqual(15);
    expect(CAMARA_LIVIANA.alta.maxBitrate).toBeLessThanOrEqual(400_000);
    expect(CAMARA_LIVIANA.media.maxBitrate).toBeLessThan(CAMARA_LIVIANA.alta.maxBitrate);
    expect(CAMARA_LIVIANA.baja.maxBitrate).toBeLessThan(CAMARA_LIVIANA.media.maxBitrate);
    // Y la capa chica del perfil normal (180p@20, 160 kbps) queda más liviana.
    expect(CAMARA_LIVIANA.baja.maxBitrate).toBeLessThan(160_000);
    expect(CAMARA_LIVIANA.baja.maxFramerate).toBeLessThan(20);
  });

  it("cámara de 720p: arriba 360p@15 / 350 kbps, medio 360p@15 / 300 kbps, abajo 180p@10 / 80 kbps", () => {
    const t = topesLivianos(normales720(), 720);
    expect(t[2]).toEqual({ scaleResolutionDownBy: 2, maxBitrate: 350_000, maxFramerate: 15 });
    expect(t[1]).toEqual({ scaleResolutionDownBy: 2, maxBitrate: 300_000, maxFramerate: 15 });
    expect(t[0]).toEqual({ scaleResolutionDownBy: 4, maxBitrate: 80_000, maxFramerate: 10 });
    // Lo peor que puede pedir la cámara en liviano, con las tres capas a la vez:
    // ~730 kbps (antes ~2,3 Mbps).
    const total = t.reduce((s, e) => s + (e.maxBitrate ?? 0), 0);
    expect(total).toBeLessThanOrEqual(750_000);
  });

  it("⚠️ la capa del medio NO baja de 360p: es la que pide una miniatura en pantalla retina", () => {
    // Alvaro ya pidió que las miniaturas del tablero no se vean pixeladas.
    expect(CAMARA_LIVIANA.media.alto).toBe(360);
  });

  it("con fondo virtual (captura de 540p) la escala sale del alto real", () => {
    const fondo: TopeDeCodificacion[] = [
      { scaleResolutionDownBy: 3, maxBitrate: 160_000, maxFramerate: 15 },
      { scaleResolutionDownBy: 1.5, maxBitrate: 450_000, maxFramerate: 15 },
      { scaleResolutionDownBy: 1, maxBitrate: 800_000, maxFramerate: 15 },
    ];
    const t = topesLivianos(fondo, 540);
    expect(t.map((e) => e.scaleResolutionDownBy)).toEqual([3, 1.5, 1.5]); // 180p, 360p, 360p
  });

  it("una capa jamás se agranda, y sin dato de la captura se asume 720p", () => {
    const t = topesLivianos([{ scaleResolutionDownBy: 8, maxBitrate: 50_000, maxFramerate: 5 }, { scaleResolutionDownBy: 1 }], null);
    expect(t[0]).toEqual({ scaleResolutionDownBy: 8, maxBitrate: 50_000, maxFramerate: 5 });
    expect(t[1]).toEqual({ scaleResolutionDownBy: 2, maxBitrate: 350_000, maxFramerate: 15 });
  });

  it("una sola capa (sin simulcast) es la de arriba", () => {
    expect(topesLivianos([{}], 720)).toEqual([{ scaleResolutionDownBy: 2, maxBitrate: 350_000, maxFramerate: 15 }]);
  });
});

describe("aplicar y deshacer sobre el emisor", () => {
  it("aplica los topes, avisa que cambió y la segunda vez no cambia nada (no se llama a setParameters)", () => {
    const enc = normales720();
    const originales = enc.map(copiarTopes);
    expect(escribirTopes(enc, topesLivianos(originales, 720))).toBe(true);
    expect(enc[2].scaleResolutionDownBy).toBe(2);
    expect(escribirTopes(enc, topesLivianos(originales, 720))).toBe(false);
  });

  it("al volver al normal queda EXACTAMENTE como estaba (incluso lo que no tenía valor)", () => {
    const enc: TopeDeCodificacion[] = [{ scaleResolutionDownBy: 4, maxBitrate: 160_000 }, { maxBitrate: 1_700_000, maxFramerate: 30 }];
    const originales = enc.map(copiarTopes);
    escribirTopes(enc, topesLivianos(originales, 720));
    expect(enc[1].scaleResolutionDownBy).toBe(2);
    expect(escribirTopes(enc, originales)).toBe(true);
    expect(enc).toEqual([{ scaleResolutionDownBy: 4, maxBitrate: 160_000 }, { maxBitrate: 1_700_000, maxFramerate: 30 }]);
    expect("scaleResolutionDownBy" in enc[1]).toBe(false);
  });
});

describe("cómo lo usa la llamada (useLiveKit.ts)", () => {
  const s = leer("useLiveKit.ts");

  it("⚠️ el perfil normal de la cámara no cambió: captura 720p y capas 180p/360p", () => {
    // Bajarle la calidad a TODOS no es lo pedido: solo a quien tiene la subida floja.
    expect(s).toMatch(/videoCaptureDefaults:\s*\{[\s\S]{0,400}resolution:\s*VideoPresets\.h720\.resolution/);
    expect(s).toMatch(/videoSimulcastLayers:\s*\[\s*VideoPresets\.h180,\s*VideoPresets\.h360,/);
  });

  it("se aplica en vivo sobre el emisor de la cámara, sin volver a publicar", () => {
    const f = s.slice(s.indexOf("const aplicarCamara = async"), s.indexOf("aplicarCamaraRef.current = aplicarCamara;"));
    expect(f).toContain("getTrackPublication(Track.Source.Camera)");
    expect(f).toContain("topesLivianos(");
    expect(f).toContain("escribirTopes(");
    expect(f).toContain("sender.setParameters(params)");
    expect(f).not.toMatch(/unpublishTrack|publishTrack\(/);
  });

  it("se vuelve a decidir con cada muestra (ahí llegan la prueba de velocidad y el modo ahorro)", () => {
    expect(s).toContain("siguientePerfilDeCamara(perfilCamaraRef.current, senalesDeSubida(muestra))");
    expect(s).toMatch(/perfil_cam: perfilCam/);
  });

  it("la cámara recién publicada sale con el perfil que le toca", () => {
    const h = s.slice(s.indexOf("room.on(RoomEvent.LocalTrackPublished"), s.indexOf("room.on(RoomEvent.LocalTrackUnpublished"));
    expect(h).toContain("Track.Source.Camera");
    expect(h).toContain("elegirPerfilDeCamara(senalesDeSubida(ultimaMuestraRef.current))");
    expect(h).toContain("aplicarCamaraRef.current?.()");
  });

  it("⚠️ el modo ahorro ya no apaga capas con setPublishingQuality (dynacast las volvía a prender y pisaba el perfil)", () => {
    expect(s).not.toMatch(/setPublishingQuality(\?\.)?\(/);
  });
});
