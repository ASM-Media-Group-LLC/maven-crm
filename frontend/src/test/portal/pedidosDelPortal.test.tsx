import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";

// «PEDIDOS» DE LA CREADORA (fase 3 del portal; decisiones de Jhon, 06/10): la
// pantalla real, con la edge portal-contenido y el envío al NAS de mentira.
//   · Ve sus pedidos apenas se crean: «Por aprobar» mientras su agencia los
//     revisa, con el fan, el precio y la descripción.
//   · «Lo empiezo» solo cuando ya está aprobado.
//   · «Subir entrega» sube a SU carpeta «Personalizados» y, al terminar, ata el
//     archivo al pedido. Si atarlo falla, el archivo NO se borra.
//   · «No puedo hacerlo» pide el motivo (mínimo 5 letras).
//   · El aviso de la campana (?p=) abre la pestaña donde está el pedido.

const edge = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminInvoke", () => ({ adminInvoke: edge }));
const subir = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/subidaPorPartes", async (original) => ({
  ...(await original<typeof import("@/lib/drive/subidaPorPartes")>()),
  subirPorPartes: subir,
}));
Element.prototype.scrollIntoView ??= () => {};

import PortalPedidos from "@/pages/portal/PortalPedidos";
import { PortalContext } from "@/hooks/usePortal";
import { SubidasContext, useSubidasDelPortal } from "@/hooks/usePortalContenido";
import type { PedidoDelPortal } from "@/hooks/usePortalPedidos";

const FICHA = { creator_id: "c1", tenant_id: "t1", agencia: "ASM Tech", nombre: "Sofía", nombre_artistico: "Sofi", foto: null };
const CARPETA = "e1000000-0000-4000-8000-0000000000aa";

const pedido = (id: string, estado: PedidoDelPortal["estado"], extra: Partial<PedidoDelPortal> = {}): PedidoDelPortal => ({
  id, estado, fan: `fan_${id}`, descripcion: `Descripción del pedido ${id}`, precio_usd: 120, tipo: "video", cantidad: "1 video de 3 min",
  pedido_el: "2026-10-08", para_el: "2099-10-12", motivo: null, creado: "2026-10-08T10:00:00Z",
  por_aprobar: estado === "solicitado",
  se_puede_empezar: estado === "aprobado",
  se_puede_entregar: ["solicitado", "aprobado", "en_produccion", "listo"].includes(estado),
  se_puede_rechazar: ["solicitado", "aprobado", "en_produccion"].includes(estado),
  referencias: [], entregas: [],
  ...extra,
});

let PEDIDOS: PedidoDelPortal[] = [];

function Marco({ children }: { children: React.ReactNode }) {
  const subidas = useSubidasDelPortal();
  return (
    <PortalContext.Provider value={{ fichas: [FICHA], activa: FICHA, elegir: () => {} }}>
      <SubidasContext.Provider value={subidas}>{children}</SubidasContext.Provider>
    </PortalContext.Provider>
  );
}
function montar(ruta = "/portal/pedidos") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter initialEntries={[ruta]}>
          <Marco><PortalPedidos /></Marco>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  edge.mockReset();
  subir.mockReset();
  PEDIDOS = [
    pedido("p1", "solicitado"),
    pedido("p2", "aprobado", { referencias: [{ id: "r1", nombre: "idea.jpg", mime: "image/jpeg", size: 10 }] }),
    pedido("p3", "entregado", { se_puede_entregar: false }),
    pedido("p4", "denegado"),
  ];
  edge.mockImplementation(async (_f: string, body: { accion: string }) => {
    if (body.accion === "pedidos") return { pedidos: PEDIDOS };
    if (body.accion === "pedido_carpeta") return { carpeta: CARPETA };
    if (body.accion === "subir_iniciar") return { id: "nuevo", tamano_parte: 8 * 1024 * 1024, partes: ["p0"], completar: "c" };
    if (body.accion === "pedido_entregar") return { ok: true, estado: "listo" };
    return { ok: true };
  });
});

const tarjeta = async (fan: string) => (await screen.findByText(`Para ${fan}`)).closest("article") as HTMLElement;

