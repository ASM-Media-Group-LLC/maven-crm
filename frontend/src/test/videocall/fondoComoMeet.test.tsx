import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  leerNivelDeBlur, guardarNivelDeBlur, guardarFondo, blurPorDefecto, efectoDeNivel, nivelDeEfecto,
  NIVEL_DE_BLUR_POR_DEFECTO, usaRecorteFino, cadaCuantosCuadrosSegmentar,
} from "@/lib/fondoDeLlamada";
import {
  alfaFinal, permisoDeBajada, debeBajarAlLiviano, PRESUPUESTO_RECORTE_FINO_MS, REVISIONES_LENTAS_PARA_BAJAR,
} from "@/lib/fondoFino/parametros";
import CallControls from "@/pages/messenger/videocall/CallControls";

// «El fondo borroso no es tan bueno como Meet» (Alvaro, 19/11/2026): dos niveles
// Leve/Fuerte en el menú de la cámara (Fuerte por defecto), recorte fino con el
// pelo en equipos fuertes, liviano en los flojos, y el pelo oscuro ya no se come.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const PC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const CEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia: vi.fn() },
  });
});

describe("dos niveles, guardados por navegador", () => {
  it("por defecto es Fuerte", () => {
    expect(NIVEL_DE_BLUR_POR_DEFECTO).toBe("fuerte");
    expect(leerNivelDeBlur()).toBe("fuerte");
    expect(blurPorDefecto()).toBe("blur-strong");
  });

  it("el nivel elegido se guarda y se vuelve a leer", () => {
    guardarNivelDeBlur("leve");
    expect(leerNivelDeBlur()).toBe("leve");
    expect(blurPorDefecto()).toBe("blur");
    guardarNivelDeBlur("fuerte");
    expect(leerNivelDeBlur()).toBe("fuerte");
  });

  it("elegir un difuminado desde cualquier lado guarda su nivel", () => {
    guardarFondo("blur");
    expect(leerNivelDeBlur()).toBe("leve");
    guardarFondo("none");
    expect(leerNivelDeBlur()).toBe("leve");
    guardarFondo("blur-strong");
    expect(leerNivelDeBlur()).toBe("fuerte");
  });

  it("un valor raro guardado cae a Fuerte", () => {
    localStorage.setItem("call-blur-level", "medio");
    expect(leerNivelDeBlur()).toBe("fuerte");
  });

  it("nivel ↔ efecto", () => {
    expect(efectoDeNivel("leve")).toBe("blur");
    expect(efectoDeNivel("fuerte")).toBe("blur-strong");
    expect(nivelDeEfecto("blur-strong")).toBe("fuerte");
    expect(nivelDeEfecto("tpl-office")).toBeNull();
  });
});

const props = {
  isMicOn: true, isCamOn: true, isScreenSharing: false, isHandRaised: false,
  isChatOpen: false, unreadChatCount: 0, isParticipantsOpen: false,
  onToggleMic: vi.fn(), onToggleCam: vi.fn(), onToggleScreenShare: vi.fn(),
  onToggleHand: vi.fn(), onToggleChat: vi.fn(), onToggleParticipants: vi.fn(),
  onSendReaction: vi.fn(), onLeave: vi.fn(), onAudioInputChange: vi.fn(),
  onAudioOutputChange: vi.fn(), onVideoInputChange: vi.fn(),
  onOpenVideoSettings: vi.fn(), onOpenMetrics: vi.fn(),
  estadoNC: "activa" as const,
  onToggleBlurBackground: vi.fn(),
};

