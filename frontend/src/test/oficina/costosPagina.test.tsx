// La página de Costos y conexiones (solo el dueño, 11/11/2026): con datos de
// prueba dibuja el total, los servicios, lo que viene, dónde ahorrar, y en
// Conexiones las pruebas en vivo y lo de adentro. Un fallo se dice como fallo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const EN_20_DIAS = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const SERVICIOS = [
  { id: "google_ia", nombre: "IA de Google", categoria: "ia", proveedor: "Google AI Studio", es_maven: true, monto_usd: "48.00", ciclo: "mensual", fuente: "factura",
    detalle: "USD 17,44 cobrados", proximo_cobro: EN_20_DIAS, proximo_monto_usd: "95.00", proximo_detalle: "Google duplica", ahorro_usd: "70.00", ahorro_detalle: "Pasar a Flash-Lite", orden: 10, activo: true, revisado_at: "" },
  { id: "zoho", nombre: "Correos del equipo", categoria: "correos", proveedor: "Zoho", es_maven: true, monto_usd: null, ciclo: "mensual", fuente: "falta",
    detalle: "59 casillas", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null, orden: 70, activo: true, revisado_at: "" },
  { id: "supabase_otros", nombre: "Supabase: otros 20 proyectos", categoria: "otras", proveedor: "Supabase", es_maven: false, monto_usd: "185.00", ciclo: "mensual", fuente: "factura",
    detalle: "No son Maven", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: "18.54", ahorro_detalle: "Apagar BLU", orden: 200, activo: true, revisado_at: "" },
];
const BASE = {
  crons: { activos: 70, fallando: [{ job: "vigia-blu", mensaje: "x", hace_min: 3 }], apagados: [] },
  correo_equipo: { conectadas: 40, con_error: 0, sin_sincronizar: 2 },
  backstage: { llaves: 0, ultimo_envio: null },
  llamadas: { cortes_1h: 2, midiendo_1h: 15 },
  subidas: { ok_24h: 3, fallo_24h: 0, trabadas: 0 },
  nas: { caido: false, desde: null, pendientes: 0 },
  incidentes: [],
  hubstaff: null,
};
const PING = { ok: true, en: "2026-11-11T19:00:00Z", chequeos: [
  { id: "google_ia", estado: "ok", ms: 120, detalle: "Llave viva" },
  { id: "anthropic", estado: "mal", ms: 90, detalle: "Error 401: la llave no sirve" },
] };

const HOY = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
const COBROS = [{ servicio_id: "google_ia", fecha: HOY, monto_usd: "17.44", fuente: "factura", nota: null }];
let fallaCostos = false;
const tabla = (t: string) => ({
  select: () => {
    const r = fallaCostos ? { data: null, error: { message: "x" } }
      : { data: t === "costos_servicios" ? SERVICIOS : t === "costos_cobros" ? COBROS : [], error: null };
    return { order: () => Promise.resolve(r), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
  },
});
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => tabla(t),
    rpc: () => Promise.resolve({ data: BASE, error: null }),
    functions: { invoke: () => Promise.resolve({ data: PING, error: null }) },
  },
}));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) }),
}));
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));

import CostosPage from "@/pages/oficina/CostosPage";

const pintar = (ruta: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[ruta]}><CostosPage /></MemoryRouter>
  </QueryClientProvider>,
);

describe("Costos", () => {
  beforeEach(() => { fallaCostos = false; });

  it("muestra lo gastado en el mes, el año, los 12 meses, en qué se va y dónde ahorrar", async () => {
    pintar("/oficina/costos");
    expect(await screen.findByText(/^oficina\.costos\.kpiMes \{/)).toBeTruthy();
    expect(screen.getByText(/^oficina\.costos\.kpiAno \{/)).toBeTruthy();
    expect(screen.getByText("oficina.costos.kpi12")).toBeTruthy();
    // Lo gastado este mes: el cobro de Google de hoy.
    expect(screen.getAllByText("USD 17").length).toBeGreaterThan(0);
    // En qué se va: Google y Zoho (sin dato), y lo que falta se dice.
    expect(screen.getAllByText("IA de Google").length).toBeGreaterThan(0);
    expect(screen.getByText("oficina.costos.sinDato")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.faltanCorto.*Correos del equipo/)).toBeTruthy();
    expect(screen.getByText("Pasar a Flash-Lite")).toBeTruthy();
    // Lo que no es Maven va aparte.
    expect(screen.getByText(/oficina\.costos\.fueraLinea.*USD 185/)).toBeTruthy();
  });

  it("si no se puede leer, lo dice y deja reintentar", async () => {
    fallaCostos = true;
    pintar("/oficina/costos");
    // La página reintenta una vez sola antes de mostrar el fallo.
    expect(await screen.findByText("oficina.costos.fallo", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("oficina.costos.reintentar")).toBeTruthy();
  });
});

describe("Conexiones", () => {
  it("prueba en vivo cada servicio y dice lo de adentro", async () => {
    pintar("/oficina/costos?vista=conexiones");
    expect(await screen.findByText("Error 401: la llave no sirve")).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.hayFallas")).toBeTruthy();
    expect(await screen.findByText(/oficina\.conexiones\.cronsMal.*vigia-blu/)).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.backstageSinLlave")).toBeTruthy();
  });
});
