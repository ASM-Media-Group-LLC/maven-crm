import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// DRIVE: OTRAS VISTAS Y MINIATURAS (Jhon, 02/10: «sería bueno tener otro tipo
// de vistas para los archivos, no solo la lista, sino miniaturas»). Lista,
// Cuadrícula y Galería, «Agrupar por fecha», la elección guardada por persona,
// y las miniaturas pedidas de a muchas (UNA llamada por página de cuadritos).

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useDirectorioCorreo", () => ({ useDirectorioCorreo: () => ({ data: [] }), candidatosDelDirectorio: () => [] }));
vi.mock("@/components/oficina/DriveCupos", () => ({ BarraDeUso: () => null, BarraDeUsoAgencia: () => null, CuposDialog: () => null }));
vi.mock("@/pages/oficina/drive/VisorArchivo", () => ({
  default: ({ abierto }: { abierto: string | null }) => <span data-testid="visor">{abierto ?? "cerrado"}</span>,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }) }));

const invocaciones = vi.hoisted(() => [] as { action: string; ids: string[] }[]);
const perfil = vi.hoisted(() => ({ ui_prefs: null as unknown, escrituras: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const ops: [string, unknown[]][] = [];
    const b: Record<string, unknown> = new Proxy({}, {
      get(_o, prop: string) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(() => {
            if (tabla === "profiles") {
              const upd = ops.find(([o]) => o === "update");
              if (upd) { perfil.escrituras.push(upd[1][0]); perfil.ui_prefs = (upd[1][0] as { ui_prefs: unknown }).ui_prefs; return { data: null, error: null }; }
              return { data: { id: "yo", ui_prefs: perfil.ui_prefs }, error: null };
            }
            return { data: [], error: null };
          }).then(ok, mal);
        }
        return (...args: unknown[]) => { ops.push([prop, args]); return b; };
      },
    });
    return b;
  };
  return {
    supabase: {
      from: (t: string) => consulta(t),
      rpc: vi.fn(async () => ({ data: "dueno", error: null })),
      functions: {
        invoke: vi.fn(async (_fn: string, { body }: { body: { action: string; ids: string[] } }) => {
          invocaciones.push({ action: body.action, ids: body.ids });
          if (body.action === "miniaturas") {
            return { data: { urls: Object.fromEntries(body.ids.map((id) => [id, `https://nas.example/o?t=mini-${id}`])) }, error: null };
          }
          return { data: null, error: null };
        }),
      },
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getSession: async () => ({ data: { session: { user: { id: "yo" } } } }),
        getUser: async () => ({ data: { user: { id: "yo" } }, error: null }),
      },
    },
  };
});

const vistaFalsa = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock("@/hooks/useDrive", async (original) => ({
  ...(await original<typeof import("@/hooks/useDrive")>()),
  useDriveVista: () => ({ data: vistaFalsa.lista, isLoading: false, error: null }),
  useRutaDrive: () => ({ data: [] }),
  useSubidasDrive: () => ({ subidas: [], subir: vi.fn(), limpiar: vi.fn() }),
}));

import DrivePage from "@/pages/oficina/DrivePage";
import type { DriveItem } from "@/hooks/useDrive";
import * as edge from "../../../../supabase/functions/drive/logica";
import { EXTENSIONES_CON_MINIATURA, extensionParaMiniatura, MINIATURA_POR_MIME } from "@/lib/drive/miniaturas";
import { agruparPorFecha, grupoDe, recortarGrupos } from "@/lib/drive/agrupar";
import { prefsDeVista } from "@/hooks/useVistaDrive";

const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "yo", parent_id: null, tipo: "archivo", nombre, mime: null, size: 100, estado: "listo",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", last_opened_at: null, trashed_at: null, ...extra,
});

function dibujar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/oficina/drive"]}>
        <Routes><Route path="/oficina/drive" element={<DrivePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invocaciones.length = 0;
  perfil.ui_prefs = null;
  perfil.escrituras.length = 0;
  localStorage.clear();
  vistaFalsa.lista = [
    item("c1", "Contabilidad", { tipo: "carpeta", size: null }),
    item("f1", "Foto.jpg"),
    item("f2", "Contrato.docx"),
    item("f3", "notas.txt"),
    item("f4", "IMG_1234", { mime: "image/heic" }),
  ];
});

