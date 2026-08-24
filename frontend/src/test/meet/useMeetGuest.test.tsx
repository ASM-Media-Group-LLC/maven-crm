import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMeetGuest } from "@/hooks/useMeetGuest";

// La garantía que importa acá: el invitado NO tiene token hasta que alguien lo
// admite. La decisión real es del servidor (la edge no lo emite antes), pero el
// cliente tampoco debe inventarse un estado "adentro".
const CODE = "ABC234";

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

// jsdom de esta versión expone un localStorage incompleto (sin `clear`), así que
// montamos uno propio en memoria: el hook guarda ahí el secreto del invitado.
function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
  });
}

describe("useMeetGuest", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    installLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("golpear deja al invitado en espera, sin token", async () => {
    mockFetchOnce({ guestToken: "g".repeat(64), roomName: "Reunión", status: "pending" });

    const { result } = renderHook(() => useMeetGuest(CODE));
    await act(async () => { await result.current.knock("Ana"); });

    expect(result.current.status).toBe("pending");
    expect(result.current.call).toBeNull();
    await expect(result.current.getToken()).rejects.toThrow(/no te admitieron/i);
  });

  it("guarda el secreto para que una recarga no gaste otro intento", async () => {
    const guestToken = "g".repeat(64);
    mockFetchOnce({ guestToken, roomName: "Reunión", status: "pending" });

    const { result } = renderHook(() => useMeetGuest(CODE));
    await act(async () => { await result.current.knock("Ana"); });

    expect(window.localStorage.getItem(`meet.guest.${CODE}`)).toBe(guestToken);
  });

  it("al retomar una solicitud ya admitida entrega el token de la llamada", async () => {
    window.localStorage.setItem(`meet.guest.${CODE}`, "g".repeat(64));
    mockFetchOnce({
      status: "admitted", token: "lk.jwt.token", url: "wss://lk.asmtech.ai",
      room: "meet_abc123", roomName: "Reunión", guestName: "Ana",
    });

    const { result } = renderHook(() => useMeetGuest(CODE));

    await waitFor(() => expect(result.current.status).toBe("admitted"));
    expect(result.current.call).toEqual({
      token: "lk.jwt.token", url: "wss://lk.asmtech.ai", room: "meet_abc123",
    });
    await expect(result.current.getToken()).resolves.toEqual({
      token: "lk.jwt.token", url: "wss://lk.asmtech.ai",
    });
  });

  it("un rechazo queda como rechazo y no da token", async () => {
    window.localStorage.setItem(`meet.guest.${CODE}`, "g".repeat(64));
    mockFetchOnce({ status: "denied" });

    const { result } = renderHook(() => useMeetGuest(CODE));

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.call).toBeNull();
  });

  it("si la reunión terminó lo dice, en vez de dejarlo esperando para siempre", async () => {
    window.localStorage.setItem(`meet.guest.${CODE}`, "g".repeat(64));
    mockFetchOnce({ status: "ended" });

    const { result } = renderHook(() => useMeetGuest(CODE));

    await waitFor(() => expect(result.current.status).toBe("ended"));
  });

  it("propaga el mensaje del servidor cuando frena por rate limit", async () => {
    mockFetchOnce({ error: "Demasiados intentos. Espera unos minutos." }, false, 429);

    const { result } = renderHook(() => useMeetGuest(CODE));
    await act(async () => { await result.current.knock("Ana"); });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/demasiados intentos/i);
  });

  it("una solicitud que ya no existe vuelve al formulario en vez de trabarse", async () => {
    window.localStorage.setItem(`meet.guest.${CODE}`, "g".repeat(64));
    mockFetchOnce({ error: "Solicitud no encontrada" }, false, 404);

    const { result } = renderHook(() => useMeetGuest(CODE));

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(window.localStorage.getItem(`meet.guest.${CODE}`)).toBeNull();
  });
});
