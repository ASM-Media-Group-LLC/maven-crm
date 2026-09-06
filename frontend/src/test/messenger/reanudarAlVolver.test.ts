import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReanudarAlVolver, MINIMO_OCULTO_MS } from "@/hooks/useReanudarAlVolver";

function ponerVisibilidad(v: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useReanudarAlVolver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it("oculto 31 s → visible: llama una vez con los ms ocultos", () => {
    const cb = vi.fn();
    renderHook(() => useReanudarAlVolver(cb));
    ponerVisibilidad("hidden");
    vi.advanceTimersByTime(MINIMO_OCULTO_MS + 1000);
    ponerVisibilidad("visible");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeGreaterThanOrEqual(MINIMO_OCULTO_MS);
  });

  it("oculto 5 s: no llama (cambiar de pestaña un momento no cuenta)", () => {
    const cb = vi.fn();
    renderHook(() => useReanudarAlVolver(cb));
    ponerVisibilidad("hidden");
    vi.advanceTimersByTime(5000);
    ponerVisibilidad("visible");
    expect(cb).not.toHaveBeenCalled();
  });

  it("pageshow desde bfcache y volver a tener red también llaman", () => {
    const cb = vi.fn();
    renderHook(() => useReanudarAlVolver(cb));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    window.dispatchEvent(new Event("online"));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("al desmontar deja de escuchar", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useReanudarAlVolver(cb));
    unmount();
    window.dispatchEvent(new Event("online"));
    expect(cb).not.toHaveBeenCalled();
  });
});
