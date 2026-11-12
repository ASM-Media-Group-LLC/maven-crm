// La página de Costos y conexiones (solo el dueño, 11/11/2026): con datos de
// prueba dibuja el total, los servicios, lo que viene, dónde ahorrar, y en
// Conexiones las pruebas en vivo y lo de adentro. Un fallo se dice como fallo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const EN_20_DIAS = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const SERVICIOS = [
  { id: "google_ia", nombre: "IA de Google", categoria: "ia", proveedor: "Google AI Studio", es_maven: true, monto_usd: "48.00", ciclo: "mensual", fuente: "factura",
    detalle: "USD 17,44 cobrados", proximo_cobro: EN_20_DIAS, proximo_monto_usd: "95.00", proximo_detalle: "Google duplica", ahorro_usd: "70.00", ahorro_detalle: "Pasar a Flash-Lite", orden: 10, activo: true, revisado_at: "" },
  { id: "zoho", nombre: "Correos del equipo", categoria: "correos", proveedor: "Zoho", es_maven: true, monto_usd: null, ciclo: "mensual", fuente: "falta",
    detalle: "59 casillas", revisado: "No lo puedo ver: inicia sesión en Zoho", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null, orden: 70, activo: true, revisado_at: "" },
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
// Las cuentas atadas (11/11): 2 proyectos parados de Supabase con su ahorro, 1
// casilla de alguien que salió, el resto en uso y una cosa que no se ve.
const cuenta = (id: string, servicio_id: string, tipo: string, nombre: string, estado: string, extra: Record<string, unknown> = {}) => ({
  id, servicio_id, tipo, nombre, detalle: null, estado, cantidad: 1, ahorro_usd_mes: null, fuente: "verificado",
  revisado: "Revisado en Supabase el 11/11/2026", orden: 10, ...extra,
});
const CUENTAS = [
  cuenta("p1", "supabase_otros", "proyecto", "BIORA app v2.0", "sin_uso", { ahorro_usd_mes: "9.81", detalle: "0 visitas en 24 h" }),
  cuenta("p2", "supabase_otros", "proyecto", "chatters-ops", "sin_uso", { ahorro_usd_mes: "9.81" }),
  cuenta("p3", "supabase_otros", "proyecto", "KASH Leads", "en_uso"),
  cuenta("z1", "zoho", "buzon", "52 casillas de gente activa", "en_uso", { cantidad: 52, revisado: "Revisado en Maven el 11/11/2026" }),
  cuenta("z2", "zoho", "buzon", "salio@maven-ai.me", "de_alguien_que_salio", { revisado: "Revisado en Maven el 11/11/2026" }),
  cuenta("z3", "zoho", "puesto", "Licencias pagadas en Zoho", "no_se_puede_ver", { fuente: "falta", revisado: "No lo puedo ver: entra tú a Zoho" }),
];
const ZOHO = {
  ok: true, en: "2026-11-11T21:00:00Z", licencias: { compradas: 70, usadas: 69 }, licencias_error: null,
  resumen: { en_uso: 66, sin_uso: 1, de_alguien_que_salio: 1, sin_cuenta_en_maven: 1, total: 69 },
  casillas: [
    { email: "salio@maven-ai.me", nombre: null, estado: "de_alguien_que_salio", ultimaActividad: null },
    { email: "nadie@maven-ai.me", nombre: null, estado: "sin_uso", ultimaActividad: null },
    { email: "corp@unlok.me", nombre: null, estado: "sin_cuenta_en_maven", ultimaActividad: null },
  ],
};
let fallaCostos = false;
let fallaCuentas = false;
const tabla = (t: string) => ({
  select: () => {
    const r = fallaCostos || (fallaCuentas && t === "costos_cuentas") ? { data: null, error: { message: "x" } }
      : { data: t === "costos_servicios" ? SERVICIOS : t === "costos_cobros" ? COBROS : t === "costos_cuentas" ? CUENTAS : [], error: null };
    return { order: () => Promise.resolve(r), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
  },
});
const invocar = vi.fn((_f: string, o?: { body?: { accion?: string } }) =>
  Promise.resolve({ data: o?.body?.accion === "zoho_casillas" ? ZOHO : PING, error: null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => tabla(t),
    rpc: () => Promise.resolve({ data: BASE, error: null }),
    functions: { invoke: (f: string, o?: { body?: { accion?: string } }) => invocar(f, o) },
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
    expect(await screen.findByText(/^oficina\.costos\.cifraMes \{/)).toBeTruthy();
    expect(screen.getByText(/^oficina\.costos\.cifraAno \{/)).toBeTruthy();
    // El total al mes, lo primero.
    expect(screen.getByText("oficina.costos.teCuesta")).toBeTruthy();
    // La tabla separa el mes y el año en columnas.
    expect(screen.getAllByText(/^oficina\.costos\.colPagadoMes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^oficina\.costos\.colPagadoAno/).length).toBeGreaterThan(0);
    expect(screen.getByText("oficina.costos.kpi12")).toBeTruthy();
    // Lo gastado este mes: el cobro de Google de hoy.
    expect(screen.getAllByText("USD 17").length).toBeGreaterThan(0);
    // En qué se va: Google y Zoho (sin dato), y lo que falta se dice.
    expect(screen.getAllByText("IA de Google").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No lo puedo ver: inicia sesión en Zoho").length).toBeGreaterThan(0);
    // Sale en «Si ahorras» y en «Dónde puedes bajar costos».
    expect(screen.getAllByText("Pasar a Flash-Lite").length).toBeGreaterThan(0);
    // Lo que no es Maven va aparte.
    expect(screen.getByText(/oficina\.costos\.fueraLinea.*USD 185/)).toBeTruthy();
  });

  it("al tocar un servicio se abre su ficha con sus cobros y el enlace a su factura", async () => {
    pintar("/oficina/costos");
    const fila = (await screen.findAllByText("IA de Google")).map((e) => e.closest("button")).find(Boolean)!;
    fireEvent.click(fila);
    expect(await screen.findByText(/oficina\.costos\.fichaCobros/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.fichaPanel/).closest("a")?.getAttribute("href")).toBe("https://aistudio.google.com/spend");
  });

  it("si no se puede leer, lo dice y deja reintentar", async () => {
    fallaCostos = true;
    pintar("/oficina/costos");
    // La página reintenta una vez sola antes de mostrar el fallo.
    expect(await screen.findByText("oficina.costos.fallo", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("oficina.costos.reintentar")).toBeTruthy();
  });
});

describe("Cuentas atadas y dónde bajar costos", () => {
  beforeEach(() => { fallaCostos = false; fallaCuentas = false; invocar.mockClear(); });

  it("suma lo que podrías bajar al mes y dice dónde, sin contar dos veces", async () => {
    pintar("/oficina/costos");
    expect(await screen.findByText("oficina.costos.bajar.titulo")).toBeTruthy();
    // 2 proyectos parados × 9,81 (las cuentas mandan sobre el 18,54 del servicio) + 70 de Google.
    expect(await screen.findByText("USD 90")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.bajar\.menos.*USD 19,62/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.bajar\.menos.*USD 70/)).toBeTruthy();
    // Zoho tiene una casilla de alguien que salió, pero el precio no se ve: se dice.
    expect(screen.getByText("oficina.costos.bajar.sinPrecioFila")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.bajar\.sinPrecio \{"n":1\}/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.bajar\.revise.*"t":57.*"u":53.*"s":2.*"g":1.*"v":1/)).toBeTruthy();
    // Lo que no es Maven se marca como tal.
    expect(screen.getByText("oficina.costos.bajar.noEsMaven")).toBeTruthy();
  });

  it("al tocar un candidato se abre su ficha con sus cuentas atadas, lo que se puede soltar primero", async () => {
    pintar("/oficina/costos");
    const fila = (await screen.findAllByText("Supabase: otros 20 proyectos")).map((e) => e.closest("button")).find(Boolean)!;
    fireEvent.click(fila);
    expect(await screen.findByText("oficina.costos.cuentas.titulo")).toBeTruthy();
    const nombres = ["BIORA app v2.0", "chatters-ops", "KASH Leads"].map((n) => screen.getByText(n));
    // Orden: los parados (con ahorro) antes que el que se usa.
    expect(nombres[0].compareDocumentPosition(nombres[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("0 visitas en 24 h")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.cuentas\.siSueltas.*USD 19,62/)).toBeTruthy();
    expect(screen.getAllByText("oficina.costos.cuentas.estado.sin_uso").length).toBeGreaterThan(1);
    expect(screen.getByText("Revisado en Supabase el 11/11/2026")).toBeTruthy();
    // No es Maven: no se inventa un «gastado por Maven», y el ahorro no se repite abajo.
    expect(screen.queryByText(/oficina\.costos\.fichaCobros/)).toBeNull();
    expect(screen.queryByText(/oficina\.costos\.fichaAhorro/)).toBeNull();
  });

  it("Zoho: la ficha lee en vivo las licencias y cada casilla solo cuando se pide", async () => {
    pintar("/oficina/costos");
    const fila = (await screen.findAllByText("Correos del equipo")).map((e) => e.closest("button")).find(Boolean)!;
    fireEvent.click(fila);
    expect(await screen.findByText("salio@maven-ai.me")).toBeTruthy();
    expect(screen.getByText("No lo puedo ver: entra tú a Zoho")).toBeTruthy();
    expect(invocar.mock.calls.some(([, o]) => o?.body?.accion === "zoho_casillas")).toBe(false);
    fireEvent.click(screen.getByText("oficina.costos.zoho.ver"));
    expect(await screen.findByText(/oficina\.costos\.zoho\.licencias \{"u":69,"c":70\}/)).toBeTruthy();
    expect(invocar).toHaveBeenCalledWith("conexiones-ping", { body: { accion: "zoho_casillas" } });
    expect(screen.getByText("corp@unlok.me")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.zoho\.sobran \{"hoy":1,"despues":3\}/)).toBeTruthy();
  });

  it("si las cuentas no se pueden leer, el bloque lo dice y el resto de la página sigue", async () => {
    fallaCuentas = true;
    pintar("/oficina/costos");
    expect(await screen.findByText("oficina.costos.bajar.titulo")).toBeTruthy();
    expect(await screen.findByText("oficina.costos.fallo", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("oficina.costos.teCuesta")).toBeTruthy();
    expect(screen.queryByText("oficina.costos.bajar.nada")).toBeNull();
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
