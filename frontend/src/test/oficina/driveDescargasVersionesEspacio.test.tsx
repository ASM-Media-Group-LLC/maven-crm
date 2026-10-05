import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// DRIVE: TRES DETALLES (Jhon, 03/10).
//   1. Bajar varios en un .zip CON AVANCE y «Cancelar»: la página lo pide al
//      NAS con fetch y lee la respuesta de a pedazos (antes un iframe
//      escondido: no se sabía cuánto iba ni se podía cortar). El total viene
//      en Content-Length (el NAS lo calcula: tamanoDelZip).
//   2. «Administrar versiones»: las versiones de lo editado en la Oficina, con
//      fecha, quién y tamaño; bajarlas y restaurarlas (solo quien edita).
//   3. El aviso al mover algo que cambia de qué espacio se descuenta (Mi
//      unidad ↔ unidad compartida). En Maven no hay cupo por unidad: hay dos
//      bolsas, el espacio personal y el común de la agencia.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useDirectorioCorreo", () => ({
  useDirectorioCorreo: () => ({ data: [{ user_id: "ana", nombre: "Ana Pérez" }] }),
  candidatosDelDirectorio: () => [],
}));
vi.mock("@/components/oficina/DriveCupos", () => ({ BarraDeUso: () => null, BarraDeUsoAgencia: () => null, CuposDialog: () => null }));
vi.mock("@/pages/oficina/drive/VisorArchivo", () => ({ default: () => null }));
const toasts = vi.hoisted(() => ({ exito: [] as string[], error: [] as string[] }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn((m: string) => { toasts.exito.push(m); return 1; }),
    error: vi.fn((m: string) => { toasts.error.push(m); return 2; }),
    loading: vi.fn(() => 3),
  }),
}));

// ── Un Supabase falso que anota cada consulta y contesta según la tabla ──────
type Op = [string, unknown[]];
const consultas = vi.hoisted(() => [] as { tabla: string; ops: Op[] }[]);
const invocados = vi.hoisted(() => [] as Record<string, unknown>[]);
const respuestas = vi.hoisted(() => ({
  tabla: (_t: string, _ops: Op[]): { data: unknown; error: unknown } => ({ data: [], error: null }),
  rpc: (_fn: string, _args: unknown): { data: unknown; error: unknown } => ({ data: "dueno", error: null }),
  invoke: (_fn: string, _body: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: null, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const ops: Op[] = [];
    consultas.push({ tabla, ops });
    const b: Record<string, unknown> = new Proxy({}, {
      get(_o, prop: string) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
            Promise.resolve().then(() => respuestas.tabla(tabla, ops)).then(ok, mal);
        }
        return (...args: unknown[]) => { ops.push([prop, args]); return b; };
      },
    });
    return b;
  };
  return {
    supabase: {
      from: (t: string) => consulta(t),
      rpc: vi.fn(async (fn: string, args: unknown) => respuestas.rpc(fn, args)),
      functions: {
        invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => {
          invocados.push(body);
          return respuestas.invoke(fn, body);
        }),
      },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
    },
  };
});

const vistaFalsa = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock("@/hooks/useDrive", async (original) => {
  const real = await original<typeof import("@/hooks/useDrive")>();
  return {
    ...real,
    useDriveVista: () => ({ data: vistaFalsa.lista, isLoading: false, error: null }),
    useRutaDrive: () => ({ data: [] }),
    useSubidasDrive: () => ({ subidas: [], subir: vi.fn(), limpiar: vi.fn() }),
  };
});

import DrivePage from "@/pages/oficina/DrivePage";
import DriveMoverDialog from "@/components/oficina/DriveMoverDialog";
import DriveVersionesDialog from "@/components/oficina/DriveVersionesDialog";
import type { DriveItem } from "@/hooks/useDrive";
import { marcarActual } from "@/hooks/useVersionesDrive";
import {
  bajarDelNas, comoBajar, destinoEnMemoria, EN_MEMORIA_CON_DISCO, EN_MEMORIA_SIN_DISCO, fraccion, nombreDelPermiso,
  tamanoEstimado, type DestinoDelZip,
} from "@/lib/drive/descargaZip";
import { bolsaDe, cambioDeEspacio, entraEnElEspacio, type FichaParaEspacio } from "@/lib/drive/espacio";