describe("Pedidos de la creadora", () => {
  it("por hacer y el historial por separado; ve el fan, el precio y la descripción", async () => {
    montar();
    const p1 = await tarjeta("fan_p1");
    expect(within(p1).getByText("Por aprobar")).toBeTruthy();
    expect(within(p1).getByText("Descripción del pedido p1")).toBeTruthy();
    expect(within(p1).getByText(/120/)).toBeTruthy();
    expect(within(p1).getByText(/Tu agencia todavía lo está revisando/)).toBeTruthy();
    expect(screen.queryByText("Para fan_p3")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Historial/ }));
    expect(await screen.findByText("Para fan_p3")).toBeTruthy();
    expect(screen.getByText("Le llegó al fan")).toBeTruthy();
    expect(within(await tarjeta("fan_p4")).getByText("Cancelado")).toBeTruthy();
    expect(screen.queryByText("Para fan_p1")).toBeNull();
  });

  it("«Lo empiezo» solo cuando ya está aprobado", async () => {
    montar();
    const p1 = await tarjeta("fan_p1");
    expect(within(p1).queryByRole("button", { name: /Lo empiezo/ })).toBeNull();
    expect(within(p1).getByRole("button", { name: /Subir entrega/ })).toBeTruthy();

    const p2 = await tarjeta("fan_p2");
    fireEvent.click(within(p2).getByRole("button", { name: /Lo empiezo/ }));
    await waitFor(() => expect(edge).toHaveBeenCalledWith("portal-contenido", { accion: "pedido_empezar", creator_id: "c1", pedido: "p2" }));
  });

  it("«Subir entrega»: a su carpeta «Personalizados» y, al terminar, se ata al pedido", async () => {
    subir.mockResolvedValue("recibo");
    montar();
    const p2 = await tarjeta("fan_p2");
    const input = p2.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(50)], "entrega.mp4", { type: "video/mp4" })] } });

    await waitFor(() => expect(edge).toHaveBeenCalledWith("portal-contenido", { accion: "pedido_entregar", creator_id: "c1", pedido: "p2", archivo: "nuevo" }));
    expect(edge).toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "subir_iniciar", carpeta: CARPETA, nombre: "entrega.mp4" }));
    const orden = edge.mock.calls.map(([, b]) => (b as { accion: string }).accion);
    expect(orden.indexOf("subir_confirmar")).toBeLessThan(orden.indexOf("pedido_entregar"));
  });

  it("si atarlo al pedido falla, el archivo NO se borra (ya está en su Drive)", async () => {
    subir.mockResolvedValue("recibo");
    edge.mockImplementation(async (_f: string, body: { accion: string }) => {
      if (body.accion === "pedidos") return { pedidos: PEDIDOS };
      if (body.accion === "pedido_carpeta") return { carpeta: CARPETA };
      if (body.accion === "subir_iniciar") return { id: "nuevo", tamano_parte: 8 * 1024 * 1024, partes: ["p0"], completar: "c" };
      if (body.accion === "pedido_entregar") throw new Error("no_se_puede");
      return { ok: true };
    });
    montar();
    const p2 = await tarjeta("fan_p2");
    fireEvent.change(p2.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File([new Uint8Array(50)], "entrega.mp4", { type: "video/mp4" })] },
    });
    await waitFor(() => expect(edge).toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "pedido_entregar" })));
    expect(edge).not.toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "borrar" }));
  });

  it("«No puedo hacerlo» pide el motivo y se lo manda a su agencia", async () => {
    montar();
    const p1 = await tarjeta("fan_p1");
    fireEvent.click(within(p1).getByRole("button", { name: /No puedo hacerlo/ }));
    const dialogo = await screen.findByRole("dialog");
    const avisar = within(dialogo).getByRole("button", { name: "Avisar a mi agencia" }) as HTMLButtonElement;
    expect(avisar.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("¿Por qué no puedes?"), { target: { value: "  No grabo en exteriores  " } });
    expect(avisar.disabled).toBe(false);
    fireEvent.click(avisar);
    await waitFor(() => expect(edge).toHaveBeenCalledWith("portal-contenido", {
      accion: "pedido_no_puede", creator_id: "c1", pedido: "p1", motivo: "No grabo en exteriores",
    }));
  });

  it("el aviso de la campana (?p=) abre la pestaña donde está el pedido", async () => {
    montar("/portal/pedidos?p=p3");
    const p3 = await tarjeta("fan_p3");
    expect(screen.getByRole("tab", { name: /Historial/ }).getAttribute("aria-selected")).toBe("true");
    expect(p3.className).toMatch(/ring-2/);
  });

  it("sin pedidos por hacer, lo dice", async () => {
    PEDIDOS = [];
    montar();
    expect(await screen.findByText("No tienes pedidos por hacer")).toBeTruthy();
  });
});
