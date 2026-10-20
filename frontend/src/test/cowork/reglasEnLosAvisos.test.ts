import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

// Las reglas de la SESIÓN aplicadas a los avisos que corren dentro de la
// llamada. Lo que se fija acá son las garantías del contrato de `coworkReglas`
// vistas desde el lado de la persona:
//   · Una alerta APAGADA no existe: ni aviso a la persona, ni coordinador, ni
//     registro — aunque el problema dure diez minutos.
//   · `supervisorSeg` en null: a la persona SÍ se le avisa; al coordinador
//     NUNCA; y no queda anotado, porque el registro es literalmente "se le
//     avisó al supervisor".
//   · Los tiempos de la regla mandan sobre los del estándar, categoría por
//     categoría: apagar la cámara no apaga el encuadre.
//   · Las reglas se leen EN CADA TIC: cambiarlas con `fijarReglas` en medio
//     cambia el comportamiento en el siguiente tic, sin remontar nada. Es lo
//     que hace que un cambio del supervisor llegue en vivo.
//
// Lo que NO está acá, a propósito: que una sesión sin reglas (null) se
// comporte EXACTAMENTE como hoy. Eso lo cubren `supervisorEncuadre.test.ts` y
// `registrarLlamados.test.ts`, que nunca fijan reglas y siguen en verde.

const toastWarning = vi.fn();
const sonido = vi.fn();
const habla = vi.fn();
const pausada = vi.fn(() => false);

vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => toastWarning(...a) } }));
vi.mock("@/lib/notificationSound", () => ({ playMessageNotification: (...a: unknown[]) => sonido(...a) }));
vi.mock("@/lib/anunciarVoz", () => ({ anunciar: (...a: unknown[]) => habla(...a) }));
vi.mock("@/lib/coworkPausa", () => ({ estaEnPausa: () => pausada(), marcarPausa: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
}));

// `coworkReglas` NO se mockea: es un módulo puro y es justamente lo que se prueba.
const {
  useFaceNudge, useScreenShareNudge, debeAvisarSinPantalla,
  AVISAR_COORDINADOR_MS, AVISAR_SUPERVISOR_SIN_PANTALLA_MS,
} = await import("@/hooks/useFaceNudge");
const { useRegistrarLlamados, REPETIR_REGISTRO_MS } = await import("@/hooks/useRegistrarLlamados");
const { fijarReglas, normalizarReglas, REGLAS_ESTANDAR, PRESETS } = await import("@/lib/coworkReglas");

/** Fija reglas a partir de un parche parcial; lo que falte toma el estándar. */
const reglas = (parche: unknown) => fijarReglas(normalizarReglas(parche));
const limpiar = () => { toastWarning.mockClear(); sonido.mockClear(); habla.mockClear(); };

/** Monta el supervisor de encuadre con el problema empezado hace `segundos`. */
function supervisar(state: string, segundos: number, alCoordinador?: (s: number) => void) {
  const since = Date.now() - segundos * 1000;
  return renderHook(() => useFaceNudge({ state, since } as never, false, alCoordinador));
}