const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "yo", parent_id: null, tipo: "archivo", nombre, mime: null, size: 100, estado: "listo",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", last_opened_at: null, trashed_at: null,
  unidad_id: null, ...extra,
});
const carpeta = (id: string, nombre: string, extra: Partial<DriveItem> = {}) => item(id, nombre, { tipo: "carpeta", size: null, ...extra });

function conConsultas(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const dibujarDrive = () => conConsultas(
  <MemoryRouter initialEntries={["/oficina/drive"]}>
    <Routes><Route path="/oficina/drive" element={<DrivePage />} /></Routes>
  </MemoryRouter>,
);
const casilla = (nombre: string) => screen.getByRole("checkbox", { name: `Seleccionar «${nombre}»` });
const barra = () => screen.queryByRole("toolbar", { name: "Acciones con lo seleccionado" });

/** El permiso como lo firma la edge: `<datos>.<firma>`, los datos en base64url. */
const permisoCon = (datos: Record<string, unknown>) =>
  `${btoa(JSON.stringify(datos)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.firma`;
const PERMISO = permisoCon({ op: "zip", n: "Contabilidad-2026-10-03.zip", e: 1, l: [] });

/** Una respuesta del NAS que entrega `pedazos` de a uno. */
function respuestaDelNas(pedazos: Uint8Array[], largo: number | null) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-length" && largo != null ? String(largo) : null) },
    body: { getReader: () => ({ read: async () => (i < pedazos.length ? { done: false, value: pedazos[i++] } : { done: true, value: undefined }) }) },
    json: async () => null,
  } as unknown as Response;
}

const fetchOriginal = globalThis.fetch;
const crearUrl = URL.createObjectURL;
const soltarUrl = URL.revokeObjectURL;
beforeEach(() => {
  consultas.length = 0;
  invocados.length = 0;
  toasts.exito.length = 0;
  toasts.error.length = 0;
  vistaFalsa.lista = [carpeta("c1", "Contabilidad"), item("f1", "a.pdf"), item("f2", "b.pdf")];
  respuestas.tabla = () => ({ data: [], error: null });
  respuestas.rpc = () => ({ data: "dueno", error: null });
  respuestas.invoke = (_fn, body) => (body.action === "bajar_varios"
    ? { data: { url: "https://nas.example/zip", t: PERMISO, archivos: 3, bytes: 30 }, error: null }
    : { data: null, error: null });
  URL.createObjectURL = vi.fn(() => "blob:zip");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  URL.createObjectURL = crearUrl;
  URL.revokeObjectURL = soltarUrl;
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  vi.restoreAllMocks();
});

// ─── 1. El .zip con avance ───────────────────────────────────────────────────
describe("el .zip: cómo y dónde (sin dibujar)", () => {
  it("hasta 1 GB (500 MB sin disco) en memoria; más, directo a disco o, sin disco, el navegador", () => {
    expect(comoBajar(10, false)).toBe("memoria");
    expect(comoBajar(EN_MEMORIA_SIN_DISCO, false)).toBe("memoria");
    expect(comoBajar(EN_MEMORIA_SIN_DISCO + 1, false)).toBe("navegador");
    expect(comoBajar(EN_MEMORIA_SIN_DISCO + 1, true)).toBe("memoria");
    expect(comoBajar(EN_MEMORIA_CON_DISCO + 1, true)).toBe("disco");
  });
  it("sin Content-Length se estima (archivos + cabeceras) y la barra no se llena antes de terminar", () => {
    expect(tamanoEstimado(1000, 2)).toBeGreaterThan(1000);
    expect(tamanoEstimado(-5, -1)).toBeGreaterThanOrEqual(0);
    expect(fraccion(50, 100, true)).toBe(0.5);
    expect(fraccion(200, 100, true)).toBe(1);
    expect(fraccion(200, 100, false)).toBe(0.99);
    expect(fraccion(5, 0, true)).toBe(0);
  });
  it("el nombre sale del permiso firmado (con tildes); si no se puede leer, «Maven.zip»", () => {
    expect(nombreDelPermiso(PERMISO)).toBe("Contabilidad-2026-10-03.zip");
    // Los datos van en UTF-8 (la edge firma con TextEncoder).
    const bytes = new TextEncoder().encode(JSON.stringify({ op: "zip", n: "Año 2026 — ñandú.zip" }));
    const conTildes = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(nombreDelPermiso(`${conTildes}.firma`)).toBe("Año 2026 — ñandú.zip");
    expect(nombreDelPermiso("basura")).toBe("Maven.zip");
    expect(nombreDelPermiso(permisoCon({ n: "../x.zip" }))).toBe("Maven.zip");
    expect(nombreDelPermiso(permisoCon({ n: "x.exe" }))).toBe("Maven.zip");
  });
  it("en memoria se junta de a tandas y al final sale UN .zip con todo", () => {
    const guardados: Blob[] = [];
    const d = destinoEnMemoria((b) => guardados.push(b), 4);
    for (const p of [new Uint8Array(3), new Uint8Array(3), new Uint8Array(1)]) d.escribir(p);
    d.terminar();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].size).toBe(7);
    expect(guardados[0].type).toBe("application/zip");
  });
});

