// Personalizados en INGLÉS: con la app en EN no queda nada visible en español,
// ni en la lista, ni en el tablero, ni en la ficha del pedido, ni en el alta.
//
// Se monta la pantalla real con el LanguageProvider de verdad; lo que se
// reemplaza es solo lo que trae datos (usePersonalizados) y la ficha del
// Messenger (ProfileCard), que no es de este módulo.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { configure, render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import type { Pedido, PedidoAdjunto, PedidoEvento } from "@/pages/personalizados/types";
import { enEspanol, prepararJsdom } from "./visibles";

// Pantallas enteras con diálogos: con la suite corriendo en paralelo (o la
// máquina cargada) el segundo de findBy y los 5 s por test no alcanzan y el
// test falla sin que haya nada roto. Mismo arreglo que admin/adminEnIngles.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const diaHace = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const base: Pedido = {
  id: "p1", agency: "plus", creator_id: "c1", creator_name: "Sofia Model", chatter_id: "u1", chatter_name: "Laura Gomez",
  fan_handle: "u85422765", requested_on: diaHace(15), due_on: null, status: "en_produccion", content_type: "video",
  sale_channel: "buster", description: "Red dress video, 8 minutes", duration_or_qty: "8 min", fan_total_spent_usd: 5850,
  price_usd: 200, paid_usd: 120, flags: ["pago_parcial", "urgente", "bandera_vieja"], notes: null, denied_reason: null,
  approved_by: null, approved_at: null, delivered_at: null, source: "sheet", source_ref: "SEP-12", created_by: "u1",
  created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z",
};
const PEDIDOS: Pedido[] = [
  base,
  { ...base, id: "p2", status: "solicitado", requested_on: diaHace(8), sale_channel: "normal", content_type: "foto",
    flags: [], price_usd: 150, paid_usd: 150, source: "maven", source_ref: null, chatter_id: null, chatter_name: null },
  { ...base, id: "p3", status: "denegado", requested_on: diaHace(2), agency: "massive", content_type: "articulo",
    denied_reason: null, flags: [], source: "maven", source_ref: null },
  { ...base, id: "p4", status: "listo", requested_on: diaHace(1), due_on: diaHace(0), content_type: "audio", flags: [],
    source: "maven", source_ref: null },
];
const EVENTOS: PedidoEvento[] = [
  { id: "e1", request_id: "p1", actor_id: "u1", from_status: null, to_status: "solicitado", note: null, created_at: "2026-09-01T12:00:00Z" },
  { id: "e2", request_id: "p1", actor_id: "otro", from_status: "solicitado", to_status: "aprobado", note: "ok", created_at: "2026-09-02T12:00:00Z" },
  { id: "e3", request_id: "p1", actor_id: null, from_status: "aprobado", to_status: "en_produccion", note: null, created_at: "2026-09-03T12:00:00Z" },
];
const ADJUNTOS: PedidoAdjunto[] = [
  { id: "a1", request_id: "p1", storage_path: "p1/ref.png", file_name: "ref.png", mime_type: "image/png", size_bytes: 10, kind: "referencia", created_by: "u1", created_at: "2026-09-01T12:00:00Z" },
  { id: "a2", request_id: "p1", storage_path: "p1/final.mp4", file_name: "final.mp4", mime_type: "video/mp4", size_bytes: 10, kind: "entrega", created_by: "u1", created_at: "2026-09-01T12:00:00Z" },
];
const SIN: never[] = [];
const CREADORAS = [{ id: "c1", nombre: "Sofia Model", status: "active" }];
const PERFILES = [{ id: "u1", full_name: "Laura Gomez" }];
const NOMBRES: Record<string, string> = { u1: "Laura Gomez" };

// Lo que el test cambia: los pedidos que "hay" y los permisos de quien mira.
let pedidos: Pedido[] = PEDIDOS;
let puedeAprobar = true;
// Quién está usando la pantalla. "u1" es chatter (está en PERFILES): el alta
// arranca con él como vendedor. Otro id = un supervisor que carga un pedido
// ajeno, y el selector queda vacío mostrando su placeholder.
let yo = "u1";

