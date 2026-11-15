// La página de Costos y conexiones (solo el dueño; rediseño del 13/11/2026):
// «Por parte de Maven» con la cuenta de cada pieza y el uso real del día, «Por
// proveedor» con la parte de cada servicio y su ficha, y «Conexiones» con las
// cuatro fichas y las dos listas. Un fallo se dice como UNA fila con Reintentar:
// nunca ceros, nunca una caja roja que tape la página.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const EN_20_DIAS = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const HOY = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
const DIA = Number(HOY.slice(8, 10));
const SERVICIOS = [
  { id: "google_ia", nombre: "IA de Google", categoria: "ia", proveedor: "Google AI Studio", es_maven: true, monto_usd: "48.00", ciclo: "uso", fuente: "factura",
    detalle: "USD 17,44 cobrados", proximo_cobro: EN_20_DIAS, proximo_monto_usd: "95.00", proximo_detalle: "Google duplica", ahorro_usd: "70.00", ahorro_detalle: "Pasar a Flash-Lite", orden: 10, activo: true, revisado_at: "",
    parte: "argos", precio_unitario_usd: "0.002600", unidad: "foto_juzgada", como_se_calcula: "Fotos juzgadas × USD 0,0026" },
  { id: "supabase_maven", nombre: "Base de datos de Maven", categoria: "servidores", proveedor: "Supabase", es_maven: true, monto_usd: "111.88", ciclo: "mensual", fuente: "factura",
    detalle: null, como_se_calcula: "Servidor de Maven por hora", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null, orden: 30, activo: true, revisado_at: "", parte: "base" },
  { id: "godaddy_maven", nombre: "Dominio maven-ai.me", categoria: "correos", proveedor: "GoDaddy", es_maven: true, monto_usd: "29.99", ciclo: "anual", fuente: "factura",
    detalle: "Renovación automática prendida.", proximo_cobro: EN_20_DIAS, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null, orden: 80, activo: true, revisado_at: "", parte: "base", dia_cobro: 19 },
  { id: "zoho", nombre: "Correos del equipo", categoria: "correos", proveedor: "Zoho", es_maven: true, monto_usd: null, ciclo: "mensual", fuente: "falta",
    detalle: "59 casillas", revisado: "No lo puedo ver: inicia sesión en Zoho", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null, orden: 70, activo: true, revisado_at: "", parte: "correo" },
  { id: "supabase_otros", nombre: "Supabase: otros 20 proyectos", categoria: "otras", proveedor: "Supabase", es_maven: false, monto_usd: "185.00", ciclo: "mensual", fuente: "factura",
    detalle: "No son Maven", proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: "18.54", ahorro_detalle: "Apagar BLU", orden: 200, activo: true, revisado_at: "", parte: "otras" },
];
const USO = {
  desde: `${HOY.slice(0, 8)}01`, hoy: HOY, dias_del_mes: new Date(Date.UTC(Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)), 0)).getUTCDate(),
  calculado_at: new Date().toISOString(),
  dias: Array.from({ length: DIA }, (_, i) => ({
    dia: `${HOY.slice(0, 8)}${String(i + 1).padStart(2, "0")}`,
    pantalla: 100, camara: 100, juzgadas: i + 1 === DIA ? 500 : 1000, al_nas: 0, videos: i + 1 === DIA ? 3 : 0, video_seg: 0,
  })),
  almacenamiento: [{ bucket: "chat-files", gb: 50.4, archivos: 10 }, { bucket: "monitor-capturas", gb: 7.25, archivos: 10 }, { bucket: "argos-clips", gb: 2.14, archivos: 10 }],
};
const BASE = {
  crons: { activos: 70, fallando: [{ job: "vigia-blu", mensaje: "x", hace_min: 3 }], apagados: [] },
  correo_equipo: { conectadas: 40, con_error: 0, sin_sincronizar: 2 },
  backstage: { llaves: 0, ultimo_envio: null },
  llamadas: { cortes_1h: 2, midiendo_1h: 15 },
  subidas: { ok_24h: 3, fallo_24h: 0, trabadas: 0 },
  nas: { caido: false, desde: null, pendientes: 0 },
  incidentes: [{ tipo: "argos_sin_juzgar", mensaje: "425 pantallazos en 15 min, ninguno juzgado", desde: "2026-11-13T20:00:00Z" }],
  hubstaff: null,
};
const PING = { ok: true, en: "2026-11-11T19:00:00Z", chequeos: [
  { id: "google_ia", estado: "ok", ms: 120, detalle: "Llave viva" },
  { id: "anthropic", estado: "mal", ms: 90, detalle: "Error 401: la llave no sirve" },
  { id: "whatsapp", estado: "sin_configurar", ms: null, detalle: "Falta WHATSAPP_EVOLUTION_URL" },
] };