describe("el menú de la cámara ofrece Leve y Fuerte", () => {
  it("en el menú del teléfono, al lado de difuminar, y elegir avisa el nivel", async () => {
    const onElegir = vi.fn();
    render(<CallControls {...props} compact tactil backgroundEffect="blur-strong" onElegirNivelBlur={onElegir} />);
    fireEvent.click(await screen.findByTitle("Más opciones"));
    expect(screen.getByText("Fuerte").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Leve").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByText("Leve"));
    expect(onElegir).toHaveBeenCalledWith("leve");
  });

  it("sin el aviso no se muestran (otras barras no cambian)", async () => {
    render(<CallControls {...props} compact tactil backgroundEffect="none" />);
    fireEvent.click(await screen.findByTitle("Más opciones"));
    expect(screen.queryByText("Fuerte")).toBeNull();
  });
});

describe("equipo flojo → camino liviano", () => {
  it("recorte fino solo en equipos fuertes", () => {
    expect(usaRecorteFino({ hardwareConcurrency: 8, userAgent: PC })).toBe(true);
    expect(usaRecorteFino({ hardwareConcurrency: 12, userAgent: PC, deviceMemory: 8 })).toBe(true);
    expect(usaRecorteFino({ hardwareConcurrency: 4, userAgent: PC })).toBe(false);
    expect(usaRecorteFino({ hardwareConcurrency: 8, userAgent: PC, deviceMemory: 4 })).toBe(false);
    expect(usaRecorteFino({ hardwareConcurrency: 8, userAgent: CEL })).toBe(false);
    expect(cadaCuantosCuadrosSegmentar({ hardwareConcurrency: 4, userAgent: PC })).toBe(2);
  });

  it("si el cuadro pasa de 25 ms sostenido, baja al liviano (y un pico suelto no)", () => {
    expect(PRESUPUESTO_RECORTE_FINO_MS).toBe(25);
    expect(REVISIONES_LENTAS_PARA_BAJAR).toBeGreaterThan(1);
    let r = debeBajarAlLiviano(30, 0);
    expect(r.bajar).toBe(false);
    r = debeBajarAlLiviano(12, r.lentas);
    expect(r).toEqual({ lentas: 0, bajar: false });
    let lentas = 0;
    let bajar = false;
    for (let i = 0; i < REVISIONES_LENTAS_PARA_BAJAR; i++) ({ lentas, bajar } = debeBajarAlLiviano(31, lentas));
    expect(bajar).toBe(true);
  });
});

// Guardas sobre las fuentes: rutas literales (ver CLAUDE.md).
const fProcesador = Object.values(import.meta.glob("../../lib/fondoFino/procesador.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];
const fPipeline = Object.values(import.meta.glob("../../lib/fondoFino/pipelineGL.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];
const fLlamada = Object.values(import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];

describe("guarda: máscara de confianza con borde suave", () => {
  it("el detector entrega CONFIANZA, no categorías", () => {
    expect(fProcesador).toContain("outputConfidenceMasks: true");
    expect(fProcesador).toContain("outputCategoryMask: false");
    expect(fProcesador).not.toMatch(/outputCategoryMask:\s*true/);
  });

  it("el procesador prende el recorte fino según el equipo y baja solo si se atrasa", () => {
    expect(fProcesador).toContain("fusion: opciones.fusion ?? usaRecorteFino()");
    expect(fProcesador).toContain("debeBajarAlLiviano(");
  });

  it("el borde es suave (rampa con ancho mínimo) y la máscara se suaviza en el tiempo", () => {
    expect(fPipeline).toMatch(/float ancho = max\(.*ANCHO_MIN_DEL_BORDE/);
    expect(fPipeline).toContain("mix(anterior, detectada, factor)");
    // El color solo baja donde el detector duda y hay luz (el pelo oscuro).
    expect(fPipeline).toContain("dudosa * luz");
  });

  it("la llamada pasa el nivel elegido al menú y arranca en el nivel guardado", () => {
    expect(fLlamada).toContain("onElegirNivelBlur={(nivel) => handleBgChange(efectoDeNivel(nivel))}");
    expect(fLlamada).toContain("useRef<BackgroundEffect>(blurPorDefecto())");
  });
});

describe("el pelo oscuro contra la pared oscura no se come", () => {
  const cara = [0.75, 0.6, 0.5] as const;     // F: persona segura cerca (la cara)
  const pared = [0.08, 0.08, 0.09] as const;  // B: pared oscura
  const pelo = [0.06, 0.05, 0.05] as const;   // I: pelo oscuro

  it("donde el detector ve persona, el color no la baja", () => {
    // Máscara 0,7 (el detector ve pelo), a = 1 tras la curva, franja plena.
    expect(alfaFinal(1, 0.7, pelo, cara, pared, 1)).toBeCloseTo(1, 5);
  });

  it("con todo oscuro, el color tampoco baja aunque el detector dude", () => {
    expect(permisoDeBajada(0.3, pelo, pared)).toBe(0);
    expect(alfaFinal(0.6, 0.3, pelo, cara, pared, 1)).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  it("con luz y el detector dudando, sí puede sacar la pared (huecos del pelo)", () => {
    const paredClara = [0.8, 0.8, 0.8] as const;
    const peloOscuro = [0.1, 0.08, 0.07] as const;
    expect(permisoDeBajada(0.2, paredClara, paredClara)).toBeGreaterThan(0.9);
    expect(alfaFinal(0.7, 0.2, paredClara, peloOscuro, paredClara, 1)).toBeLessThan(0.5);
  });
});
