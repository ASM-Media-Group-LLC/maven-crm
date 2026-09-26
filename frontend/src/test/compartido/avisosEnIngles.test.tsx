// Los avisos y errores que arman los HOOKS y lib/ —no las pantallas— con la app
// en INGLÉS: la llamada (useLiveKit + lib/avisosDeLlamada + lib/compartirPantalla),
// el evaluador de chatters, el inicio de sesión y el pie de Cowork.
//
// Salen por traducir() porque se arman en callbacks, eventos y mutaciones, así
// que el idioma que importa es el que está fijado EN EL MOMENTO del aviso. Cada
// prueba lo fija con fijarIdioma(), igual que lo hace el LanguageProvider, y
// vuelve a español al terminar.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fijarIdioma } from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// ── La sala de LiveKit, de mentira: `connect` se controla desde cada prueba ──
let alConectar: () => Promise<void> = () => Promise.resolve();
vi.mock("livekit-client", () => ({
  // `function` y no flecha: useLiveKit hace `new Room(...)`.
  Room: vi.fn().mockImplementation(function () { return {
    connect: () => alConectar(),
    disconnect: vi.fn(),
    on: vi.fn().mockReturnThis(),
    localParticipant: {
      identity: "user-1",
      name: "Test User",
      sid: "sid-local",
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: true,
      audioTrackPublications: new Map(),
      videoTrackPublications: new Map(),
      connectionQuality: 3,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn(),
      permissions: { canPublish: true, canSubscribe: true },
      metadata: '{"isAdmin":false}',
    },
    remoteParticipants: new Map(),
    startAudio: vi.fn().mockResolvedValue(undefined),
    canPlaybackAudio: true,
  }; }),
  RoomEvent: new Proxy({}, { get: (_t, p) => String(p) }),
  TrackEvent: new Proxy({}, { get: (_t, p) => String(p) }),
  DisconnectReason: { DUPLICATE_IDENTITY: 2 },
  Track: { Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share" } },
  ConnectionState: { Disconnected: "disconnected", Connecting: "connecting", Connected: "connected" },
  VideoPresets: { h1080: { resolution: { width: 1920, height: 1080 } }, h720: { resolution: { width: 1280, height: 720 } }, h180: {}, h360: {} },
  ScreenSharePresets: { h360fps3: { width: 640, height: 360, encoding: { maxBitrate: 200000, maxFramerate: 3 } } },
  ConnectionQuality: { Excellent: 3, Good: 2, Poor: 1, Lost: 0, Unknown: -1 },
  createLocalTracks: vi.fn().mockResolvedValue([]),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));
vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn().mockReturnValue({ switchTo: vi.fn(), destroy: vi.fn() }),
  supportsBackgroundProcessors: vi.fn().mockReturnValue(false),
}));
vi.mock("@/pages/messenger/videocall/BackgroundSelector", () => ({ BACKGROUND_TEMPLATES: [] }));
// La cancelación de ruido carga un worklet por `?url`; acá no hace falta.
vi.mock("@/lib/noise-suppression-processor", () => ({
  NoiseSuppresionTrackProcessor: vi.fn(),
  supportsNoiseSuppression: () => false,
  loadNCPreference: () => false,
  saveNCPreference: () => {},
}));

// El perfil de quien dispara un aviso de la sala, y la base del evaluador.
const perfil = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => perfil() }) }) }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

const avisarPersona = vi.fn();
vi.mock("@/lib/avisoPersona", () => ({ avisarPersona: (...a: unknown[]) => avisarPersona(...a) }));

import { useLiveKit } from "@/hooks/useLiveKit";
import { mostrarAvisoDeSala, avisarSalidaDeLlamada } from "@/lib/avisosDeLlamada";
import { motivoDeFalloAlCompartir } from "@/lib/compartirPantalla";
import { traducirErrorAuth } from "@/lib/authErrors";
import { useCreateChatterProfile, useRenameChatterSession } from "@/hooks/useChatterEvaluator";
import type { Room } from "livekit-client";

const UUID_ANA = "11111111-1111-4111-8111-111111111111";
const UUID_YO = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  fijarIdioma("en");
  avisarPersona.mockClear();
  perfil.mockReset();
  perfil.mockResolvedValue({ data: { full_name: "Ana Gomez", avatar_url: null, avatar_seed: null } });
  alConectar = () => Promise.resolve();
});
afterEach(() => fijarIdioma("es"));

/** Los textos de un aviso de avisarPersona: título y detalle. */
const textosDelAviso = () =>
  avisarPersona.mock.calls.flatMap(([a]) => [(a as { titulo: string }).titulo, (a as { detalle?: string }).detalle ?? ""]);

