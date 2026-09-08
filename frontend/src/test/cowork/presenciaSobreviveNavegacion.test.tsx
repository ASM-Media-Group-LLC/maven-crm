import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// La presencia de un chatter tiene que durar lo que dura su LLAMADA, no lo que
// dura la página de Cowork.
//
// EL BUG QUE ESTO CUIDA: la llamada vive por encima del router, así que navegar
// a otra sección de Maven la manda a la ventanita flotante y sigue. Pero el
// canal de presence se cerraba con la página, y cerrarlo emite un `leave`: el
// coordinador veía al chatter IRSE de la sala mientras la persona seguía
// adentro trabajando. Supervisión mintiendo, que es peor que no tenerla.
//
// Y una consecuencia silenciosa: con el canal cerrado, apagar el micro o irse
// de cuadro ya no le llegaba a nadie.

const removeChannel = vi.fn();
const track = vi.fn(() => "ok");
const subscribe = vi.fn();

function canalFalso() {
  const canal = {
    on: vi.fn(() => canal),
    // Supabase llama al callback con el estado de la suscripción; el mock lo
    // imita porque de eso depende que se publique la presencia pendiente.
    subscribe: (cb?: (estado: string) => void) => { subscribe(cb); cb?.("SUBSCRIBED"); return canal; },
    track,
    presenceState: () => ({}),
  };
  return canal;
}

const channel = vi.fn(() => canalFalso());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (...a: unknown[]) => channel(...(a as [])),
    removeChannel: (...a: unknown[]) => removeChannel(...(a as [])),
  },
}));

const { useCoworkMediaPresence, salirDePresencia } = await import("@/hooks/useCoworkMediaPresence");

const SESION = "sesion-1";
const CHATTER = "user-1";