describe("bajarDelNas", () => {
  const anotador = () => {
    const escrito: number[] = [];
    const d: DestinoDelZip & { terminado: boolean; descartado: boolean } = {
      terminado: false,
      descartado: false,
      escribir: (p) => { escrito.push(p.length); },
      terminar: () => { d.terminado = true; },
      descartar: () => { d.descartado = true; },
    };
    return { d, escrito };
  };
  it("manda el permiso en el CUERPO (formulario, nunca en la URL), avisa el total y el avance", async () => {
    const { d, escrito } = anotador();
    const pedir = vi.fn(async () => respuestaDelNas([new Uint8Array(4), new Uint8Array(6)], 10));
    const totales: number[] = [];
    const avances: number[] = [];
    const n = await bajarDelNas({
      url: "https://nas.example/zip", permiso: "permiso-largo", destino: d, senal: new AbortController().signal,
      alSaberTotal: (t) => totales.push(t), alAvanzar: (r) => avances.push(r), pedir: pedir as unknown as typeof fetch,
    });
    expect(n).toBe(10);
    const [url, init] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nas.example/zip");
    expect(url).not.toContain("permiso-largo");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe("t=permiso-largo");
    expect(totales).toEqual([10]);
    expect(avances).toEqual([4, 10]);
    expect(escrito).toEqual([4, 6]);
    expect(d.terminado).toBe(true);
  });
  it("⚠️ si llega menos de lo anunciado (el NAS cortó), es un error y no se guarda", async () => {
    const { d } = anotador();
    await expect(bajarDelNas({
      url: "u", permiso: "p", destino: d, senal: new AbortController().signal,
      pedir: (async () => respuestaDelNas([new Uint8Array(4)], 10)) as unknown as typeof fetch,
    })).rejects.toThrow(/se cortó/);
    expect(d.terminado).toBe(false);
    expect(d.descartado).toBe(true);
  });
  it("un error del NAS llega con su texto", async () => {
    const { d } = anotador();
    const pedir = async () => ({ ok: false, status: 403, body: null, json: async () => ({ error: "permiso inválido o vencido" }) }) as unknown as Response;
    await expect(bajarDelNas({ url: "u", permiso: "p", destino: d, senal: new AbortController().signal, pedir: pedir as unknown as typeof fetch }))
      .rejects.toThrow("permiso inválido o vencido");
    expect(d.descartado).toBe(true);
  });
});