describe("⚠️ qué tiene miniatura: la pantalla y la edge piensan IGUAL", () => {
  it("las mismas tablas", () => {
    expect([...EXTENSIONES_CON_MINIATURA]).toEqual([...edge.EXTENSIONES_CON_MINIATURA]);
    expect(MINIATURA_POR_MIME).toEqual(edge.MINIATURA_POR_MIME);
  });
  it("y la misma respuesta para cada caso", () => {
    const casos: [string, string | null][] = [
      ["Foto.JPG", null], ["IMG_1234", "image/heic"], ["video.mov", null], ["cv.pdf", "application/octet-stream"],
      ["logo.svg", "image/svg+xml"], ["notas.txt", "text/plain"], ["x", null], ["Balance.xlsx", "application/zip"],
    ];
    for (const [n, m] of casos) expect(extensionParaMiniatura(n, m), n).toBe(edge.extensionParaMiniatura(n, m));
  });
});

describe("agrupar por fecha", () => {
  const ahora = new Date(2026, 9, 2, 15, 0); // viernes 2 de octubre
  it("Hoy, Ayer, Esta semana, Este mes y después mes por mes", () => {
    expect(grupoDe(new Date(2026, 9, 2, 8), ahora).tipo).toBe("hoy");
    expect(grupoDe(new Date(2026, 9, 1, 23), ahora).tipo).toBe("ayer");
    expect(grupoDe(new Date(2026, 8, 29, 9), ahora).tipo).toBe("semana"); // el lunes, aunque sea de septiembre
    expect(grupoDe(new Date(2026, 8, 20), ahora)).toMatchObject({ tipo: "otroMes", clave: "2026-8" });
    expect(grupoDe(new Date(2025, 8, 20), ahora).clave).toBe("2025-8");
    expect(grupoDe(new Date(2026, 9, 5), ahora).tipo).toBe("hoy"); // reloj adelantado
    const mitadDeMes = new Date(2026, 9, 20, 12);
    expect(grupoDe(new Date(2026, 9, 3), mitadDeMes).tipo).toBe("mes");
  });
  it("del más nuevo al más viejo, con las carpetas primero en cada grupo; y se recorta a lo dibujado", () => {
    const f = (id: string, fecha: Date, tipo: "carpeta" | "archivo" = "archivo") => item(id, id, { tipo, updated_at: fecha.toISOString() });
    const grupos = agruparPorFecha([
      f("viejo", new Date(2026, 6, 1)), f("hoy1", new Date(2026, 9, 2, 9)), f("carpetaHoy", new Date(2026, 9, 2, 8), "carpeta"),
      f("hoy2", new Date(2026, 9, 2, 14)), f("ayer", new Date(2026, 9, 1)),
    ], (i) => i.updated_at, ahora);
    expect(grupos.map((g) => g.clave)).toEqual(["hoy", "ayer", "2026-6"]);
    expect(grupos[0].items.map((i) => i.id)).toEqual(["carpetaHoy", "hoy2", "hoy1"]);
    expect(recortarGrupos(grupos, 4).map((g) => g.items.length)).toEqual([3, 1]);
  });
});

