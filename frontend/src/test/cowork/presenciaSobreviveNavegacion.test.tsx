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
const track = vi.fn();
const subscribe = vi.fn();

function canalFalso() {
  const canal = {
    on: vi.fn(() => canal),
    subscribe: (...a: unknown[]) => { subscribe(...a); return canal; },
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

  it("cambiar de sesión sí cierra la anterior", () => {
    const { rerender } = renderHook(
      ({ s }) => useCoworkMediaPresence(s, CHATTER, { persistente: true }),
      { initialProps: { s: SESION } },
    );
    rerender({ s: "sesion-2" });
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(channel).toHaveBeenCalledTimes(2);
  });
});