describe("el panel de descargas", () => {
  /** Un NAS que entrega un pedazo y después espera (hasta que se cancele). */
  function nasQueEspera() {
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const senal = init!.signal!;
      let dado = false;
      return {
        ok: true, status: 200,
        headers: { get: () => "1000" },
        body: {
          getReader: () => ({
            read: () => {
              if (!dado) { dado = true; return Promise.resolve({ done: false, value: new Uint8Array(400) }); }
              return new Promise((_ok, mal) => senal.addEventListener("abort", () => mal(Object.assign(new Error("abortado"), { name: "AbortError" }))));
            },
          }),
        },
        json: async () => null,
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("varios: se bajan con fetch, el panel muestra cuánto va y al terminar se guarda el .zip con su nombre", async () => {
    globalThis.fetch = vi.fn(async () => respuestaDelNas([new Uint8Array(1024), new Uint8Array(1024)], 2048)) as unknown as typeof fetch;
    const descargados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { descargados.push(this.download); });
    const enviados = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    dibujarDrive();
    fireEvent.click(casilla("Contabilidad"));
    fireEvent.click(casilla("a.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    const panel = await screen.findByRole("region", { name: "Descargas" });
    await waitFor(() => expect(within(panel).getByText("Descargada · 2.0 KB")).toBeInTheDocument());
    expect(descargados).toEqual(["Contabilidad-2026-10-03.zip"]);
    expect(enviados).not.toHaveBeenCalled(); // ya no por el iframe
    expect(invocados.find((b) => b.action === "bajar_varios")?.ids).toEqual(["c1", "f1"]);
    // Terminó: el panel se puede cerrar.
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar las descargas" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Descargas" })).toBeNull());
  });

  it("mientras baja muestra el avance con el total del NAS, y «Cancelar» lo corta", async () => {
    nasQueEspera();
    const descargados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { descargados.push(this.download); });
    dibujarDrive();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    const panel = await screen.findByRole("region", { name: "Descargas" });
    expect(await within(panel).findByText(/de 1000 B · 3 archivos/)).toBeInTheDocument();
    expect(within(panel).getByText("Descargando (1)")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Cerrar las descargas" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Cancelar la descarga de «Contabilidad-2026-10-03.zip»" }));
    });
    expect(await within(panel).findByText("Cancelada")).toBeInTheDocument();
    expect(descargados).toEqual([]);
  });

  it("si el NAS lo rechaza, el panel dice por qué", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, body: null, json: async () => ({ error: "permiso inválido o vencido" }) })) as unknown as typeof fetch;
    dibujarDrive();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    expect(await screen.findByText("No se pudo bajar: permiso inválido o vencido")).toBeInTheDocument();
  });

  it("muy grande con Chrome/Edge: va directo al archivo elegido; si el navegador pide un clic, el panel lo ofrece", async () => {
    respuestas.invoke = (_fn, body) => (body.action === "bajar_varios"
      ? { data: { url: "https://nas.example/zip", t: PERMISO, archivos: 3, bytes: 2 * 1024 ** 3 }, error: null }
      : { data: null, error: null });
    globalThis.fetch = vi.fn(async () => respuestaDelNas([new Uint8Array(10), new Uint8Array(20)], 30)) as unknown as typeof fetch;
    const escrito: number[] = [];
    const archivo = { write: vi.fn(async (p: Uint8Array) => { escrito.push(p.length); }), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    const guardarComo = vi.fn()
      // La primera vez el navegador no deja (la edge tardó y ya no hay clic reciente).
      .mockRejectedValueOnce(Object.assign(new Error("Must be handling a user gesture"), { name: "SecurityError" }))
      .mockResolvedValue({ createWritable: async () => archivo });
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = guardarComo;
    const descargados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { descargados.push(this.download); });
    dibujarDrive();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    const panel = await screen.findByRole("region", { name: "Descargas" });
    await act(async () => { fireEvent.click(await within(panel).findByRole("button", { name: "Elegir dónde guardarlo" })); });
    await waitFor(() => expect(within(panel).getByText(/^Descargada/)).toBeInTheDocument());
    expect(guardarComo).toHaveBeenCalledTimes(2);
    expect(guardarComo.mock.calls[1][0]).toMatchObject({ suggestedName: "Contabilidad-2026-10-03.zip" });
    expect(escrito).toEqual([10, 20]);
    expect(archivo.close).toHaveBeenCalled();
    expect(descargados).toEqual([]); // nada pasó por la memoria
  });
});

