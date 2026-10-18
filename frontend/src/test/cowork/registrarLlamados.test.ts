import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

// Que los llamados de atención de Cowork queden anotados — y, sobre todo, que
// NO se anoten los que no corresponden.
//
// Esto va a terminar afectando la nota de la gente, así que el riesgo grande no
// es perder un llamado: es inventar uno. Un llamado de más es una acusación
// falsa que además baja un número que alguien va a mirar en una evaluación.
//
// Los tres primeros casos del bloque "en vivo" existen porque una revisión
// adversarial encontró que el código los hacía mal. Los tres inventaban
// llamados contra gente que no había hecho nada.

const pausada = vi.fn(() => false);
vi.mock("@/lib/coworkPausa", () => ({ estaEnPausa: () => pausada() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
}));

const {
  kindDeLlamado, debeRegistrar, useRegistrarLlamados, REPETIR_REGISTRO_MS, MAX_HUECO_MS,
} = await import("@/hooks/useRegistrarLlamados");
const { AVISAR_COORDINADOR_MS, AVISAR_SUPERVISOR_SIN_PANTALLA_MS } =
  await import("@/hooks/useFaceNudge");

describe("de qué se llama la atención", () => {
  it("cámara apagada, poca luz y mal encuadre se separan", () => {
    expect(kindDeLlamado("cam_off")).toBe("camara");
    expect(kindDeLlamado("too_dark")).toBe("luz");
    expect(kindDeLlamado("no_face")).toBe("encuadre");
    expect(kindDeLlamado("too_small")).toBe("encuadre");
  });

  it("si se le ve bien, no hay llamado", () => {
    expect(kindDeLlamado("ok")).toBeNull();
  });

  // `unavailable` significa que el detector no cargó en ESA máquina: la persona
  // puede estar perfectamente encuadrada. Anotarlo sería acusar a alguien de
  // algo que no hizo, y encima le pondría peor nota a quien tiene la
  // computadora más vieja.
  it("si el detector no cargó, NO se anota nada", () => {
    expect(kindDeLlamado("unavailable")).toBeNull();
    expect(kindDeLlamado(null)).toBeNull();
    expect(kindDeLlamado(undefined)).toBeNull();
  });
});

describe("cuándo toca escribir", () => {
  const T0 = 1_000_000;

  it("antes del umbral, no", () => {
    expect(debeRegistrar(T0, T0 + AVISAR_COORDINADOR_MS - 1, AVISAR_COORDINADOR_MS, null)).toBe(false);
  });

  it("al cruzarlo, sí", () => {
    expect(debeRegistrar(T0, T0 + AVISAR_COORDINADOR_MS, AVISAR_COORDINADOR_MS, null)).toBe(true);
  });

  it("recién anotado no se reescribe", () => {
    const ahora = T0 + AVISAR_COORDINADOR_MS + 5_000;
    expect(debeRegistrar(T0, ahora, AVISAR_COORDINADOR_MS, ahora - 1_000)).toBe(false);
  });

  it("pero pasado el intervalo sí, para estirar la duración", () => {
    const ahora = T0 + AVISAR_COORDINADOR_MS + REPETIR_REGISTRO_MS;
    expect(debeRegistrar(T0, ahora, AVISAR_COORDINADOR_MS, ahora - REPETIR_REGISTRO_MS)).toBe(true);
  });

  it("sin problema abierto no hay nada que escribir", () => {
    expect(debeRegistrar(null, T0, AVISAR_COORDINADOR_MS, null)).toBe(false);
    expect(debeRegistrar(undefined, T0, AVISAR_COORDINADOR_MS, null)).toBe(false);
  });
});

