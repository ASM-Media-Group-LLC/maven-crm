// El primer render ya tiene que saber si es teléfono: con `undefined` de
// arranque, la app pintaba un frame de escritorio y saltaba.
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

const original = window.matchMedia;
function conMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

describe("useIsMobile", () => {
  afterEach(() => { Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: original }); });
  it("primer render true en teléfono", () => {
    conMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
  it("primer render false en escritorio", () => {
    conMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
