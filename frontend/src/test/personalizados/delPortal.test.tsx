// PERSONALIZADOS: LO QUE LLEGA DESDE EL PORTAL DE LA CREADORA (fase 3, 08/10).
//   · «La creadora no puede» (no_puede): la ficha muestra lo que ella escribió y
//     solo un supervisor lo resuelve: renegociar (vuelve a solicitado), denegar
//     o reembolsar. Nadie del equipo manda un pedido A no_puede.
//   · Su entrega vive en SU Drive: la ficha la muestra como «De la creadora»,
//     se abre pidiéndole la URL a la edge drive (abrir_entrega_pedido) y no se
//     puede quitar desde acá.
//   · El aviso de la campana trae ?pedido=: la página abre esa ficha.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { configure, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Pedido, PedidoAdjunto } from "@/pages/personalizados/types";
import { prepararJsdom } from "@/test/ventas/visibles";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const base: Pedido = {
  id: "p1", agency: "plus", creator_id: "c1", creator_name: "Sofia Model", chatter_id: "u1", chatter_name: "Laura Gomez",
  fan_handle: "carlos_m88", requested_on: "2026-10-06", due_on: null, status: "no_puede", content_type: "video",
  sale_channel: "normal", description: "Video en la calle", duration_or_qty: "3 min", fan_total_spent_usd: 500,
  price_usd: 120, paid_usd: 120, flags: [], notes: null, denied_reason: null, creadora_motivo: "No grabo en exteriores",
  approved_by: null, approved_at: null, delivered_at: null, source: "maven", source_ref: null, created_by: "u1",
  created_at: "2026-10-06T12:00:00Z", updated_at: "2026-10-08T12:00:00Z",
};
const ADJUNTOS: PedidoAdjunto[] = [
  { id: "a1", request_id: "p1", storage_path: "p1/ref.png", drive_item_id: null, file_name: "ref.png", mime_type: "image/png", size_bytes: 10, kind: "referencia", created_by: "u1", created_at: "2026-10-06T12:00:00Z" },
  { id: "a2", request_id: "p1", storage_path: null, drive_item_id: "d1", file_name: "entrega-final.mp4", mime_type: "video/mp4", size_bytes: 10, kind: "entrega", created_by: "creadora", created_at: "2026-10-08T12:00:00Z" },
];

let puedeAprobar = true;
let params = new URLSearchParams();
let delAviso: Pedido | null = null;
const cambiarEstado = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => ({})), isPending: false }));
const urlDeEntrega = vi.hoisted(() => vi.fn(async () => "https://nas.test/entrega"));
const urlFirmada = vi.hoisted(() => vi.fn(async (p: string) => `https://files.test/${p}`));

vi.mock("@/pages/personalizados/usePersonalizados", async () => {
  const real = await vi.importActual<typeof import("@/pages/personalizados/usePersonalizados")>("@/pages/personalizados/usePersonalizados");
  const otra = { mutate: vi.fn(), mutateAsync: vi.fn(async () => ({})), isPending: false };
  return {
    FILTROS_VACIOS: real.FILTROS_VACIOS,
    usePedidos: () => ({ data: [], isLoading: false }),
    usePedido: (id: string | null) => ({ data: id && delAviso?.id === id ? delAviso : null }),
    usePedidoEventos: () => ({ data: [] }),
    usePedidoAdjuntos: (id: string | null) => ({ data: id ? ADJUNTOS : [] }),
    useCatalogos: () => ({ creadoras: [], perfiles: [], nombreDe: () => null, cargando: false }),
    useFotoCreadora: () => null,
    usePermisosPersonalizados: () => ({ puedeAprobar, puedeGestionar: true, puedeCrear: true, cargando: false }),
    useMutacionesPedidos: () => ({ cambiarEstado, editar: otra, borrar: otra, subirAdjunto: otra, borrarAdjunto: otra, crear: otra }),
    urlFirmada,
    urlDeEntregaDelPortal: urlDeEntrega,
  };
});
vi.mock("@/pages/messenger/components/ProfileCard", () => ({ default: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true, explicitPermission: () => null, isLoading: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
const setParams = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useNavigate: () => () => {},
  useSearchParams: () => [params, setParams],
}));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

import PedidoFicha from "@/pages/personalizados/PedidoFicha";
import PersonalizadosPage from "@/pages/personalizados/PersonalizadosPage";
import { ESTADOS, SIGUIENTES, soloSupervisor } from "@/pages/personalizados/types";