describe("encuadre y cámara según las reglas de la sesión", () => {
  beforeEach(() => { vi.useFakeTimers(); limpiar(); pausada.mockReturnValue(false); fijarReglas(null); });
  afterEach(() => { cleanup(); vi.useRealTimers(); fijarReglas(null); });

  it("con supervisorSeg en null, a la persona sí se le avisa y al coordinador nunca", () => {
    reglas({ camara: { supervisorSeg: null } });
    const alCoordinador = vi.fn();
    supervisar("cam_off", 600, alCoordinador);      // ya lleva diez minutos
    vi.advanceTimersByTime(10 * 60_000);            // y pasan otros diez
    expect(toastWarning).toHaveBeenCalled();
    expect(habla).toHaveBeenCalled();
    expect(alCoordinador).not.toHaveBeenCalled();
    // Y tampoco "sube el volumen": ese escalón era el del coordinador.
    for (const llamada of habla.mock.calls) {
      expect((llamada[1] as { volumen: number }).volumen).toBe(0.7);
    }
  });

  it("apagar la cámara no apaga el encuadre: cada categoría sigue su regla", () => {
    reglas({ camara: { activa: false } });
    const alCoordinador = vi.fn();
    supervisar("cam_off", 600, alCoordinador);
    vi.advanceTimersByTime(5 * 60_000);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(habla).not.toHaveBeenCalled();
    expect(alCoordinador).not.toHaveBeenCalled();

    cleanup(); limpiar();
    // El encuadre quedó en el estándar: avisa y escala como siempre.
    supervisar("no_face", 200, alCoordinador);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(alCoordinador).toHaveBeenCalledTimes(1);
  });

  it("los tiempos de la regla mandan: estricto avisa al minuto y escala a los dos", () => {
    fijarReglas(PRESETS.estricto);                  // 60 / 60 / 120
    const alCoordinador = vi.fn();
    supervisar("no_face", 65, alCoordinador);
    expect(toastWarning).toHaveBeenCalledTimes(1);  // el estándar callaría hasta los 90 s
    expect(alCoordinador).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);                 // 125 s fuera
    expect(alCoordinador).toHaveBeenCalledTimes(1); // el estándar esperaría a los 180 s
    expect(alCoordinador.mock.calls[0][0]).toBeLessThan(180);
  });

  it("repetirSeg se respeta: relajado repite cada cinco minutos, no cada minuto y medio", () => {
    fijarReglas(PRESETS.relajado);                  // 180 / 300 / nunca
    supervisar("cam_off", 185);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200_000);                // el estándar ya habría repetido dos veces
    expect(toastWarning).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(110_000);                // 310 s desde el primero
    expect(toastWarning).toHaveBeenCalledTimes(2);
  });

  it("cambiar las reglas en medio cambia el siguiente tic, sin remontar", () => {
    const alCoordinador = vi.fn();
    supervisar("cam_off", 100, alCoordinador);      // estándar: ya avisó una vez
    expect(toastWarning).toHaveBeenCalledTimes(1);

    reglas({ camara: { activa: false } });          // el supervisor la apaga en vivo
    vi.advanceTimersByTime(10 * 60_000);
    expect(toastWarning).toHaveBeenCalledTimes(1);  // ni un aviso más
    expect(alCoordinador).not.toHaveBeenCalled();   // y el coordinador nunca se enteró

    fijarReglas(null);                              // la vuelve a encender
    vi.advanceTimersByTime(5_000);                  // el siguiente tic
    expect(toastWarning).toHaveBeenCalledTimes(2);
    expect(alCoordinador).toHaveBeenCalledTimes(1);
  });
});

