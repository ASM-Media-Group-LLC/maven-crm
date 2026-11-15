// EL SALDO DE GEMINI, EN VIVO (Alvaro, 14/11/2026: «tienes que estar muy pilas de
// cuánto queda… conectadísimo; si no, metida de verga»). La tarjeta va arriba de
// las pestañas de Costos: cuánto queda, cuánto gasta Argos al día, cuándo se
// acaba; si Google cortó, lo dice en rojo; si la consulta falla, UNA fila con
// Reintentar (nunca un saldo inventado). «Anotar saldo» guarda lo de AI Studio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { diasConUnDecimal, esSaldoGemini, leerSaldo, nivelDelSaldo, porcentajeQueQueda, type SaldoGemini as Saldo } from "@/lib/saldoGemini";

const BIEN: Saldo = {
  estado: "bien", saldo_usd: 19.77, punto: { id: 1, saldo_usd: 19.87, medido_at: "2026-11-14T14:17:00Z", origen: "recarga" },
  juzgadas_desde: 36, gastado_usd: 0.1, precio_foto_usd: 0.0027, ritmo_dia_usd: 5.2, dias_restantes: 3.8,
  se_acaba_at: "2026-11-18T09:36:00Z", ultimo_ok: "2026-11-14T14:24:00Z", sin_saldo_at: null, argos_activo: true,
  calculado_at: "2026-11-14T14:24:00Z",
};

let respuesta: { data: unknown; error: { message: string } | null } = { data: BIEN, error: null };
const rpc = vi.fn((f: string, _a?: unknown) => Promise.resolve(f === "ia_saldo_anotar" ? { data: { ...BIEN, saldo_usd: 50 }, error: null } : respuesta));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (f: string, a?: unknown) => rpc(f, a) } }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) }),
}));

import SaldoGemini from "@/components/costos/SaldoGemini";

const pintar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SaldoGemini /></QueryClientProvider>,
);

describe("cómo se dice cada estado", () => {
  it("bien en verde; pocos días en ámbar; hoy y sin saldo en rojo (urgente)", () => {
    expect(nivelDelSaldo(BIEN)).toMatchObject({ clave: "oficina.costos.saldo.estado.bien", urgente: false });
    expect(nivelDelSaldo({ ...BIEN, estado: "pocos_dias" })).toMatchObject({ clave: "oficina.costos.saldo.estado.pocos", urgente: true });
    expect(nivelDelSaldo({ ...BIEN, estado: "se_acaba_hoy" }).color).toContain("destructive");
    expect(nivelDelSaldo({ ...BIEN, estado: "sin_saldo" })).toMatchObject({ clave: "oficina.costos.saldo.estado.sinSaldo", urgente: true });
  });
  it("la barra es lo que queda del último saldo anotado; sin saldo es 0", () => {
    expect(Math.round(porcentajeQueQueda(BIEN))).toBe(99);
    expect(porcentajeQueQueda({ ...BIEN, saldo_usd: -2 })).toBe(0);
    expect(porcentajeQueQueda({ ...BIEN, estado: "sin_saldo" })).toBe(0);
  });
  it("los días con coma y la casilla acepta «19,87», «$ 20» y rechaza basura", () => {
    expect(diasConUnDecimal(3.8, "es")).toBe("3,8");
    expect(leerSaldo("19,87")).toBe(19.87);
    expect(leerSaldo("$ 20")).toBe(20);
    expect(leerSaldo("abc")).toBeNull();
    expect(leerSaldo("")).toBeNull();
  });
  it("una respuesta que no es un saldo NO se toma por saldo", () => {
    expect(esSaldoGemini(BIEN)).toBe(true);
    expect(esSaldoGemini({ crons: {} })).toBe(false);
    expect(esSaldoGemini(null)).toBe(false);
  });
});

describe("la tarjeta", () => {
  beforeEach(() => { respuesta = { data: BIEN, error: null }; rpc.mockClear(); });

  it("cuánto queda, cuántos días, cuándo se acaba, la cuenta y el botón para recargar", async () => {
    pintar();
    expect(await screen.findByText("USD 19,77")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.saldo\.estado\.bien \{"d":"3,8"\}/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.saldo\.seAcaba \{"f":".+","r":"USD 5,20?"\}/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.saldo\.desdeRecarga .*"n":"36".*"g":"USD 0,10?"/)).toBeTruthy();
    const recargar = screen.getByText("oficina.costos.saldo.recargar").closest("a");
    expect(recargar?.getAttribute("href")).toBe("https://aistudio.google.com/billing");
    expect(recargar?.getAttribute("target")).toBe("_blank");
  });

  it("si Google cortó: «Sin saldo» y desde cuándo", async () => {
    respuesta = { data: { ...BIEN, estado: "sin_saldo", sin_saldo_at: "2026-11-13T20:05:00Z" }, error: null };
    pintar();
    expect(await screen.findByText("oficina.costos.saldo.cero")).toBeTruthy();
    expect(screen.getByText("oficina.costos.saldo.estado.sinSaldo {\"d\":\"3,8\"}")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.saldo\.cortado/)).toBeTruthy();
  });

  it("si la consulta falla: una fila con Reintentar, nunca un saldo", async () => {
    respuesta = { data: null, error: { message: "x" } };
    pintar();
    expect(await screen.findByText("oficina.costos.saldo.fallo", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("oficina.costos.reintentar")).toBeTruthy();
    expect(screen.queryByText(/USD/)).toBeNull();
  });

  it("anotar el saldo de AI Studio llama a ia_saldo_anotar con lo escrito y si fue recarga", async () => {
    pintar();
    fireEvent.click(await screen.findByText("oficina.costos.saldo.anotar"));
    fireEvent.change(screen.getByLabelText("oficina.costos.saldo.anotarQue"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByText("oficina.costos.saldo.guardar"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ia_saldo_anotar", { _saldo: 50, _recarga: true }));
  });
});

describe("dónde va", () => {
  const pagina = (import.meta as unknown as { glob: (p: string, o: Record<string, unknown>) => Record<string, string> })
    .glob("/frontend/src/pages/oficina/CostosPage.tsx", { query: "?raw", import: "default", eager: true });
  const tablero = (import.meta as unknown as { glob: (p: string, o: Record<string, unknown>) => Record<string, string> })
    .glob("/frontend/src/components/costos/TableroGasto.tsx", { query: "?raw", import: "default", eager: true });
  it("en el tablero de gasto, arriba de las pestañas de Costos, siempre a la vista", () => {
    const src = Object.values(pagina)[0] ?? "";
    expect(src.indexOf("<TableroGasto />")).toBeGreaterThan(0);
    expect(src.indexOf("<TableroGasto />")).toBeLessThan(src.indexOf("<Tabs"));
    expect(Object.values(tablero)[0] ?? "").toContain("<SaldoGemini />");
  });
});