describe("la vista elegida se guarda por persona", () => {
  it("lo de afuera se sanea", () => {
    expect(prefsDeVista({ modo: "galeria", agrupar: true })).toEqual({ modo: "galeria", agrupar: true });
    expect(prefsDeVista({ modo: "mosaico", agrupar: "si" })).toEqual({ modo: "lista", agrupar: false });
    expect(prefsDeVista(null)).toEqual({ modo: "lista", agrupar: false });
  });

  it("al cambiar: en este navegador y en el perfil, SIN pisar la apariencia ni el idioma", async () => {
    perfil.ui_prefs = { oled: true, language: "en" };
    dibujar();
    fireEvent.click(screen.getByRole("button", { name: "Cuadrícula" }));
    expect(screen.getByRole("button", { name: "Cuadrícula" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem("maven.drive.vista.yo")!)).toEqual({ modo: "cuadricula", agrupar: false });
    await waitFor(() => expect(perfil.escrituras).toHaveLength(1));
    expect(perfil.ui_prefs).toEqual({ oled: true, language: "en", drive: { modo: "cuadricula", agrupar: false } });
  });

  it("en otro dispositivo (sin nada en el navegador) se usa la del perfil", async () => {
    perfil.ui_prefs = { drive: { modo: "galeria", agrupar: true } };
    dibujar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Galería" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Agrupar por fecha" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("cuadrícula y galería", () => {
  it("la cuadrícula: carpetas arriba, archivos en tarjetas con su miniatura; UNA llamada para todas, solo de lo que tiene", async () => {
    localStorage.setItem("maven.drive.vista.yo", JSON.stringify({ modo: "cuadricula", agrupar: false }));
    dibujar();
    expect(screen.getByRole("heading", { name: "Carpetas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Archivos" })).toBeInTheDocument();
    await waitFor(() => expect(invocaciones.filter((i) => i.action === "miniaturas")).toHaveLength(1));
    // La carpeta y el .txt no se piden; el HEIC sin extensión sí (por su tipo).
    expect(invocaciones[0].ids).toEqual(["f1", "f2", "f4"]);
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(3));
    const img = screen.getByRole("button", { name: "Foto.jpg" }).querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://nas.example/o?t=mini-f1");
    expect(img).toHaveAttribute("loading", "lazy");
    // Si el NAS no la tiene, se ve el ícono (y no una imagen rota).
    fireEvent.error(img);
    expect(screen.getByRole("button", { name: "Foto.jpg" }).querySelector("img")).toBeNull();
  });

  it("⚠️ la lista no pide miniaturas (no hacen falta)", async () => {
    dibujar();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(invocaciones.filter((i) => i.action === "miniaturas")).toHaveLength(0);
  });

  it("elegir varios, Shift, el ⋮ y abrir funcionan igual en la galería", async () => {
    localStorage.setItem("maven.drive.vista.yo", JSON.stringify({ modo: "galeria", agrupar: false }));
    dibujar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar «Foto.jpg»" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar «notas.txt»" }), { shiftKey: true });
    const barra = screen.getByRole("toolbar", { name: "Acciones con lo seleccionado" });
    expect(within(barra).getByText("3 seleccionados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones de Foto.jpg" })).toBeInTheDocument();
    // Un clic común abre en el visor; con Ctrl elige.
    fireEvent.click(screen.getByRole("button", { name: "IMG_1234" }), { ctrlKey: true, detail: 1 });
    expect(within(barra).getByText("4 seleccionados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "notas.txt" }), { detail: 1 });
    expect(screen.getByTestId("visor")).toHaveTextContent("f3");
  });

  it("⚠️ una carpeta de miles se dibuja de a tramos y pide miniaturas de a 100", { timeout: 30_000 }, async () => {
    vistaFalsa.lista = Array.from({ length: 3000 }, (_, n) => item(`f${n}`, `IMG_${n}.jpg`));
    let avisar: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) { avisar = cb; }
      observe() {}
      disconnect() {}
    });
    localStorage.setItem("maven.drive.vista.yo", JSON.stringify({ modo: "cuadricula", agrupar: false }));
    dibujar();
    expect(screen.getAllByRole("checkbox", { name: /Seleccionar «IMG_/ })).toHaveLength(120);
    await waitFor(() => expect(invocaciones.filter((i) => i.action === "miniaturas")).toHaveLength(2));
    expect(invocaciones.map((i) => i.ids.length)).toEqual([100, 20]);
    // Al acercarse al final, los siguientes.
    await act(async () => { avisar!([{ isIntersecting: true }]); });
    expect(screen.getAllByRole("checkbox", { name: /Seleccionar «IMG_/ })).toHaveLength(240);
    // «Seleccionar todo» elige los 3.000, no solo lo dibujado.
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todo" }));
    expect(within(screen.getByRole("toolbar", { name: "Acciones con lo seleccionado" })).getByText("3000 seleccionados")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("agrupar por fecha pone los títulos también en la lista", () => {
    const hoy = new Date().toISOString();
    vistaFalsa.lista = [item("a", "nuevo.pdf", { updated_at: hoy }), item("b", "viejo.pdf", { updated_at: "2024-03-10T12:00:00Z" })];
    localStorage.setItem("maven.drive.vista.yo", JSON.stringify({ modo: "lista", agrupar: true }));
    dibujar();
    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Marzo de 2024")).toBeInTheDocument();
  });
});