describe("compartir pantalla según las reglas de la sesión", () => {
  beforeEach(() => { vi.useFakeTimers(); limpiar(); pausada.mockReturnValue(false); fijarReglas(null); });
  afterEach(() => { cleanup(); vi.useRealTimers(); fijarReglas(null); });

  it("con la pantalla apagada en la sesión no dice nada, aunque pasen diez minutos", () => {
    reglas({ pantalla: { activa: false } });
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(10 * 60_000);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(habla).not.toHaveBeenCalled();
    expect(sonido).not.toHaveBeenCalled();
  });

  it("relajado es exactamente eso: a las managers no se les pide pantalla", () => {
    fijarReglas(PRESETS.relajado);
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(10 * 60_000);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("los tiempos de la regla mandan: estricto avisa al minuto y repite al minuto", () => {
    fijarReglas(PRESETS.estricto);                  // 60 / 60
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(65_000);
    expect(toastWarning).toHaveBeenCalledTimes(1);  // el estándar callaría hasta los 120 s
    vi.advanceTimersByTime(60_000);
    expect(toastWarning).toHaveBeenCalledTimes(2);  // y repetiría a los dos, no al minuto
  });

  it("apagarla en vivo la calla en el siguiente tic; encenderla cuenta desde ahí", () => {
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(125_000);
    expect(toastWarning).toHaveBeenCalledTimes(1);

    reglas({ pantalla: { activa: false } });
    vi.advanceTimersByTime(10 * 60_000);
    expect(toastWarning).toHaveBeenCalledTimes(1);

    fijarReglas(null);
    // Al encenderla, el reloj arranca de cero: no se cobra el rato apagada.
    vi.advanceTimersByTime(60_000);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(70_000);
    expect(toastWarning).toHaveBeenCalledTimes(2);
  });
});

describe("el registro de llamados según las reglas de la sesión", () => {
  let enviados: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.useFakeTimers();
    pausada.mockReturnValue(false);
    fijarReglas(null);
    enviados = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) } as Response;
    }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); fijarReglas(null); });

  const correr = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await vi.waitFor(() => {});
  };

  interface P { estado?: string; compartiendo?: boolean }
  const props = (a: P) => ({
    faceWatch: a.estado ? ({ state: a.estado, since: Date.now() } as never) : null,
    compartiendo: a.compartiendo ?? true,
    activo: true,
    conectado: true,
  });
  const montar = (a: P) => renderHook((p: P) => useRegistrarLlamados(props(p)), { initialProps: a });

  it("con supervisorSeg en null la cámara no se anota, por más que dure", async () => {
    reglas({ camara: { supervisorSeg: null } });
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS * 3);
    expect(enviados).toHaveLength(0);
  });

  it("una alerta apagada tampoco le queda anotada a nadie", async () => {
    reglas({ pantalla: { activa: false } });
    montar({ estado: "ok", compartiendo: false });
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS * 3);
    expect(enviados).toHaveLength(0);
  });

  it("pero las demás categorías siguen su propia regla", async () => {
    reglas({ camara: { supervisorSeg: null }, pantalla: { activa: false } });
    montar({ estado: "no_face", compartiendo: false });
    // Tiempo de sobra para que, con el estándar, la pantalla YA estuviera
    // anotada: si aparece, es que se leyó el estándar y no la sesión.
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS + 60_000);
    expect(enviados.length).toBeGreaterThan(0);
    expect(new Set(enviados.map((e) => e.kind))).toEqual(new Set(["encuadre"]));
  });

  it("el umbral es el de la regla: estricto anota a los dos minutos", async () => {
    fijarReglas(PRESETS.estricto);                  // cámara escala a los 120 s
    montar({ estado: "cam_off" });
    await correr(120_000 + 20_000);
    expect(enviados).toHaveLength(1);               // el estándar habría esperado a los 3 min
  });

  it("si la regla se apaga en vivo, deja de anotar en el siguiente tic", async () => {
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    expect(enviados).toHaveLength(1);

    reglas({ camara: { supervisorSeg: null } });
    await correr(REPETIR_REGISTRO_MS * 3);
    expect(enviados).toHaveLength(1);               // ni una reescritura más

    // Y si la vuelven a encender, cuenta de cero: no se cobra el rato apagada,
    // y lo que venga es un episodio NUEVO.
    fijarReglas(null);
    await correr(60_000);
    expect(enviados).toHaveLength(1);
    await correr(AVISAR_COORDINADOR_MS);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].nonce).not.toBe(enviados[0].nonce);
  });
});

describe("el aviso al supervisor por pantalla, con el umbral de la sesión", () => {
  const AHORA = 1_800_000_000_000;
  const sinPantallaDesde = (m: number) => ({ screenShareOn: false, screenShareSince: AHORA - m * 60_000 });

  it("con umbral null nunca, lleve lo que lleve", () => {
    expect(debeAvisarSinPantalla(sinPantallaDesde(60), AHORA, null)).toBe(false);
  });

  it("el umbral de la sesión manda sobre el estándar", () => {
    expect(debeAvisarSinPantalla(sinPantallaDesde(3), AHORA, 120_000)).toBe(true);   // estricto
    expect(debeAvisarSinPantalla(sinPantallaDesde(3), AHORA)).toBe(false);           // estándar: 5 min
    expect(debeAvisarSinPantalla(sinPantallaDesde(3), AHORA, 600_000)).toBe(false);
  });

  // Las constantes siguen exportadas como referencia del comportamiento por
  // defecto. Si alguien mueve el estándar en `coworkReglas` y no acá (o al
  // revés), el dashboard y los avisos dejarían de contar lo mismo.
  it("las constantes exportadas siguen siendo el estándar de las reglas", () => {
    expect(REGLAS_ESTANDAR.camara.supervisorSeg).toBe(AVISAR_COORDINADOR_MS / 1000);
    expect(REGLAS_ESTANDAR.encuadre.supervisorSeg).toBe(AVISAR_COORDINADOR_MS / 1000);
    expect(REGLAS_ESTANDAR.pantalla.supervisorSeg).toBe(AVISAR_SUPERVISOR_SIN_PANTALLA_MS / 1000);
  });
});