// ─── 2. «Administrar versiones» ──────────────────────────────────────────────
describe("«Administrar versiones»", () => {
  const VERSIONES = [
    { id: "v3", storage_key: "t/k3", size: 3000, saved_by: "yo", created_at: "2026-10-03T15:00:00Z" },
    { id: "v2", storage_key: "t/k2", size: 2000, saved_by: "ana", created_at: "2026-10-02T15:00:00Z" },
    { id: "v1", storage_key: "t/google/k1", size: 1000, saved_by: null, created_at: "2026-09-01T15:00:00Z" },
  ];
  const conVersiones = (rol: string) => {
    respuestas.tabla = (t, ops) => {
      if (t === "drive_versiones") return { data: VERSIONES, error: null };
      if (t === "drive_items" && ops.some(([o, a]) => o === "select" && String(a[0]) === "storage_key")) return { data: { storage_key: "t/k3" }, error: null };
      return { data: [], error: null };
    };
    respuestas.rpc = (fn) => ({ data: fn === "drive_mi_rol" ? rol : null, error: null });
  };

  it("la actual es la MÁS NUEVA con el archivo de la ficha (una restaurada aparece dos veces)", () => {
    const filas = [
      { id: "r", storage_key: "k1", size: 1, saved_by: null, created_at: "3" },
      { id: "b", storage_key: "k2", size: 1, saved_by: null, created_at: "2" },
      { id: "a", storage_key: "k1", size: 1, saved_by: null, created_at: "1" },
    ];
    expect(marcarActual(filas, "k1").map((v) => v.actual)).toEqual([true, false, false]);
    expect(marcarActual(filas, null).some((v) => v.actual)).toBe(false);
  });

  it("lista fecha, quién y tamaño; la actual marcada, el original al final; quien edita puede restaurar", async () => {
    conVersiones("editor");
    conConsultas(<DriveVersionesDialog item={{ id: "f1", nombre: "Plan.docx" }} nombreDe={(id) => (id === "ana" ? "Ana Pérez" : id === "yo" ? "Yo" : "—")} onCerrar={() => {}} />);
    const dialogo = await screen.findByRole("dialog", { name: "Administrar versiones" });
    await within(dialogo).findByText("Versión actual");
    const filas = within(dialogo).getAllByRole("listitem");
    expect(filas).toHaveLength(3);
    expect(within(filas[0]).getByText("Versión actual")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/Guardada por Yo · 2.9 KB/)).toBeInTheDocument();
    expect(within(filas[1]).getByText(/Guardada por Ana Pérez · 2.0 KB/)).toBeInTheDocument();
    expect(within(filas[2]).getByText("Original")).toBeInTheDocument();
    expect(within(filas[2]).getByText(/Sin autor conocido · 1000 B/)).toBeInTheDocument();
    // La actual no se restaura; las otras sí.
    expect(within(filas[0]).queryByRole("button", { name: /Restaurar la versión/ })).toBeNull();
    fireEvent.click(within(filas[1]).getByRole("button", { name: /Restaurar la versión/ }));
    const confirmar = within(filas[1]).getByRole("alert");
    expect(confirmar).toHaveTextContent("La actual queda guardada en el historial");
    await act(async () => { fireEvent.click(within(confirmar).getByRole("button", { name: "Restaurar" })); });
    await waitFor(() => expect(invocados).toContainEqual({ action: "restaurar_version", version: "v2" }));
    expect(toasts.exito[0]).toMatch(/^Se restauró la versión del /);
  });

  it("quien solo puede ver baja versiones pero no restaura", async () => {
    conVersiones("lector");
    conConsultas(<DriveVersionesDialog item={{ id: "f1", nombre: "Plan.docx" }} nombreDe={() => "—"} onCerrar={() => {}} />);
    const dialogo = await screen.findByRole("dialog", { name: "Administrar versiones" });
    await within(dialogo).findByText("Solo quien puede editar el archivo puede restaurar una versión.");
    expect(within(dialogo).queryAllByRole("button", { name: /Restaurar la versión/ })).toHaveLength(0);
    expect(within(dialogo).getAllByRole("button", { name: /Descargar la versión del/ })).toHaveLength(3);
  });

  it("sin versiones (nunca se editó en la Oficina) lo dice", async () => {
    respuestas.tabla = (t) => (t === "drive_versiones" ? { data: [], error: null } : { data: { storage_key: "t/k" }, error: null });
    conConsultas(<DriveVersionesDialog item={{ id: "f1", nombre: "foto.jpg" }} nombreDe={() => "—"} onCerrar={() => {}} />);
    expect(await screen.findByText(/Este archivo tiene una sola versión/)).toBeInTheDocument();
  });

  it("se abre desde el menú ⋮ de un archivo (no de una carpeta)", async () => {
    dibujarDrive();
    fireEvent.keyDown(screen.getByRole("button", { name: "Opciones de a.pdf" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Administrar versiones" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Opciones de Contabilidad" }), { key: "Enter" });
    await screen.findByRole("menuitem", { name: "Abrir" });
    expect(screen.queryByRole("menuitem", { name: "Administrar versiones" })).toBeNull();
  });
});

