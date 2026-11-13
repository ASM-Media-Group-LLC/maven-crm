import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() }, functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useMonitorEstado", () => ({ useMonitorEstado: () => ({ esAdmin: null, activo: null }) }));

import { medidasDelCompuesto } from "@/hooks/useArgosEscaleraClip";

// GUARDA (Alvaro, 13/11/2026): el video de Argos lleva la pantalla Y la cámara.
const fuente = Object.values(import.meta.glob("../../hooks/useArgosEscaleraClip.ts", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("video de Argos con cámara", () => {
  it("graba el lienzo con pantalla + cámara, y la pantalla sola solo si no se puede componer", () => {
    expect(fuente).toMatch(/const compuesto = crearCompuesto\(pantalla, trackCamRef\.current\);/);
    expect(fuente).toMatch(/compuesto\?\.stream \?\? new MediaStream\(\[pantalla\]\)/);
  });
  it("nunca detiene las pistas de LiveKit: solo las del lienzo", () => {
    expect(fuente).toMatch(/for \(const t of stream\.getTracks\(\)\) t\.stop\(\); \/\/ solo las del lienzo/);
  });
  it("la cámara va en un recuadro abajo a la derecha, sin pasar de 1280 de ancho", () => {
    const m = medidasDelCompuesto(1920, 1080);
    expect(m.w).toBe(1280);
    expect(m.h).toBe(720);
    expect(m.camW).toBeLessThan(m.w / 3);
    expect(medidasDelCompuesto().w).toBe(1280);
  });
});