describe("el registrador, en vivo", () => {
  let enviados: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.useFakeTimers();
    pausada.mockReturnValue(false);
    enviados = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) } as Response;
    }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  const correr = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await vi.waitFor(() => {});
  };

  interface P { estado?: string; compartiendo?: boolean; activo?: boolean; conectado?: boolean }
  const props = (a: P) => ({
    faceWatch: a.estado ? ({ state: a.estado, since: Date.now() } as never) : null,
    compartiendo: a.compartiendo ?? true,
    activo: a.activo ?? true,
    conectado: a.conectado ?? true,
  });
  const montar = (a: P) => renderHook((p: P) => useRegistrarLlamados(props(p)), { initialProps: a });

  // ── Los tres que encontró la revisión ──

  // Alguien marca "Break", deja la cámara prendida y se va media hora. Al
  // volver, el detector sigue diciendo "no_face" y su `since` es de hace media
  // hora. La versión anterior escribía, en el primer tic tras la pausa, un
  // llamado de TREINTA MINUTOS de mal encuadre — fechado dentro del break, o
  // sea imposible de descartar después cruzando con las pausas.
  it("al volver de una pausa, el reloj arranca de cero", async () => {
    const { rerender } = montar({ estado: "no_face" });
    pausada.mockReturnValue(true);
    await correr(30 * 60_000);
    expect(enviados).toHaveLength(0);

    pausada.mockReturnValue(false);
    rerender({ estado: "no_face" });
    // Un minuto después de volver todavía no hay nada: el umbral son 3 min y se
    // cuentan desde que volvió, no desde que se fue.
    await correr(60_000);
    expect(enviados).toHaveLength(0);

    await correr(AVISAR_COORDINADOR_MS);
    expect(enviados).toHaveLength(1);
    // Y lo que se anota es el rato DESPUÉS de la pausa, no la pausa entera.
    expect(Number(enviados[0].seconds)).toBeLessThan(10 * 60);
  });

  // La variante peor: el problema YA venía de antes de la pausa. Acá el reloj
  // está corriendo cuando la persona marca "Break", y si no se lo olvida, al
  // volver el primer tic escribe un llamado que cubre toda la pausa.
  it("un problema que venía de antes tampoco se cobra durante la pausa", async () => {
    const { rerender } = montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    expect(enviados).toHaveLength(1);           // el reloj está corriendo
    const antes = enviados.length;

    pausada.mockReturnValue(true);              // se marca "Break" y se va
    await correr(30 * 60_000);
    expect(enviados).toHaveLength(antes);

    pausada.mockReturnValue(false);             // vuelve
    rerender({ estado: "cam_off" });
    await correr(60_000);
    // Si esto falla, se le anotó a alguien la media hora que había avisado.
    expect(enviados).toHaveLength(antes);
  });

  // Al caerse la sala, LiveKit vacía la lista de participantes y la cámara de
  // todos se ve apagada aunque esté prendida. Supabase vive en otro servidor,
  // así que las escrituras salían igual: una caída de veinte minutos le anotaba
  // a CADA persona veinte minutos de "cámara apagada".
  it("con la sala caída no se anota nada", async () => {
    montar({ estado: "cam_off", conectado: false });
    await correr(AVISAR_COORDINADOR_MS * 3);
    expect(enviados).toHaveLength(0);
  });

  it("y al reconectar tampoco se cobra el rato de la caída", async () => {
    const { rerender } = montar({ estado: "cam_off", conectado: false });
    await correr(20 * 60_000);
    rerender({ estado: "cam_off", conectado: true });
    await correr(60_000);
    expect(enviados).toHaveLength(0);           // recién vuelve a contar
    await correr(AVISAR_COORDINADOR_MS);
    expect(Number(enviados[0].seconds)).toBeLessThan(10 * 60);
  });

  // `no_face` y `too_small` son los dos "encuadre". Alguien parado justo en el
  // borde del cuadro hace parpadear el detector, y antes cada parpadeo
  // reiniciaba el reloj y abría un llamado nuevo: un episodio se veía como
  // muchos, o no se anotaba nunca.
  it("el parpadeo del detector no parte el episodio", async () => {
    const { rerender } = montar({ estado: "no_face" });
    await correr(AVISAR_COORDINADOR_MS + 15_000);
    expect(enviados).toHaveLength(1);

    rerender({ estado: "too_small" });          // mismo problema, otro sub-estado
    await correr(REPETIR_REGISTRO_MS + 15_000);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].kind).toBe("encuadre");
    // Sigue contando desde el principio del episodio, no desde el parpadeo.
    expect(Number(enviados[1].seconds)).toBeGreaterThan(Number(enviados[0].seconds) + 100);
  });

  // ── El resto ──

  it("un despiste corto no queda anotado", async () => {
    montar({ estado: "no_face" });
    await correr(AVISAR_COORDINADOR_MS - 20_000);
    expect(enviados).toHaveLength(0);
  });

  it("pero pasado el umbral sí, una sola vez", async () => {
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ action: "registrarLlamado", kind: "camara", detail: "cam_off" });
    expect(Number(enviados[0].seconds)).toBeGreaterThanOrEqual(AVISAR_COORDINADOR_MS / 1000 - 15);
  });

  // El servidor resta el inicio a partir de la duración: mandar una fecha
  // absoluta hacía que un reloj desviado creara una fila nueva por reintento.
  it("se manda cuánto duró, nunca cuándo empezó", async () => {
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    expect(enviados[0]).toHaveProperty("seconds");
    expect(enviados[0]).not.toHaveProperty("startedAt");
  });

  it("en pausa no se anota nada", async () => {
    pausada.mockReturnValue(true);
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS * 2);
    expect(enviados).toHaveLength(0);
  });

  it("si el detector no cargó, tampoco", async () => {
    montar({ estado: "unavailable" });
    await correr(AVISAR_COORDINADOR_MS * 2);
    expect(enviados).toHaveLength(0);
  });

  it("no compartir pantalla se anota, pero cinco minutos después", async () => {
    montar({ estado: "ok", compartiendo: false });
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS - 30_000);
    expect(enviados).toHaveLength(0);
    await correr(60_000);
    expect(enviados.filter((e) => e.kind === "pantalla")).toHaveLength(1);
  });

  it("al volver a compartir, deja de contar", async () => {
    const { rerender } = montar({ estado: "ok", compartiendo: false });
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS + 20_000);
    const antes = enviados.length;
    rerender({ estado: "ok", compartiendo: true });
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS * 2);
    expect(enviados).toHaveLength(antes);
  });

  // Fuera de Cowork —un Meet, una videollamada suelta— nada de esto aplica.
  it("fuera de Cowork no anota nunca", async () => {
    montar({ estado: "cam_off", compartiendo: false, activo: false });
    await correr(AVISAR_SUPERVISOR_SIN_PANTALLA_MS * 2);
    expect(enviados).toHaveLength(0);
  });

  // OJO: este test arranca con el reloj YA CORRIENDO. La primera versión
  // arrancaba con activo:false, y así no probaba nada — el intervalo nunca
  // corría, los refs estaban vacíos igual, y el test pasaba aunque se borrara
  // el arreglo. Lo comprobamos borrándolo: seguía en verde.
  it("y si Cowork se reactiva, no arrastra el reloj viejo", async () => {
    const { rerender } = montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    const antes = enviados.length;
    expect(antes).toBe(1);                       // el reloj está corriendo

    rerender({ estado: "cam_off", activo: false });   // se va de Cowork
    await correr(30 * 60_000);
    rerender({ estado: "cam_off", activo: true });    // vuelve
    await correr(60_000);
    // Si esto falla, se le cobró la media hora que estuvo fuera de Cowork.
    expect(enviados).toHaveLength(antes);
  });

  // El análogo del de la pausa, para la rama de la desconexión: el problema ya
  // venía contando cuando se cayó la sala. Sin esto, los dos tests de conexión
  // pasaban igual con una implementación que CONGELARA el reloj en vez de
  // olvidarlo — comprobado.
  it("si la sala se cae con un problema ya contando, no se cobra la caída", async () => {
    const { rerender } = montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    const antes = enviados.length;

    rerender({ estado: "cam_off", conectado: false });
    await correr(20 * 60_000);
    expect(enviados).toHaveLength(antes);

    rerender({ estado: "cam_off", conectado: true });
    await correr(60_000);
    expect(enviados).toHaveLength(antes);       // arrancó de cero
  });

  // Cerrar la tapa de la laptop. El intervalo se suspende y al despertar el tic
  // vencido dispara enseguida: `conectado` todavía es el valor de antes de
  // dormir y el reloj propio viene de antes también. Sin guarda, eso escribía
  // un llamado por toda la siesta.
  it("si la máquina durmió, no se cobra el rato dormido", async () => {
    const { rerender } = montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    const antes = enviados.length;

    vi.setSystemTime(Date.now() + MAX_HUECO_MS * 20);   // la tapa estuvo cerrada
    rerender({ estado: "cam_off" });
    await correr(15_000);                                // el tic vencido dispara
    expect(enviados).toHaveLength(antes);

    // Y al volver cuenta de cero, no desde antes de dormir.
    await correr(60_000);
    expect(enviados).toHaveLength(antes);
  });

  // El nonce es lo que le dice al servidor "es el MISMO llamado, más largo".
  // Si cambiara en cada reescritura, un episodio quedaría como muchas filas.
  it("mientras el episodio sigue, el identificador no cambia", async () => {
    montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + REPETIR_REGISTRO_MS + 30_000);
    expect(enviados.length).toBeGreaterThanOrEqual(2);
    expect(enviados[0].nonce).toBeTruthy();
    expect(enviados[1].nonce).toBe(enviados[0].nonce);
    expect(Number(enviados[1].seconds)).toBeGreaterThan(Number(enviados[0].seconds));
  });

  it("pero un episodio nuevo trae uno distinto", async () => {
    const { rerender } = montar({ estado: "cam_off" });
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    rerender({ estado: "ok" });                  // se acomodó
    await correr(30_000);
    rerender({ estado: "cam_off" });             // y volvió a apagar la cámara
    await correr(AVISAR_COORDINADOR_MS + 20_000);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].nonce).not.toBe(enviados[0].nonce);
  });
});