vi.mock("@/pages/personalizados/usePersonalizados", async () => {
  const real = await vi.importActual<typeof import("@/pages/personalizados/usePersonalizados")>("@/pages/personalizados/usePersonalizados");
  const mutacion = { mutate: vi.fn(), mutateAsync: vi.fn(async () => base), isPending: false };
  const mutaciones = { cambiarEstado: mutacion, editar: mutacion, borrar: mutacion, subirAdjunto: mutacion, borrarAdjunto: mutacion, crear: mutacion };
  return {
    FILTROS_VACIOS: real.FILTROS_VACIOS,
    usePedidos: () => ({ data: pedidos, isLoading: false }),
    usePedidoEventos: (id: string | null) => ({ data: id ? EVENTOS : SIN }),
    usePedidoAdjuntos: (id: string | null) => ({ data: id ? ADJUNTOS : SIN }),
    useCatalogos: () => ({ creadoras: CREADORAS, perfiles: PERFILES, nombreDe: (id: string | null) => (id ? NOMBRES[id] ?? null : null), cargando: false }),
    useFotoCreadora: () => null,
    usePermisosPersonalizados: () => ({ puedeAprobar, puedeGestionar: true, puedeCrear: true, cargando: false }),
    useMutacionesPedidos: () => mutaciones,
    urlFirmada: async (p: string) => `https://files.test/${p}`,
  };
});
vi.mock("@/pages/messenger/components/ProfileCard", () => ({ default: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true, explicitPermission: () => null, isLoading: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: yo } }) }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useNavigate: () => () => {},
}));

import PersonalizadosPage from "@/pages/personalizados/PersonalizadosPage";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <PersonalizadosPage />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeAll(prepararJsdom);

describe("Personalizados en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    localStorage.removeItem("maven.personalizados.agencia");
    pedidos = PEDIDOS;
    puedeAprobar = true;
    yo = "u1";
  });

  it("la lista, el resumen y los filtros no tienen nada en español", async () => {
    montar();
    expect(await screen.findByText("Customs")).toBeTruthy();
    // Lo que en español salía de catálogos (estado, tipo, reloj del plazo).
    expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
    expect(screen.getByText("🎬 Video")).toBeTruthy();
    expect(screen.getByText("📦 Item")).toBeTruthy();
    expect(screen.getByText("Due soon")).toBeTruthy();
    // El title del reloj del plazo, con la unidad en los dos números.
    expect(screen.getAllByTitle("Open for 8 days. The deadline is 12 days.").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Past the 12-day deadline: open for 15 days.").length).toBeGreaterThan(0);
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("el tablero por estado tampoco", async () => {
    montar();
    fireEvent.click(await screen.findByTitle("Board by status"));
    expect((await screen.findAllByText("Nothing here")).length).toBeGreaterThan(0);
    expect(screen.getByText("Overdue · 15 d")).toBeTruthy();
    expect(screen.getByText("8 d undelivered")).toBeTruthy();
    expect(screen.getAllByTitle("Open for 8 days. The deadline is 12 days.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Owes $80").length).toBeGreaterThan(0);
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("la ficha del pedido: recorrido, plata, banderas, adjuntos e historial", async () => {
    montar();
    fireEvent.click((await screen.findAllByText("u85422765", { exact: false }))[0].closest("tr")!);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByText("$80 of $200 still to collect")).toBeTruthy();
    expect(within(ficha).getByText("Partial payment (balance due)")).toBeTruthy();
    // Una bandera que ya no está en el catálogo se muestra con su id.
    expect(within(ficha).getByText("bandera_vieja")).toBeTruthy();
    expect(within(ficha).getByText("Imported from the sheet (SEP-12).")).toBeTruthy();
    expect(within(ficha).getByText("Move to Ready")).toBeTruthy();
    expect(enEspanol(ficha)).toEqual([]);
  });

  it("un pedido denegado y uno por aprobar, visto por alguien que no aprueba", async () => {
    puedeAprobar = false;
    pedidos = [PEDIDOS[2], PEDIDOS[1]];
    montar();
    fireEvent.click((await screen.findAllByText("Denied"))[0].closest("tr")!);
    let ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByText("No reason noted.")).toBeTruthy();
    expect(enEspanol(ficha)).toEqual([]);
    fireEvent.keyDown(ficha, { key: "Escape" });
    fireEvent.click((await screen.findAllByText("Requested"))[0].closest("tr")!);
    ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByText("Waiting for a supervisor's approval.")).toBeTruthy();
    expect(enEspanol(ficha)).toEqual([]);
  });

  it("el alta de un pedido nuevo", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /New order/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("New custom order")).toBeTruthy();
    expect(within(dialogo).getByText("Sold in chat, no special promotion.")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    // El aviso de monto imposible, con su detalle.
    fireEvent.change(within(dialogo).getAllByPlaceholderText("200")[0], { target: { value: "5500000" } });
    expect(await within(dialogo).findByText(/That looks like a typo/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el alta la carga alguien que no es chatter: el selector de vendedor, vacío, también en inglés", async () => {
    yo = "sup1";
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /New order/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Who sold the order")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("sin pedidos, el vacío también", async () => {
    pedidos = [];
    montar();
    expect(await screen.findByText("No orders yet")).toBeTruthy();
    expect(screen.getByText("Requested → Approved → In production → Ready → Delivered")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});