describe("presencia de Cowork al navegar", () => {
  beforeEach(() => {
    // Cada caso arranca sin canal abierto de los anteriores.
    salirDePresencia();
    removeChannel.mockClear();
    track.mockClear();
    channel.mockClear();
  });

  it("el chatter NO se da de baja al salir de la página", () => {
    const { unmount } = renderHook(() =>
      useCoworkMediaPresence(SESION, CHATTER, { persistente: true }),
    );
    expect(channel).toHaveBeenCalledTimes(1);

    unmount(); // esto es "me fui a otra sección de Maven"

    // Si acá se cerrara el canal, el coordinador vería un `leave`.
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it("y puede seguir publicando su estado con la página desmontada", () => {
    const { result, unmount } = renderHook(() =>
      useCoworkMediaPresence(SESION, CHATTER, { persistente: true }),
    );
    const publicar = result.current.trackMediaState;
    unmount();

    // La llamada sigue viva en la ventanita y avisa que apagó el micro.
    act(() => publicar({ micOn: false, camOn: true, screenShareOn: false }));

    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toMatchObject({ user_id: CHATTER, micOn: false, camOn: true });
  });

  it("salir de la sala SÍ da de baja: ahí el `leave` corresponde", () => {
    const { unmount } = renderHook(() =>
      useCoworkMediaPresence(SESION, CHATTER, { persistente: true }),
    );
    unmount();
    expect(removeChannel).not.toHaveBeenCalled();

    salirDePresencia(); // el botón "Salir de la sala"

    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("el coordinador no es persistente: cerrar el dashboard cierra su canal", () => {
    const { unmount } = renderHook(() => useCoworkMediaPresence(SESION, "coordi-1"));
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("dos vistas comparten un solo canal y desmontar una no lo cierra", () => {
    const a = renderHook(() => useCoworkMediaPresence(SESION, CHATTER, { persistente: true }));
    const b = renderHook(() => useCoworkMediaPresence(SESION, CHATTER, { persistente: true }));
    expect(channel).toHaveBeenCalledTimes(1); // uno solo, no dos

    a.unmount();
    expect(removeChannel).not.toHaveBeenCalled();
    b.unmount();
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it("cambiar de sesión sí cierra la anterior, y abre la nueva RECIÉN cuando la vieja terminó de salir", async () => {
    const { rerender } = renderHook(
      ({ s }) => useCoworkMediaPresence(s, CHATTER, { persistente: true }),
      { initialProps: { s: SESION } },
    );
    rerender({ s: "sesion-2" });
    expect(removeChannel).toHaveBeenCalledTimes(1);
    // El canal nuevo NO se abre en el mismo tic: el cliente de Realtime borra
    // por nombre tras el acuse, y abrir antes hacía nacer muerto al nuevo.
    expect(channel).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); });
    expect(channel).toHaveBeenCalledTimes(2);
  });
});

// El primer aviso de estado puede llegar ANTES de que exista el canal: la
// llamada monta y reporta micro/cámara mientras la sesión todavía carga. Ese
// aviso se perdía en silencio y nadie lo reintentaba, así que la persona
// quedaba dentro de la sala pero invisible para la supervisión — sin estado de
// cámara y sin alertas de encuadre — por el resto del turno.
describe("presencia: el estado no se pierde si llega antes que el canal", () => {
  beforeEach(() => {
    salirDePresencia();
    removeChannel.mockClear(); track.mockClear(); channel.mockClear();
  });

  it("se publica al abrir el canal lo que se intentó antes", async () => {
    const { useCoworkMediaPresence: usar } = await import("@/hooks/useCoworkMediaPresence");

    // Sin sesión todavía: el canal no existe.
    const { result, rerender } = renderHook(
      ({ s }) => usar(s, CHATTER, { persistente: true }),
      { initialProps: { s: undefined as string | undefined } },
    );
    expect(channel).not.toHaveBeenCalled();

    // La llamada avisa su estado igual. Antes esto se perdía para siempre.
    act(() => result.current.trackMediaState({ micOn: true, camOn: true, screenShareOn: false }));
    expect(track).not.toHaveBeenCalled();

    // Llega la sesión → se abre el canal → tiene que publicarse lo pendiente.
    rerender({ s: SESION });
    expect(channel).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toMatchObject({ user_id: CHATTER, camOn: true });
  });
});

// ── El freno de publicación ────────────────────────────────────────────────
//
// EL BUG QUE ESTO CUIDA, medido en producción el 30/08/2026: Supabase corta al
// cliente que manda demasiados mensajes de presencia
// (`ClientPresenceRateLimitReached`) y le corta el SOCKET ENTERO, no solo el
// canal. Al entrar a una sala se juntaban media docena de publicaciones en
// menos de un segundo —micro, cámara, pantalla, el detector de encuadre, el
// reanuncio de la suscripción—, cada una con su propio `track()`. Con eso
// alcanzaba: esa persona quedaba muda para la supervisión por el resto del
// turno, sin un solo error a la vista.
//
// Se encontró con el canal de una sesión con once personas adentro y CERO
// presencias publicadas, y diez cortes en las dos horas previas en los logs.
describe("el freno de publicación de presencia", () => {
  beforeEach(() => {
    salirDePresencia();
    track.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("junta la ráfaga de entrar a una sala en una sola publicación", () => {
    const { result } = renderHook(() =>
      useCoworkMediaPresence(SESION, CHATTER, { persistente: true }),
    );
    const publicar = result.current.trackMediaState;

    // Lo que pasa de verdad al entrar: seis avisos en el mismo instante.
    act(() => {
      publicar({ micOn: false, camOn: false, screenShareOn: false });
      publicar({ micOn: true, camOn: false, screenShareOn: false });
      publicar({ micOn: true, camOn: true, screenShareOn: false });
      publicar({ micOn: true, camOn: true, screenShareOn: false, faceState: "cam_off", faceSince: 1 });
      publicar({ micOn: true, camOn: true, screenShareOn: false, faceState: "ok", faceSince: 2 });
      publicar({ micOn: true, camOn: true, screenShareOn: true, faceState: "ok", faceSince: 2 });
    });

    // La primera sale al toque: "acabo de entrar" no puede esperar.
    expect(track).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(2_100); });

    // Y las otras cinco salen como UNA, con el estado más nuevo. Antes salían
    // seis, y seis alcanzaban para que el servidor cortara.
    expect(track).toHaveBeenCalledTimes(2);
    const ultimo = track.mock.calls[1][0] as Record<string, unknown>;
    expect(ultimo.screenShareOn).toBe(true);
    expect(ultimo.faceState).toBe("ok");
  });

  it("no se traga un cambio: lo que llega después de la ventana sí sale", () => {
    const { result } = renderHook(() =>
      useCoworkMediaPresence(SESION, CHATTER, { persistente: true }),
    );
    act(() => { result.current.trackMediaState({ micOn: true, camOn: true, screenShareOn: false }); });
    expect(track).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(2_100); });
    act(() => { result.current.trackMediaState({ micOn: false, camOn: true, screenShareOn: false }); });
    expect(track).toHaveBeenCalledTimes(2);
    expect((track.mock.calls[1][0] as Record<string, unknown>).micOn).toBe(false);
  });
});

// ── El aviso que gritaba en falso ──────────────────────────────────────────
//
// EL BUG QUE ESTO CUIDA (31/08/2026): al cerrar un canal, Supabase llama al
// callback de suscripción con "CLOSED". Nuestro código avisaba ante cualquier
// estado que no fuera "SUBSCRIBED", así que **salir de Cowork disparaba el
// aviso de "el tablero no va a recibir estados de nadie"** — una acción
// perfectamente normal, que se hace veinte veces por día.
//
// Lo detectó Jhon: "¿no es porque me salí de Cowork y fui a Messenger?". Tenía
// razón; yo lo había reportado como si su tablero se hubiera quedado ciego.
//
// Importa porque ese aviso es el ÚNICO detector de la ceguera de verdad (la de
// #1458, con gente adentro y el canal caído). Si suena cada vez que alguien
// sale de la pantalla, en una semana nadie le cree. Una alarma que grita en
// falso es una alarma perdida.
describe("el aviso de canal caído no debe gritar por un cierre nuestro", () => {
  beforeEach(() => {
    salirDePresencia();
    removeChannel.mockClear();
    channel.mockClear();
    subscribe.mockClear();
  });

  /** El último callback de suscripción que registró el mock. */
  const ultimoCallback = () =>
    subscribe.mock.calls.at(-1)?.[0] as ((estado: string) => void) | undefined;

  it("salir de Cowork NO avisa: el cierre lo pedimos nosotros", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // El supervisor NO usa presencia persistente: al desmontar, se cierra.
    const { unmount } = renderHook(() => useCoworkMediaPresence(SESION, "supervisor-1"));
    const cb = ultimoCallback();

    unmount();
    // Esto es lo que hace Supabase de verdad al cerrar un canal.
    cb?.("CLOSED");

    expect(removeChannel).toHaveBeenCalled();   // sí se cerró
    expect(warn).not.toHaveBeenCalled();        // pero no gritó
    warn.mockRestore();
  });

  it("pero si el canal se cae SOLO, sí avisa — que es para lo que existe", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useCoworkMediaPresence(SESION, "supervisor-1"));

    // Nadie pidió cerrarlo: se cayó.
    ultimoCallback()?.("CHANNEL_ERROR");

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain("canal de presencia");
    warn.mockRestore();
  });
});