describe("la llamada en inglés", () => {
  it("si la conexión se corta por tiempo, el error de la pantalla sale en inglés y con el servidor", async () => {
    alConectar = () => Promise.reject(new Error("could not establish signal connection: timed out"));
    const { result } = renderHook(() => useLiveKit());
    await act(async () => {
      await result.current
        .connect("sala", "Test User", false, {
          tokenProvider: () => Promise.resolve({ token: "t", url: "wss://lk.example.test" }),
        })
        .catch(() => {});
    });
    expect(result.current.error).toBe(
      "Couldn't connect to the video server (lk.example.test). Check that LiveKit is running and that HTTPS/WSS on port 443 is reachable.",
    );
    expect(esEspanol(result.current.error ?? "")).toBe(false);
  });

  it("moderar sin estar en una llamada dice por qué en inglés", async () => {
    const { result } = renderHook(() => useLiveKit());
    await expect(result.current.muteParticipant("alguien")).rejects.toThrow("You're not in a call");
  });

  it("los avisos de la sala (silenciado, grabación, salida) salen en inglés", async () => {
    const yo = `${UUID_YO}_1`;
    const ana = { uuid: UUID_ANA, nombre: "Ana Gomez" };
    await mostrarAvisoDeSala({ clase: "silenciado", por: ana, objetivo: { uuid: UUID_YO, nombre: "Me", identity: yo } }, yo);
    await mostrarAvisoDeSala({ clase: "silenciados-todos", por: ana }, yo);
    await mostrarAvisoDeSala({ clase: "grabando", por: ana }, yo);
    await mostrarAvisoDeSala({ clase: "grabacion-detenida", por: ana }, yo);
    const sala = { state: "connected", remoteParticipants: new Map() } as unknown as Room;
    await avisarSalidaDeLlamada({ identity: `${UUID_ANA}_1`, name: "Ana" }, sala);
    perfil.mockResolvedValue({ data: null });
    await avisarSalidaDeLlamada({ identity: "guest_abc", name: "" }, sala);

    expect(textosDelAviso()).toEqual([
      "Ana Gomez muted your microphone", "You can turn it back on whenever you want.",
      "Ana Gomez muted everyone", "You can turn your microphone back on whenever you want.",
      "Ana Gomez started recording the meeting", "Everyone in the room sees the red dot while it lasts.",
      "Ana Gomez stopped the recording", "",
      "Ana Gomez left the meeting", "",
      "A guest left the meeting", "",
    ]);
    expect(textosDelAviso().filter((t) => esEspanol(t))).toEqual([]);
  });

  it("el motivo de un compartir pantalla fallido sale en inglés", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: () => Promise.resolve() },
      configurable: true,
    });
    const noHay = Object.assign(new Error(""), { name: "NotFoundError" });
    expect(motivoDeFalloAlCompartir(noHay)).toBe("No screen was found to share.");
    expect(motivoDeFalloAlCompartir(Object.assign(new Error(""), { name: "OtroError" }))).toBe("Couldn't share the screen.");
  });
});

describe("el inicio de sesión en inglés", () => {
  it("los errores de Supabase Auth se explican en inglés", () => {
    const casos = [
      traducirErrorAuth({ code: "invalid_credentials" }),
      traducirErrorAuth({ code: "email_not_confirmed" }),
      traducirErrorAuth({ status: 429 }),
      traducirErrorAuth({ code: "user_banned" }),
      traducirErrorAuth({ message: "Failed to fetch" }),
      traducirErrorAuth({ message: "algo raro" }),
      traducirErrorAuth(null),
    ];
    expect(casos[0]).toBe("Wrong email or password. Check them and try again.");
    expect(casos[6]).toBe("Couldn't sign in. Try again in a moment.");
    expect(casos.filter((t) => esEspanol(t))).toEqual([]);
  });

  it("y en español siguen diciendo lo de siempre", () => {
    fijarIdioma("es");
    expect(traducirErrorAuth({ code: "invalid_credentials" })).toBe("Correo o contraseña incorrectos. Revisa e intenta de nuevo.");
  });
});

describe("el evaluador de chatters en inglés", () => {
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );

  it("los errores de validación que muestra la pantalla salen en inglés", async () => {
    const crear = renderHook(() => useCreateChatterProfile(), { wrapper: envoltorio });
    await expect(crear.result.current.mutateAsync({ key: "   " })).rejects.toThrow("The internal key is required");

    const renombrar = renderHook(() => useRenameChatterSession(), { wrapper: envoltorio });
    await expect(renombrar.result.current.mutateAsync({ id: "s1", chatterName: " " })).rejects.toThrow("The name can't be empty");
    await waitFor(() => expect(renombrar.result.current.isError).toBe(true));
  });
});
