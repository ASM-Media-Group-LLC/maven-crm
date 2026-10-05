// Los avisos que NO son de una pantalla, con la app en INGLÉS:
//   · el supervisor de encuadre y el de compartir pantalla (hooks/useFaceNudge),
//   · la notificación del navegador de un mensaje entrante de WhatsApp y de
//     Telegram (useWaInboxNotifications / useTgInboxNotifications).
// (El cartel de "hay una versión nueva" de main.tsx está en
// recargaPorDeployEnIngles.test.ts.)
//
// Se arman con traducir() en el momento del aviso, así que se prueba el idioma
// que fija el LanguageProvider (fijarIdioma), igual que en la app.
//
// Lo que NO se traduce también se prueba: lo que el supervisor DICE en voz alta
// sigue en español, porque la voz del navegador (lib/voz.ts) es española y una
// frase en inglés con esa voz no se entiende.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fijarIdioma } from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

const toastWarning = vi.fn();
const habla = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => toastWarning(...a) } }));
vi.mock("@/lib/notificationSound", () => ({ playMessageNotification: () => {} }));
vi.mock("@/lib/voz", () => ({ hablar: (...a: unknown[]) => habla(...a) }));
vi.mock("@/lib/coworkPausa", () => ({ estaEnPausa: () => false }));

// ── Bandejas: el canal de realtime, de mentira; la prueba dispara el INSERT ──
type AlInsertar = (payload: { new: Record<string, unknown> }) => Promise<void>;
const canales: Record<string, AlInsertar> = {};
let conversacion: unknown = null;
function cadena(data: unknown) {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => void) => ok({ data, error: null });
      return () => p;
    },
    apply: () => p,
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (nombre: string) => {
      const c = {
        on: (_e: string, filtro: { table: string }, cb: AlInsertar) => { canales[filtro.table] = cb; void nombre; return c; },
        subscribe: () => c,
      };
      return c;
    },
    removeChannel: () => {},
    from: () => cadena(conversacion),
  },
}));
const notificar = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({ settings: { notifications_enabled: true, dnd_enabled: false, sound_enabled: false } }),
}));
vi.mock("@/hooks/useNotificationPreferences", () => ({ useNotificationPreferences: () => ({ isCanalActivo: () => true }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true, isLoading: false }) }));
vi.mock("@/hooks/useChannelSoundMuted", () => ({ getChannelSoundMuted: () => false }));
vi.mock("@/hooks/useBrowserNotifications", () => ({
  useBrowserNotifications: () => ({ notify: (...a: unknown[]) => notificar(...a) }),
  useNotificationPermission: () => {},
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => () => {} }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));

const { useFaceNudge, useScreenShareNudge } = await import("@/hooks/useFaceNudge");
const { useWaInboxNotifications } = await import("@/hooks/useWaInboxNotifications");
const { useTgInboxNotifications } = await import("@/hooks/useTgInboxNotifications");

/** Título y detalle de cada toast.warning que salió. */
const textosDeLosAvisos = () =>
  toastWarning.mock.calls.flatMap(([titulo, op]) => [titulo as string, (op as { description?: string })?.description ?? ""]);

beforeEach(() => {
  fijarIdioma("en");
  toastWarning.mockClear(); habla.mockClear(); notificar.mockClear();
  conversacion = null;
});
afterEach(() => { fijarIdioma("es"); vi.useRealTimers(); });

describe("el supervisor de encuadre, en inglés", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("cada problema de cámara avisa por escrito en inglés… y habla en español", () => {
    for (const state of ["cam_off", "no_face", "too_small", "too_dark"]) {
      renderHook(() => useFaceNudge({ state, since: Date.now() - 95_000 } as never)).unmount();
    }
    expect(toastWarning).toHaveBeenCalledTimes(4);
    expect(textosDeLosAvisos()).toEqual([
      "Your camera is off", "Turn it on, or mark yourself as Break or Bathroom so it's logged.",
      "We can't see your face", "Get in front of the camera. If you need to step away, use the pause button.",
      "You look too far away or cut off", "Get in front of the camera. If you need to step away, use the pause button.",
      "There's very little light", "Get in front of the camera. If you need to step away, use the pause button.",
    ]);
    expect(textosDeLosAvisos().filter((t) => esEspanol(t))).toEqual([]);
    // La voz es española: lo que se DICE no se traduce.
    expect(habla).toHaveBeenCalledTimes(4);
    for (const [frase] of habla.mock.calls) expect(esEspanol(frase as string), frase as string).toBe(true);
  });

  it("sin compartir pantalla: el aviso escrito en inglés, la frase hablada en español", () => {
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(125_000);
    expect(textosDeLosAvisos()).toEqual([
      "You're not sharing your screen", "Screen sharing is required during your shift.",
    ]);
    expect(esEspanol(habla.mock.calls[0][0] as string)).toBe(true);
  });

  it("en español, los avisos de siempre", () => {
    fijarIdioma("es");
    renderHook(() => useFaceNudge({ state: "cam_off", since: Date.now() - 95_000 } as never));
    expect(textosDeLosAvisos()).toEqual([
      "Tienes la cámara apagada", "Enciéndela, o márcate como Break o Baño para que quede registrado.",
    ]);
  });
});

describe("la notificación del navegador de las bandejas, en inglés", () => {
  it("WhatsApp: sin nombre de contacto y con una foto sin texto", async () => {
    renderHook(() => useWaInboxNotifications());
    await canales.wa_conversation_messages({ new: { conversation_id: "c1", direction: "in", body: "", msg_type: "image" } });
    await waitFor(() => expect(notificar).toHaveBeenCalledTimes(1));
    expect(notificar.mock.calls[0].slice(0, 2)).toEqual(["New WhatsApp message", "📷 Photo"]);
  });

  it("Telegram: un adjunto sin texto, y un tipo que no se conoce", async () => {
    renderHook(() => useTgInboxNotifications());
    await canales.tg_messages({ new: { conversation_id: "c2", direction: "in", body: null, msg_type: "media" } });
    await canales.tg_messages({ new: { conversation_id: "c2", direction: "in", body: null, msg_type: "raro" } });
    await waitFor(() => expect(notificar).toHaveBeenCalledTimes(2));
    expect(notificar.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ["New Telegram message", "Attachment"],
      ["New Telegram message", "New message"],
    ]);
  });

  it("el texto del mensaje viaja tal cual, y el nombre del contacto también", async () => {
    conversacion = { peer_name: "Sofía", peer_username: null };
    renderHook(() => useTgInboxNotifications());
    await canales.tg_messages({ new: { conversation_id: "c3", direction: "in", body: "hola, ¿cómo vas?", msg_type: "text" } });
    await waitFor(() => expect(notificar).toHaveBeenCalledTimes(1));
    expect(notificar.mock.calls[0].slice(0, 2)).toEqual(["Sofía (Telegram)", "hola, ¿cómo vas?"]);
  });
});
