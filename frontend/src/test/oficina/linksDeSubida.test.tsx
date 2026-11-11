import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARD de "Links de las modelos" (Alvaro, 10/11/2026: "¿dónde vergas está el
// link donde las modelos meten sus videos?"). La lista sale de la RPC
// drive_links_de_subida; acá se prueba que un fallo se diga como fallo (no como
// "no hay links"), que se vea cada modelo y que se resalte la que nunca mandó.

let respuesta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
// Desde el 10/11 la página también trae la lista de creadoras (otra RPC, con su
// propio banco en linksDeCreadoras.test.tsx): aquí contesta vacía.
const rpc = vi.fn(async (f: string) => (f === "drive_links_de_subida" ? respuesta : { data: [], error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [string])) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  // PageHeader usa la variante «si hay proveedor».
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import LinksDeSubidaPage, { filtrarLinks, nombreDeLaCarpeta, type LinkDeModelo } from "@/pages/oficina/LinksDeSubidaPage";

const envolver = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </MemoryRouter>
);

const link = (carpeta: string, archivos: number, extra: Partial<LinkDeModelo> = {}): LinkDeModelo => ({
  token: `tok-${carpeta}`, carpeta_id: `id-${carpeta}`, carpeta, padre: "CONTENIDO MASSIVE", creado_por: "Maria Villegas",
  creado_at: "2026-11-05T12:00:00Z", archivos, bytes: archivos * 1_000_000, ultimo: archivos ? "2026-11-06T12:00:00Z" : null, ...extra,
});

describe("la lógica de la lista", () => {
  it("una carpeta genérica dice de quién es; la de agencia no se repite", () => {
    expect(nombreDeLaCarpeta({ carpeta: "SCRIPT", padre: "YOISNIA" })).toBe("YOISNIA › SCRIPT");
    expect(nombreDeLaCarpeta({ carpeta: "MIMIMOUSE", padre: "CONTENIDO MASSIVE" })).toBe("MIMIMOUSE");
  });

  it("el buscador no distingue tildes ni mayúsculas y mira también quién lo creó", () => {
    const l = [link("MIMIMOUSE", 311), link("BUENOS DÍAS", 9, { padre: "SCRIPT" }), link("BERENAA", 0, { creado_por: "Katherin Ferrer" })];
    expect(filtrarLinks(l, "dias").map((x) => x.carpeta)).toEqual(["BUENOS DÍAS"]);
    expect(filtrarLinks(l, "katherin").map((x) => x.carpeta)).toEqual(["BERENAA"]);
    expect(filtrarLinks(l, "  ")).toHaveLength(3);
  });
});

describe("la página", () => {
  beforeEach(() => { respuesta = { data: null, error: null }; rpc.mockClear(); });

  it("⚠️ si la lista no carga lo DICE y ofrece reintentar (un fallo no es 'no hay links')", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    render(<LinksDeSubidaPage />, { wrapper: envolver });
    // La página reintenta UNA vez (conexión floja) antes de dar el fallo.
    const alerta = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alerta).toHaveTextContent("drive.links.fallo");
    expect(within(alerta).getByRole("button", { name: /drive.links.reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText("drive.links.vacio")).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("drive_links_de_subida");
  });

  it("con datos muestra cada modelo y resalta la que nunca ha mandado nada", async () => {
    respuesta = { error: null, data: [link("MIMIMOUSE", 311), link("BERENAA", 0, { padre: "CONTENIDO PLUS" })] };
    render(<LinksDeSubidaPage />, { wrapper: envolver });
    expect(await screen.findByText("MIMIMOUSE")).toBeInTheDocument();
    const berenaa = screen.getByText("BERENAA").closest("li")!;
    expect(within(berenaa).getByText("drive.links.nunca")).toBeInTheDocument();
    const mimi = screen.getByText("MIMIMOUSE").closest("li")!;
    expect(within(mimi).queryByText("drive.links.nunca")).not.toBeInTheDocument();
    expect(within(mimi).getByRole("link", { name: /drive.links.abrir/ })).toHaveAttribute("href", "/oficina/drive?carpeta=id-MIMIMOUSE");
    expect(screen.getByText(/drive.links.resumen/)).toHaveTextContent('"n":2');
    expect(screen.getByText(/drive.links.resumen/)).toHaveTextContent('"m":1');
  });
});
