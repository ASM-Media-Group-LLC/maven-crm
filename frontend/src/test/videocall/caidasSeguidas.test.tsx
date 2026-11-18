// «TU INTERNET SE ESTÁ CORTANDO SEGUIDO» (Alvaro, 17/11/2026: «aviso automático
// a la persona y su supervisor»). Lo de la persona: la cuenta de caídas que lleva
// su navegador, cuándo sale el cartel y que la llamada lo alimente desde
// anotarCorte. Lo del supervisor (el chip del hub) vive en
// test/cowork/chipCaidasInternet.test.ts.
//
// Si esto se rompe no truena nada: el cartel simplemente deja de salir (o sale
// a cada rato). Por eso las guardas.
import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { RUTA_GUIA_CONEXION } from "@/lib/guiaConexion";
import { faseSegunSueno } from "@/lib/equipoDormido";
import {
  AVISO_A_LA_PERSONA_CADA_MS, AVISO_VISIBLE_MS, CAIDAS_INICIAL, CAIDAS_PARA_AVISAR, VENTANA_DE_LA_PERSONA_MS,
  anotarCaida, avisoCaidasVisible, cerrarAvisoCaidas, cuentaComoCaida, dentroDeLaVentana, guardarCaidas, leerCaidas,
  registrarCorteParaElAviso, reiniciarAvisoCaidas, type EstadoCaidas,
} from "@/lib/caidasSeguidas";
import AvisoCaidasSeguidas from "@/pages/messenger/videocall/AvisoCaidasSeguidas";