// ─── 3. El aviso de espacio al mover ─────────────────────────────────────────
describe("¿de qué espacio sale? (sin dibujar)", () => {
  const f = (id: string, unidad_id: string | null, extra: Partial<FichaParaEspacio> = {}): FichaParaEspacio =>
    ({ id, tipo: "archivo", owner_id: "yo", size: 10, unidad_id, ...extra });
  it("dentro de cualquier unidad, el común de la agencia; fuera, el personal", () => {
    expect(bolsaDe("u1")).toBe("agencia");
    expect(bolsaDe(null)).toBe("personal");
    expect(bolsaDe(undefined)).toBe("personal");
  });
  it("entre dos unidades no cambia nada; de Mi unidad a una unidad (o al revés), sí", () => {
    expect(cambioDeEspacio([f("a", "u2")], "u1")).toBeNull();
    expect(cambioDeEspacio([f("a", null)], null)).toBeNull();
    expect(cambioDeEspacio([f("a", null), f("b", "u1")], "u1")).toEqual({ hacia: "agencia", cambian: [f("a", null)] });
    expect(cambioDeEspacio([f("a", "u1")], null)).toEqual({ hacia: "personal", cambian: [f("a", "u1")] });
  });
  it("sin tope siempre entra", () => {
    expect(entraEnElEspacio(10, null, 1e15)).toBe(true);
    expect(entraEnElEspacio(10, 100, 90)).toBe(true);
    expect(entraEnElEspacio(10, 100, 91)).toBe(false);
  });
});

