import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// GUARD de LA CARPETA DE LA CREADORA (/aportar/<token>, Alvaro 10/11/2026:
// dejar Dropbox). Lo que la página muestra depende del tipo de link —lo decide
// la edge drive-aporte—: el de la creadora tiene Subir / Mis archivos / Del
// equipo / Compartir; el de invitado y los de siempre SOLO suben (nunca ven
// nada); uno de «ver» solo muestra la carpeta compartida. Un fallo de red no
// se confunde con «el link no existe».

const respuestas: Record<string, unknown> = {};
const invocar = vi.fn(async (_token: string, action: string, extra?: Record<string, unknown>) => {
  const r = respuestas[action === "listar" ? `listar:${String(extra?.carpeta ?? "")}` : action];
  if (r instanceof Error) throw r;
  return r;
});

vi.mock("@/lib/aportar/api", async (original) => ({
  ...(await original<typeof import("@/lib/aportar/api")>()),
  invocarAporte: (...a: unknown[]) => invocar(...(a as [string, string, Record<string, unknown>])),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, supabaseAnon: {} }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import PaginaAportar from "@/pages/aportar/PaginaAportar";
import { hoyEnColombia, nuevosDesde, queDiaEs } from "@/lib/aportar/api";

const abrir = () => render(
  <MemoryRouter initialEntries={["/aportar/tok123"]}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Routes><Route path="/aportar/:token" element={<PaginaAportar />} /></Routes>
    </QueryClientProvider>
  </MemoryRouter>,
);

const hijo = (nombre: string, tipo: "carpeta" | "archivo", extra: Record<string, unknown> = {}) => ({
  id: `id-${nombre}`, nombre, tipo, mime: null, size: null, estado: "listo", created_at: "2026-11-10T12:00:00Z", hijos: tipo === "carpeta" ? 2 : null, del_equipo: false, ...extra,
});

describe("la lógica", () => {
  it("las carpetas del día se leen como hoy, ayer o la fecha; las de antes no", () => {
    expect(queDiaEs("2026-11-10", "2026-11-10")).toBe("hoy");
    expect(queDiaEs("2026-11-09", "2026-11-10")).toBe("ayer");
    expect(queDiaEs("2026-10-31", "2026-11-01")).toBe("ayer");
    expect(queDiaEs("2026-11-01", "2026-11-10")).toBeInstanceOf(Date);
    expect(queDiaEs("SCRIPT", "2026-11-10")).toBeNull();
  });

  it("«Del equipo» cuenta lo que llegó después de la última mirada; la primera vez, todo", () => {
    const h = [{ created_at: "2026-11-09T00:00:00Z" }, { created_at: "2026-11-10T09:00:00Z" }];
    expect(nuevosDesde(h, null)).toBe(2);
    expect(nuevosDesde(h, "2026-11-10T00:00:00Z")).toBe(1);
  });
});

describe("la página según el link", () => {
  beforeEach(() => {
    for (const k of Object.keys(respuestas)) delete respuestas[k];
    invocar.mockClear();
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });

  it("el de la creadora: la saluda, tiene las 4 pestañas y avisa lo nuevo del equipo", async () => {
    respuestas.info = {
      existe: true, activo: true, tipo: "personal", permisos: { subir: true, ver: true, compartir: true },
      carpeta: "MIMIMOUSE", carpeta_id: "raiz", creadora: "Mimimouse", del_equipo_id: "equipo",
    };
    respuestas["listar:equipo"] = { carpeta: { id: "equipo", nombre: "Del equipo" }, ruta: [], hijos: [hijo("guion.pdf", "archivo"), hijo("editado.mp4", "archivo")] };
    respuestas["listar:raiz"] = {
      carpeta: { id: "raiz", nombre: "MIMIMOUSE" }, ruta: [{ id: "raiz", nombre: "MIMIMOUSE" }],
      // La carpeta del día de HOY (no una fecha fija: el banco corre cualquier día).
      hijos: [hijo("Del equipo", "carpeta", { del_equipo: true }), hijo(hoyEnColombia(), "carpeta")],
    };
    abrir();
    expect(await screen.findByText(/drive.carpeta.hola.*Mimimouse/)).toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    for (const p of ["subir", "mios", "equipo", "compartir"]) {
      expect(within(nav).getByRole("button", { name: new RegExp(`drive.carpeta.tab.${p}`) })).toBeInTheDocument();
    }
    // 2 cosas del equipo que nunca miró.
    expect(await within(nav).findByText("2")).toBeInTheDocument();

    // «Mis archivos» muestra sus días, sin repetir «Del equipo» (tiene su pestaña).
    fireEvent.click(within(nav).getByRole("button", { name: /drive.carpeta.tab.mios/ }));
    expect(await screen.findByText("drive.carpeta.hoy")).toBeInTheDocument();
    expect(screen.queryByText("drive.carpeta.tab.equipo", { selector: "span.block" })).not.toBeInTheDocument();
  });

  it("el de invitado (fotógrafo) y los de siempre SOLO suben: sin pestañas ni nada que ver", async () => {
    respuestas.info = { existe: true, activo: true, tipo: "invitado", permisos: { subir: true, ver: false, compartir: false }, carpeta: "MIMIMOUSE", carpeta_id: null };
    abrir();
    expect(await screen.findByText("drive.aportar.elegir")).toBeInTheDocument();
    expect(screen.getByLabelText("drive.aportar.tuNombre")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(invocar).not.toHaveBeenCalledWith("tok123", "listar", expect.anything());
  });

  it("uno de ver: solo la carpeta compartida, sin subir", async () => {
    respuestas.info = { existe: true, activo: true, tipo: "ver", permisos: { subir: false, ver: true, compartir: false }, carpeta: "2026-11-10", carpeta_id: "dia" };
    respuestas["listar:dia"] = { carpeta: { id: "dia", nombre: "2026-11-10" }, ruta: [{ id: "dia", nombre: "2026-11-10" }], hijos: [hijo("foto.jpg", "archivo")] };
    abrir();
    expect(await screen.findByText("drive.carpeta.compartidaContigo")).toBeInTheDocument();
    expect(await screen.findByTitle("foto.jpg")).toBeInTheDocument();
    expect(screen.queryByText("drive.aportar.elegir")).not.toBeInTheDocument();
    expect(screen.queryByText("drive.carpeta.compartirCarpeta")).not.toBeInTheDocument();
  });

  it("⚠️ si la red falla lo DICE y ofrece reintentar (no «link no encontrado»)", async () => {
    respuestas.info = new Error("Failed to fetch");
    abrir();
    // La página reintenta 2 veces (conexión floja del celular) antes de rendirse.
    expect(await screen.findByText("drive.carpeta.falloInfo", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "drive.carpeta.reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("drive.aportar.noExiste")).not.toBeInTheDocument();
  });

  it("un link cerrado lo dice", async () => {
    respuestas.info = { existe: true, activo: false, carpeta: "MIMIMOUSE" };
    abrir();
    expect(await screen.findByText("drive.aportar.cerrado")).toBeInTheDocument();
  });
});