const conQuery = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeAll(prepararJsdom);
beforeEach(() => {
  puedeAprobar = true;
  params = new URLSearchParams();
  delAviso = null;
  cambiarEstado.mutateAsync.mockClear();
  urlDeEntrega.mockClear();
  urlFirmada.mockClear();
  setParams.mockClear();
});

describe("las reglas de no_puede", () => {
  it("nadie del equipo manda un pedido A no_puede", () => {
    for (const [desde, hacia] of Object.entries(SIGUIENTES)) {
      expect(hacia, `desde ${desde}`).not.toContain("no_puede");
    }
  });
  it("de no_puede sale a solicitado, denegado o reembolsado, y siempre con supervisor", () => {
    expect(SIGUIENTES.no_puede).toEqual(["solicitado", "denegado", "reembolsado"]);
    for (const hacia of SIGUIENTES.no_puede) expect(soloSupervisor("no_puede", hacia)).toBe(true);
    expect(soloSupervisor("aprobado", "en_produccion")).toBe(false);
    expect(soloSupervisor("solicitado", "aprobado")).toBe(true);
  });
  it("es una salida lateral del tablero, con su color", () => {
    expect(ESTADOS.find((e) => e.id === "no_puede")?.lateral).toBe(true);
  });
});

describe("la ficha de un pedido que la creadora no puede hacer", () => {
  it("muestra lo que ella escribió y, al supervisor, cómo resolverlo", async () => {
    conQuery(<PedidoFicha pedido={base} onClose={() => {}} onEditar={() => {}} />);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getAllByText("La creadora no puede").length).toBeGreaterThan(0);
    expect(within(ficha).getByText("Desde su portal dijo: «No grabo en exteriores»")).toBeTruthy();
    expect(within(ficha).getByText(/renegócialo/)).toBeTruthy();
    expect(within(ficha).getByRole("button", { name: "Denegar" })).toBeTruthy();
    expect(within(ficha).getByRole("button", { name: "Marcar reembolso" })).toBeTruthy();

    fireEvent.click(within(ficha).getByRole("button", { name: "Renegociar" }));
    await waitFor(() => expect(cambiarEstado.mutateAsync).toHaveBeenCalledWith({ id: "p1", estado: "solicitado" }));
  });

  it("quien no es supervisor lo ve, pero no lo resuelve", async () => {
    puedeAprobar = false;
    conQuery(<PedidoFicha pedido={base} onClose={() => {}} onEditar={() => {}} />);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getAllByText("Lo resuelve un supervisor.").length).toBeGreaterThan(0);
    expect(within(ficha).queryByRole("button", { name: "Renegociar" })).toBeNull();
    expect(within(ficha).queryByRole("button", { name: "Denegar" })).toBeNull();
  });
});

describe("la entrega que subió ella desde su portal", () => {
  it("se ve como «De la creadora», se abre con la edge drive y no se quita desde acá", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    conQuery(<PedidoFicha pedido={{ ...base, status: "listo", creadora_motivo: null }} onClose={() => {}} onEditar={() => {}} />);
    const ficha = await screen.findByRole("dialog");
    const tarjeta = within(ficha).getByText("De la creadora").closest("button") as HTMLButtonElement;
    expect(within(tarjeta).getByText("entrega-final.mp4")).toBeTruthy();
    expect(within(tarjeta).queryByTitle("Quitar")).toBeNull();

    fireEvent.click(tarjeta);
    await waitFor(() => expect(abrir).toHaveBeenCalledWith("https://nas.test/entrega", "_blank", "noopener"));
    expect(urlDeEntrega).toHaveBeenCalledWith("a2");
    // La del bucket se firma como siempre; la del Drive, nunca por esa vía.
    await waitFor(() => expect(urlFirmada).toHaveBeenCalledWith("p1/ref.png"));
    expect(urlFirmada).toHaveBeenCalledTimes(1);
    abrir.mockRestore();
  });
});

describe("el aviso de la campana", () => {
  it("?pedido= abre esa ficha aunque no esté en la lista, y se limpia de la dirección", async () => {
    delAviso = { ...base, id: "p9", fan_handle: "fan_del_aviso" };
    params = new URLSearchParams("pedido=p9");
    conQuery(<PersonalizadosPage />);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByText("@fan_del_aviso")).toBeTruthy();
    expect(setParams).toHaveBeenCalled();
  });
});