describe("el aviso al mover", () => {
  /** La base: las fichas que se mueven, la unidad del destino y los usos. */
  function base({ unidadDeLaFicha, unidadDelDestino }: { unidadDeLaFicha: string | null; unidadDelDestino: string | null }) {
    respuestas.tabla = (t, ops) => {
      if (t === "drive_items" && ops.some(([o]) => o === "update")) return { data: [{ id: "f1" }], error: null };
      if (t === "drive_items" && ops.some(([o, a]) => o === "select" && String(a[0]).startsWith("id, tipo, owner_id, size, unidad_id"))) {
        return { data: [{ id: "f1", tipo: "archivo", owner_id: "yo", size: 2048, unidad_id: unidadDeLaFicha }], error: null };
      }
      if (t === "drive_items" && ops.some(([o, a]) => o === "select" && a[0] === "unidad_id")) {
        return { data: { unidad_id: unidadDelDestino }, error: null };
      }
      return { data: [], error: null };
    };
    respuestas.rpc = (fn) => {
      if (fn === "drive_uso_agencia") return { data: [{ usado: 5000, cupo: null, personas: 3 }], error: null };
      if (fn === "drive_uso") return { data: [{ usado: 1024, cupo: 3000 }], error: null };
      return { data: "editor", error: null };
    };
  }
  const dibujarMover = (destino: { id: string; nombre: string }, onMovido = vi.fn()) => {
    conConsultas(
      <DriveMoverDialog
        items={[item("f1", "a.pdf")]}
        inicio={{ raiz: "unidades", ruta: [destino] }}
        onCerrar={() => {}}
        onMovido={onMovido}
      />,
    );
    return onMovido;
  };
  const moverAqui = async () => {
    const boton = await screen.findByRole("button", { name: "Mover aquí" });
    await waitFor(() => expect(boton).toBeEnabled());
    await act(async () => { fireEvent.click(boton); });
  };
  const hayUpdate = () => consultas.some((c) => c.ops.some(([o]) => o === "update"));

  it("de Mi unidad a una unidad compartida: avisa que pasa al espacio común y, con «Mover», mueve", async () => {
    base({ unidadDeLaFicha: null, unidadDelDestino: "u1" });
    const onMovido = dibujarMover({ id: "u1", nombre: "Fotos KASH" });
    await moverAqui();
    const aviso = await screen.findByRole("alertdialog", { name: "¿Mover a «Fotos KASH»?" });
    expect(aviso).toHaveTextContent("pasará a ocupar el espacio común de la agencia");
    await within(aviso).findByText("Ocupa 2.0 KB.");
    expect(within(aviso).getByText("Espacio común de la agencia: usa 4.9 KB, sin tope.")).toBeInTheDocument();
    expect(hayUpdate()).toBe(false); // todavía no se movió nada
    await act(async () => { fireEvent.click(within(aviso).getByRole("button", { name: "Mover" })); });
    await waitFor(() => expect(onMovido).toHaveBeenCalled());
    expect(hayUpdate()).toBe(true);
  });

  it("de una unidad a Mi unidad: avisa que pasa a TU espacio, y si no alcanza lo dice; «Cancelar» no mueve", async () => {
    base({ unidadDeLaFicha: "u1", unidadDelDestino: null });
    respuestas.rpc = (fn) => (fn === "drive_uso" ? { data: [{ usado: 2000, cupo: 3000 }], error: null } : { data: "dueno", error: null });
    const onMovido = dibujarMover({ id: "c9", nombre: "Mis cosas" });
    await moverAqui();
    const aviso = await screen.findByRole("alertdialog", { name: "¿Mover a «Mis cosas»?" });
    expect(aviso).toHaveTextContent("pasará a ocupar el espacio personal de su propietario");
    expect(await within(aviso).findByText("Tu espacio: usas 2.0 KB de 2.9 KB.")).toBeInTheDocument();
    expect(await within(aviso).findByText("No alcanza: te pasarías de tu espacio.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(aviso).getByRole("button", { name: "Cancelar" })); });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(hayUpdate()).toBe(false);
    expect(onMovido).not.toHaveBeenCalled();
  });

  it("entre dos unidades compartidas (el mismo espacio común) mueve sin preguntar", async () => {
    base({ unidadDeLaFicha: "u2", unidadDelDestino: "u1" });
    const onMovido = dibujarMover({ id: "u1", nombre: "Fotos KASH" });
    await moverAqui();
    await waitFor(() => expect(onMovido).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

// ─── Las reglas que no se pueden aflojar (el código como texto) ──────────────
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/supabase/functions/drive/index.ts",
  "/supabase/functions/oficina-doc/drive.ts",
  "/supabase/functions/oficina-doc/index.ts",
  "/infra/nas-drive/server.mjs",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";

describe("⚠️ guardas", () => {
  const edge = leer("drive/index.ts");
  it("los archivos se cargaron (si no, lo de abajo pasaría en vacío)", () => {
    expect(edge).toMatch(/accion === "restaurar_version"/);
    expect(leer("oficina-doc/drive.ts")).toMatch(/export function claveDeDrive/);
    expect(leer("nas-drive/server.mjs")).toMatch(/async function servirZip/);
  });
  it("restaurar: la versión se lee COMO LA PERSONA y solo dueño o editor", () => {
    const i = edge.indexOf('accion === "restaurar_version"');
    const rama = edge.slice(i, edge.indexOf('accion === "bajar_varios"', i));
    expect(rama).toMatch(/versionComoLaPersona\(comoLaPersona, body\.version\)/);
    expect(rama).toMatch(/rolDe\(comoLaPersona, v\.item_id\)/);
    expect(rama).toMatch(/rol !== "dueno" && rol !== "editor"/);
    // El puntero se mueve solo si nadie guardó otra versión mientras tanto.
    expect(rama).toMatch(/\.eq\("storage_key", fila\.storage_key\)/);
    const f = edge.indexOf("async function versionComoLaPersona");
    expect(edge.slice(f, edge.indexOf("\n}\n", f))).toMatch(/cliente\.from\("drive_versiones"\)/);
  });
  it("bajar una versión: también como la persona", () => {
    const i = edge.indexOf('accion === "abrir_version"');
    const rama = edge.slice(i, edge.indexOf('accion === "restaurar_version"', i));
    expect(rama).toMatch(/versionComoLaPersona\(comoLaPersona/);
    expect(rama).toMatch(/comoLaPersona\.from\("drive_items"\)/);
  });
  it("una restaurada no reusa la llave de ONLYOFFICE (la oficina-doc mira si se restauró)", () => {
    expect(leer("oficina-doc/drive.ts")).toMatch(/restaurada_at \? Date\.parse\(a\.restaurada_at\)/);
    expect(leer("oficina-doc/index.ts")).toMatch(/fila\.restaurada_at = restauradaEl\(/);
  });
  it("el NAS manda el largo del .zip, calculado con las mismas piezas", () => {
    expect(leer("nas-drive/server.mjs")).toMatch(/"Content-Length": String\(tamanoDelZip\(entradas\)\)/);
  });
});