// El saldo de Gemini (14/11/2026), arriba de las pestañas.
const SALDO = {
  estado: "bien", saldo_usd: 19.77, punto: { id: 1, saldo_usd: 19.87, medido_at: "2026-11-14T14:17:00Z", origen: "recarga" },
  juzgadas_desde: 36, gastado_usd: 0.1, precio_foto_usd: 0.0027, ritmo_dia_usd: 5.2, dias_restantes: 3.8,
  se_acaba_at: "2026-11-18T09:36:00Z", ultimo_ok: "2026-11-14T14:24:00Z", sin_saldo_at: null, argos_activo: true,
  calculado_at: "2026-11-14T14:24:00Z",
};
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
let fallaUso = false;
let fallaPing = false;
const tabla = (t: string) => ({
  select: () => {
    const r = fallaCostos || (fallaCuentas && t === "costos_cuentas") ? { data: null, error: { message: "x" } }
      : { data: t === "costos_servicios" ? SERVICIOS : t === "costos_cobros" ? COBROS : t === "costos_cuentas" ? CUENTAS : [], error: null };
    return { order: () => Promise.resolve(r), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
  },
});
const rpc = vi.fn((f: string) => {
  if (f === "costos_uso_del_mes") return Promise.resolve(fallaUso ? { data: null, error: { message: "no existe" } } : { data: USO, error: null });
  if (f === "ia_saldo_estado") return Promise.resolve({ data: SALDO, error: null });
  return Promise.resolve({ data: BASE, error: null });
});
const invocar = vi.fn((_f: string, o?: { body?: { accion?: string } }) =>
  o?.body?.accion === "zoho_casillas" ? Promise.resolve({ data: ZOHO, error: null })
    : Promise.resolve(fallaPing ? { data: null, error: { message: "caído" } } : { data: PING, error: null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => tabla(t),
    rpc: (f: string) => rpc(f),
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
const reiniciar = () => { fallaCostos = false; fallaCuentas = false; fallaUso = false; fallaPing = false; invocar.mockClear(); rpc.mockClear(); };

describe("Por parte de Maven (la pestaña de entrada)", () => {
  beforeEach(reiniciar);

  it("arriba el tablero (lo gastado del mes, hoy y la proyección); Argos pieza por pieza con la cuenta; lo que no es Maven aparte", async () => {
    pintar("/oficina/costos");
    // El tablero de gasto (14/11/2026): lo gastado en lo que va del mes es el número grande.
    expect(await screen.findByText(/^oficina\.costos\.tablero\.gastado \{/)).toBeTruthy();
    expect(screen.getByText("oficina.costos.tablero.proyeccion")).toBeTruthy();
    expect(screen.getByText("oficina.costos.tablero.servicios")).toBeTruthy();
    // La IA de Google: las fotos juzgadas de hoy × el precio por foto, y la factura del mes con la que se cuadra.
    expect(screen.getByText(/oficina\.costos\.pieza\.iaCuenta \{"n":"500","p":"USD 0,0026"/)).toBeTruthy();
    expect(screen.getAllByText(/oficina\.costos\.pieza\.facturado \{"m":"USD 17,44"\}/).length).toBeGreaterThan(0);
    // Hoy: 500 × 0,0026 = 1,30.
    expect(screen.getAllByText("USD 1,30").length).toBeGreaterThan(0);
    // Las seis piezas de Argos.
    for (const k of ["ia", "fotos", "videos", "push", "velocidad"]) expect(screen.getByText(`oficina.costos.pieza.${k}`)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.pieza\.fotosCuenta \{"n":"200","gb":"7,3"\}/)).toBeTruthy();
    // Base de Maven junta lo compartido; Zoho sin dato se dice, no se vuelve 0.
    expect(screen.getAllByText("oficina.costos.parte.base").length).toBeGreaterThan(0);
    expect(screen.getAllByText("oficina.costos.partes.faltaDato").length).toBeGreaterThan(0);
    expect(screen.getByText("No lo puedo ver: inicia sesión en Zoho")).toBeTruthy();
    // Lo que no es Maven, en su tarjeta.
    expect(screen.getByText("oficina.costos.parte.otras")).toBeTruthy();
    // Para ahorrar en Argos.
    expect(screen.getAllByText(/Pasar a Flash-Lite/).length).toBeGreaterThan(0);
    // El día a día del mes.
    expect(screen.getByRole("img", { name: /oficina\.costos\.tablero\.diario/ })).toBeTruthy();
  });

  it("si el uso no se puede leer, lo dice con Reintentar y lo fijo se sigue viendo (sin ceros inventados)", async () => {
    fallaUso = true;
    pintar("/oficina/costos");
    expect((await screen.findAllByText("oficina.costos.partes.sinUso", undefined, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("oficina.costos.reintentar").length).toBeGreaterThan(0);
    expect(screen.queryByText("oficina.costos.partes.alRitmo")).toBeNull();
    // La Base de Maven sale de las facturas: sigue ahí.
    expect(screen.getAllByText("USD 111,88").length).toBeGreaterThan(0);
    expect(screen.queryByText(/oficina\.costos\.pieza\.iaCuenta/)).toBeNull();
  });

  it("si los costos no se pueden leer, lo dice y deja reintentar", async () => {
    fallaCostos = true;
    pintar("/oficina/costos");
    // El tablero y la pestaña lo dicen cada uno en su fila, con Reintentar.
    expect((await screen.findAllByText("oficina.costos.fallo", undefined, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("oficina.costos.reintentar").length).toBeGreaterThan(0);
  });

  it("al tocar una pieza con servicio se abre su ficha con sus cobros y el enlace a su factura", async () => {
    pintar("/oficina/costos");
    fireEvent.click(await screen.findByText("oficina.costos.pieza.ia"));
    expect(await screen.findByText(/oficina\.costos\.fichaCobros/)).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.fichaPanel/).closest("a")?.getAttribute("href")).toBe("https://aistudio.google.com/spend");
  });
});

describe("Dónde puedes recortar y cuentas atadas", () => {
  beforeEach(reiniciar);

  it("suma lo que podrías bajar al mes y dice dónde, sin contar dos veces", async () => {
    pintar("/oficina/costos");
    const bloque = (await screen.findByText("oficina.costos.bajar.titulo")).closest("section")!;
    // 2 proyectos parados × 9,81 (las cuentas mandan sobre el 18,54 del servicio) + 70 de Google.
    expect(await within(bloque).findByText("USD 90")).toBeTruthy();
    expect(within(bloque).getByText(/oficina\.costos\.bajar\.menos.*USD 19,62/)).toBeTruthy();
    expect(within(bloque).getByText(/oficina\.costos\.bajar\.menos.*USD 70/)).toBeTruthy();
    // Zoho tiene una casilla de alguien que salió, pero el precio no se ve: se dice.
    expect(within(bloque).getByText("oficina.costos.bajar.sinPrecioFila")).toBeTruthy();
    expect(within(bloque).getByText(/oficina\.costos\.bajar\.sinPrecio \{"n":1\}/)).toBeTruthy();
    expect(within(bloque).getByText(/oficina\.costos\.bajar\.revise.*"t":57.*"u":53.*"s":2.*"g":1.*"v":1/)).toBeTruthy();
    expect(within(bloque).getByText("oficina.costos.bajar.noEsMaven")).toBeTruthy();
  });

  it("al tocar un candidato se abre su ficha con sus cuentas atadas, lo que se puede soltar primero", async () => {
    pintar("/oficina/costos");
    const bloque = (await screen.findByText("oficina.costos.bajar.titulo")).closest("section")!;
    fireEvent.click((await within(bloque).findByText("Supabase: otros 20 proyectos")).closest("button")!);
    expect(await screen.findByText("oficina.costos.cuentas.titulo")).toBeTruthy();
    const nombres = ["BIORA app v2.0", "chatters-ops", "KASH Leads"].map((n) => screen.getByText(n));
    expect(nombres[0].compareDocumentPosition(nombres[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("0 visitas en 24 h")).toBeTruthy();
    expect(screen.getByText(/oficina\.costos\.cuentas\.siSueltas.*USD 19,62/)).toBeTruthy();
    // No es Maven: no se inventa un «gastado por Maven», y el ahorro no se repite abajo.
    expect(screen.queryByText(/oficina\.costos\.fichaCobros/)).toBeNull();
    expect(screen.queryByText(/oficina\.costos\.fichaAhorro/)).toBeNull();
  });

  it("Zoho: la ficha lee en vivo las licencias y cada casilla solo cuando se pide", async () => {
    pintar("/oficina/costos");
    fireEvent.click(await screen.findByRole("button", { name: "Correos del equipo" }));
    expect(await screen.findByText("salio@maven-ai.me")).toBeTruthy();
    expect(invocar.mock.calls.some(([, o]) => o?.body?.accion === "zoho_casillas")).toBe(false);
    fireEvent.click(screen.getByText("oficina.costos.zoho.ver"));
    expect(await screen.findByText(/oficina\.costos\.zoho\.licencias \{"u":69,"c":70\}/)).toBeTruthy();
    expect(invocar).toHaveBeenCalledWith("conexiones-ping", { body: { accion: "zoho_casillas" } });
    expect(screen.getByText("corp@unlok.me")).toBeTruthy();
  });

  it("si las cuentas no se pueden leer, el bloque lo dice en una fila y el resto de la página sigue", async () => {
    fallaCuentas = true;
    pintar("/oficina/costos");
    const bloque = (await screen.findByText("oficina.costos.bajar.titulo")).closest("section")!;
    expect(await within(bloque).findByText("oficina.costos.fallo", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/^oficina\.costos\.tablero\.gastado \{/)).toBeTruthy();
    expect(screen.queryByText("oficina.costos.bajar.nada")).toBeNull();
  });
});

describe("Por proveedor", () => {
  beforeEach(reiniciar);

  it("cada servicio con su parte de Maven; lo que no es Maven aparte; toca y se abre la ficha", async () => {
    pintar("/oficina/costos?vista=proveedor");
    expect(await screen.findByText("oficina.costos.porServicio")).toBeTruthy();
    // «Base de datos de Maven» sale también en el tablero de arriba: la fila de esta pestaña es la que es botón.
    const fila = screen.getAllByText("Base de datos de Maven").map((e) => e.closest("button")).find(Boolean)!;
    expect(within(fila).getByText("oficina.costos.parte.base")).toBeTruthy();
    expect(screen.getByText("oficina.costos.proveedor.noSuma")).toBeTruthy();
    // La IA de Google al mes: el uso real al ritmo de hoy, no el monto viejo de la factura.
    expect(screen.getByText("oficina.costos.proveedor.alRitmo")).toBeTruthy();
    fireEvent.click(fila);
    expect(await screen.findByText(/oficina\.costos\.fichaCobros/)).toBeTruthy();
  });
});

describe("Conexiones", () => {
  beforeEach(reiniciar);

  it("cuatro fichas, las dos listas y qué hacer; Argos sin juzgar es una fila de adentro", async () => {
    pintar("/oficina/costos?vista=conexiones");
    expect(await screen.findByText("Error 401: la llave no sirve")).toBeTruthy();
    for (const k of ["ok", "atencion", "mal", "apagado"]) expect(screen.getByText(`oficina.conexiones.resumen.${k}`)).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.externos")).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.adentro")).toBeTruthy();
    expect(await screen.findByText(/oficina\.conexiones\.cronsMal.*vigia-blu/)).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.backstageSinLlave")).toBeTruthy();
    // El incidente de Argos va en su fila, con qué hacer (no en un cartel arriba).
    const argos = screen.getByText("oficina.conexiones.argos").closest("li")!;
    expect(within(argos).getByText(/425 pantallazos/)).toBeTruthy();
    expect(within(argos).getByText("oficina.conexiones.accion.argos")).toBeTruthy();
    // Lo que falla dice qué hacer; lo sin configurar, que falta la llave.
    expect(screen.getByText("oficina.conexiones.accion.llave")).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.accion.sinConfigurar")).toBeTruthy();
    // De costos: el dominio que se renueva pronto y lo que no se puede ver.
    expect(screen.getByText(/oficina\.conexiones\.estado\.vence/)).toBeTruthy();
    expect(screen.getByText("oficina.conexiones.accion.dominio")).toBeTruthy();
  });

  it("si la prueba en vivo falla, es UNA fila con Reintentar y lo de adentro se sigue viendo", async () => {
    fallaPing = true;
    pintar("/oficina/costos?vista=conexiones");
    expect(await screen.findByText("oficina.conexiones.falloExternos")).toBeTruthy();
    expect(screen.getAllByText("oficina.costos.reintentar")).toHaveLength(1);
    expect(screen.getByText(/oficina\.conexiones\.sinContar/)).toBeTruthy();
    expect(await screen.findByText(/oficina\.conexiones\.cronsMal/)).toBeTruthy();
  });
});