const fuentes = import.meta.glob([
  "/frontend/src/hooks/useLiveKit.ts",
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/pages/messenger/videocall/AvisoCaidasSeguidas.tsx",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const leer = (ruta: string) => {
  const s = fuentes[`/frontend/src/${ruta}`];
  if (!s) throw new Error(`no se cargó ${ruta}`);
  return s;
};

const MIN = 60_000;
const T0 = 1_800_000_000_000;

/** Un almacén de mentira (como localStorage). */
function almacen() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

describe("qué cuenta como caída", () => {
  it("solo la fase «caida»: ni parpadeos, ni el final del mismo episodio, ni recargas, ni el sueño", () => {
    expect(cuentaComoCaida("caida")).toBe(true);
    for (const f of ["parpadeo", "parpadeo_ok", "reentrada_ok", "reentrada_agotada", "recarga", "salida", "equipo_dormido"]) {
      expect(cuentaComoCaida(f)).toBe(false);
    }
    // Con el equipo dormido la caída llega con otra fase y no cuenta.
    expect(cuentaComoCaida(faseSegunSueno("caida", true))).toBe(false);
  });
});

describe("la cuenta de la persona: 3 caídas en 30 minutos, una vez por hora", () => {
  const caidasEn = (minutos: number[], prev: EstadoCaidas = CAIDAS_INICIAL) => {
    let e = prev;
    const avisos: number[] = [];
    for (const m of minutos) {
      const r = anotarCaida(e, T0 + m * MIN);
      e = r.estado;
      if (r.avisar) avisos.push(m);
    }
    return { estado: e, avisos };
  };

  it("los umbrales son los decididos", () => {
    expect(CAIDAS_PARA_AVISAR).toBe(3);
    expect(VENTANA_DE_LA_PERSONA_MS).toBe(30 * MIN);
    expect(AVISO_A_LA_PERSONA_CADA_MS).toBe(60 * MIN);
  });

  it("una o dos caídas no avisan; la tercera dentro de los 30 minutos sí", () => {
    expect(caidasEn([0]).avisos).toEqual([]);
    expect(caidasEn([0, 10]).avisos).toEqual([]);
    expect(caidasEn([0, 10, 29]).avisos).toEqual([29]);
  });

  it("caídas desparramadas (más de 30 minutos entre la primera y la tercera) no avisan", () => {
    expect(caidasEn([0, 20, 31]).avisos).toEqual([]);
    expect(caidasEn([0, 40, 80, 120]).avisos).toEqual([]);
  });

  it("después de avisar, no vuelve a avisar dentro de la hora aunque siga cayéndose", () => {
    expect(caidasEn([0, 5, 10, 12, 15, 20, 40, 69]).avisos).toEqual([10]);
  });

  it("pasada la hora, si sigue cayéndose, avisa otra vez", () => {
    expect(caidasEn([0, 5, 10, 50, 60, 70]).avisos).toEqual([10, 70]);
  });

  it("la ventana descarta lo viejo y lo del futuro (un reloj que se movió)", () => {
    expect(dentroDeLaVentana([T0 - 31 * MIN, T0 - 29 * MIN, T0 + MIN], T0)).toEqual([T0 - 29 * MIN]);
  });

  it("un aviso con fecha del futuro no bloquea el siguiente", () => {
    const r = anotarCaida({ marcas: [T0 - 2 * MIN, T0 - MIN], ultimoAviso: T0 + 10 * MIN }, T0);
    expect(r.avisar).toBe(true);
  });
});

describe("el almacén: sobrevive a una recarga y no rompe si falla", () => {
  it("guarda y lee lo mismo", () => {
    const a = almacen();
    guardarCaidas({ marcas: [T0], ultimoAviso: T0 }, a);
    expect(leerCaidas(a)).toEqual({ marcas: [T0], ultimoAviso: T0 });
  });

  it("vacío es el estado inicial; basura no rompe; sin almacén es null (se cuenta en memoria)", () => {
    expect(leerCaidas(almacen())).toEqual(CAIDAS_INICIAL);
    const roto = { getItem: () => "{no es json", setItem: () => {} };
    expect(leerCaidas(roto)).toBeNull();
    const raro = { getItem: () => JSON.stringify({ marcas: ["x", 5, null], ultimoAviso: "ayer" }), setItem: () => {} };
    expect(leerCaidas(raro)).toEqual({ marcas: [5], ultimoAviso: null });
    expect(leerCaidas(null)).toBeNull();
    const queTira = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(() => guardarCaidas(CAIDAS_INICIAL, queTira)).not.toThrow();
  });
});

describe("el cartel en la llamada", () => {
  beforeEach(() => { vi.useFakeTimers(); reiniciarAvisoCaidas(); });
  afterEach(() => { reiniciarAvisoCaidas(); vi.useRealTimers(); });

  const conIdioma = (ui: ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

  it("se prende con la tercera caída y no con parpadeos", () => {
    const a = almacen();
    expect(registrarCorteParaElAviso("caida", T0, a)).toBe(false);
    expect(registrarCorteParaElAviso("parpadeo_ok", T0 + MIN, a)).toBe(false);
    expect(registrarCorteParaElAviso("reentrada_agotada", T0 + MIN, a)).toBe(false);
    expect(registrarCorteParaElAviso("caida", T0 + 2 * MIN, a)).toBe(false);
    expect(avisoCaidasVisible()).toBe(false);
    expect(registrarCorteParaElAviso("caida", T0 + 3 * MIN, a)).toBe(true);
    expect(avisoCaidasVisible()).toBe(true);
  });

  it("sin almacén (ventana privada) también cuenta, en memoria", () => {
    expect(registrarCorteParaElAviso("caida", T0, null)).toBe(false);
    expect(registrarCorteParaElAviso("caida", T0 + MIN, null)).toBe(false);
    expect(registrarCorteParaElAviso("caida", T0 + 2 * MIN, null)).toBe(true);
  });

  it("se va solo a los 5 minutos", () => {
    const a = almacen();
    for (const m of [0, 1, 2]) registrarCorteParaElAviso("caida", T0 + m * MIN, a);
    expect(avisoCaidasVisible()).toBe(true);
    vi.advanceTimersByTime(AVISO_VISIBLE_MS);
    expect(avisoCaidasVisible()).toBe(false);
  });

  it("muestra el texto, abre la guía de conexión en otra pestaña y se cierra", () => {
    conIdioma(<AvisoCaidasSeguidas />);
    expect(screen.queryByRole("status")).toBeNull();
    const a = almacen();
    act(() => { for (const m of [0, 1, 2]) registrarCorteParaElAviso("caida", T0 + m * MIN, a); });
    expect(screen.getByRole("status")).toHaveTextContent("Tu internet se está cortando seguido.");
    const guia = screen.getByRole("link");
    expect(guia).toHaveAttribute("href", RUTA_GUIA_CONEXION);
    // Pestaña nueva: navegar en esta colgaría las llamadas que no viven en la ventanita.
    expect(guia).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("cerrarlo no reinicia la hora: otra caída enseguida no lo vuelve a sacar", () => {
    const a = almacen();
    for (const m of [0, 1, 2]) registrarCorteParaElAviso("caida", T0 + m * MIN, a);
    cerrarAvisoCaidas();
    expect(registrarCorteParaElAviso("caida", T0 + 3 * MIN, a)).toBe(false);
    expect(avisoCaidasVisible()).toBe(false);
  });
});

describe("guardas: la llamada alimenta la cuenta y muestra el cartel", () => {
  it("anotarCorte cuenta con la fase YA corregida por el sueño, antes del insert (sirve sin red)", () => {
    const s = leer("hooks/useLiveKit.ts");
    const cuerpo = s.slice(s.indexOf("const anotarCorte = useCallback("), s.indexOf("type InsertaSalud"));
    expect(cuerpo).toContain("faseSegunSueno(fase, !!sueno)");
    expect(cuerpo).toContain("registrarCorteParaElAviso(fila.fase)");
    expect(cuerpo.indexOf("registrarCorteParaElAviso(fila.fase)"))
      .toBeLessThan(cuerpo.indexOf('("llamada_cortes")'));
    // El invitado de afuera sale antes por su propio camino (la guía pide cuenta).
    expect(cuerpo.indexOf("telemetriaRef.current.corte(fila)"))
      .toBeLessThan(cuerpo.indexOf("registrarCorteParaElAviso(fila.fase)"));
  });

  it("la vista de la llamada pinta el cartel y el cartel solo avisa (no cuelga ni apaga nada)", () => {
    expect(leer("pages/messenger/videocall/LiveKitCallView.tsx")).toContain("<AvisoCaidasSeguidas />");
    const cartel = leer("pages/messenger/videocall/AvisoCaidasSeguidas.tsx");
    expect(cartel).toContain("href={RUTA_GUIA_CONEXION}");
    expect(cartel).toContain('t("messenger.callView.caidasSeguidas")');
    expect(cartel).not.toMatch(/disconnect|setCameraEnabled|setMicrophoneEnabled|navigate\(/);
  });
});
