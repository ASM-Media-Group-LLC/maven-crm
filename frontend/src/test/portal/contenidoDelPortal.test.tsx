import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";

// «MI CONTENIDO» de la creadora: la pantalla real, con la edge portal-contenido
// y el envío al NAS de mentira. Lo que importa: lista lo de su carpeta, sube con
// la edge (iniciar → partes → confirmar con el recibo) y, si falla, lo dice y
// borra la ficha que quedó a medias.

const edge = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminInvoke", () => ({ adminInvoke: edge }));
const subir = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/subidaPorPartes", async (original) => ({
  ...(await original<typeof import("@/lib/drive/subidaPorPartes")>()),
  subirPorPartes: subir,
}));

import PortalContenido from "@/pages/portal/PortalContenido";
import { PortalContext } from "@/hooks/usePortal";
import { SubidasContext, useSubidasDelPortal } from "@/hooks/usePortalContenido";
import { SubidaFallida } from "@/lib/drive/subidaPorPartes";

const RAIZ = "e1000000-0000-4000-8000-000000000001";
const FICHA = { creator_id: "c1", tenant_id: "t1", agencia: "ASM Tech", nombre: "Sofía", nombre_artistico: "Sofi", foto: null };
const LISTA = {
  carpeta: RAIZ, raiz: RAIZ, ruta: [{ id: RAIZ, nombre: "" }],
  items: [
    { id: "f1", tipo: "carpeta", nombre: "Sesión cocina", mime: null, size: null, estado: "listo", created_at: "", updated_at: "", mio: true, se_puede_borrar: true },
    { id: "a1", tipo: "archivo", nombre: "video.mp4", mime: "video/mp4", size: 5_000_000, estado: "listo", created_at: "", updated_at: "", mio: true, se_puede_borrar: false },
  ],
};

function Marco({ children }: { children: React.ReactNode }) {
  const subidas = useSubidasDelPortal();
  return (
    <PortalContext.Provider value={{ fichas: [FICHA], activa: FICHA, elegir: () => {} }}>
      <SubidasContext.Provider value={subidas}>{children}</SubidasContext.Provider>
    </PortalContext.Provider>
  );
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/portal/contenido"]}>
          <Marco><PortalContenido /></Marco>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  edge.mockReset();
  subir.mockReset();
  edge.mockImplementation(async (_f: string, body: { accion: string }) => {
    if (body.accion === "listar") return LISTA;
    if (body.accion === "miniaturas") return { urls: {} };
    if (body.accion === "subir_iniciar") return { id: "nuevo", tamano_parte: 8 * 1024 * 1024, partes: ["p0", "p1"], completar: "c" };
    return { ok: true };
  });
});

const elegir = (nombre: string, bytes: number, tipo: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const f = new File([new Uint8Array(bytes)], nombre, { type: tipo });
  fireEvent.change(input, { target: { files: [f] } });
};

describe("Mi contenido", () => {
  it("lista sus carpetas y sus archivos, y el selector acepta fotos y videos", async () => {
    montar();
    expect(await screen.findByText("Sesión cocina")).toBeTruthy();
    expect(screen.getByText("video.mp4")).toBeTruthy();
    expect(edge).toHaveBeenCalledWith("portal-contenido", { accion: "listar", creator_id: "c1", carpeta: null });
    expect((document.querySelector('input[type="file"]') as HTMLInputElement).accept).toBe("image/*,video/*");
  });

  it("sube: iniciar en su carpeta → partes al NAS → confirmar con el recibo", async () => {
    subir.mockResolvedValue("recibo-firmado");
    montar();
    await screen.findByText("Sesión cocina");
    elegir("cocina.mov", 1234, "video/quicktime");
    await waitFor(() => expect(edge).toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "subir_confirmar", id: "nuevo", recibo: "recibo-firmado" })));
    expect(edge).toHaveBeenCalledWith("portal-contenido", expect.objectContaining({
      accion: "subir_iniciar", creator_id: "c1", carpeta: RAIZ, nombre: "cocina.mov", size: 1234, mime: "video/quicktime",
    }));
    expect(subir).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Listo")).toBeTruthy();
  });

  it("si la subida falla, lo dice y borra la ficha que quedó a medias", async () => {
    subir.mockRejectedValue(new SubidaFallida("sin_red"));
    montar();
    await screen.findByText("Sesión cocina");
    elegir("cocina.mov", 1234, "video/quicktime");
    expect(await screen.findByText("No se subió")).toBeTruthy();
    expect(screen.getByText("Se cortó demasiadas veces. Prueba de nuevo con mejor señal.")).toBeTruthy();
    expect(edge).toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "borrar", id: "nuevo" }));
    expect(edge).not.toHaveBeenCalledWith("portal-contenido", expect.objectContaining({ accion: "subir_confirmar" }));
  });
});
