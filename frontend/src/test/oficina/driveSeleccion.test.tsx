import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// DRIVE: ELEGIR VARIOS, MOVER Y BAJAR EN UN .ZIP (María Villegas, 02/10:
// «como Google»). La casilla de cada fila, Shift para un tramo, Ctrl/⌘ para
// sumar uno, Esc para soltar; la barra con Descargar / Mover a… / Papelera;
// el selector de carpetas que mueve con un UPDATE de la persona (la RLS y el
// trigger deciden), y Descargar varios que manda el permiso al NAS por POST.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useDirectorioCorreo", () => ({ useDirectorioCorreo: () => ({ data: [] }), candidatosDelDirectorio: () => [] }));
vi.mock("@/components/oficina/DriveCupos", () => ({ BarraDeUso: () => null, BarraDeUsoAgencia: () => null, CuposDialog: () => null }));
vi.mock("@/pages/oficina/drive/VisorArchivo", () => ({
  default: ({ abierto }: { abierto: string | null }) => <span data-testid="visor">{abierto ?? "cerrado"}</span>,
}));
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
      functions: { invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => respuestas.invoke(fn, body)) },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
    },
  };
});

// La lista de la página sale de acá (la consulta real se prueba en drive.test.tsx).
const vistaFalsa = vi.hoisted(() => ({ lista: [] as unknown[] }));
const abrirArchivo = vi.hoisted(() => vi.fn(async (_id: string, _d: boolean) => {}));
vi.mock("@/hooks/useDrive", async (original) => {
  const real = await original<typeof import("@/hooks/useDrive")>();
  return {
    ...real,
    useDriveVista: (vista: string, carpeta: string | null) => (vista === "mia" && carpeta === null
      ? { data: vistaFalsa.lista, isLoading: false, error: null }
      : { data: vistaFalsa.lista, isLoading: false, error: null }),
    useRutaDrive: () => ({ data: [] }),
    useSubidasDrive: () => ({ subidas: [], subir: vi.fn(), limpiar: vi.fn() }),
    abrirArchivo: (id: string, d: boolean) => abrirArchivo(id, d),
  };
});

import DrivePage from "@/pages/oficina/DrivePage";
import DriveMoverDialog from "@/components/oficina/DriveMoverDialog";
import type { DriveItem } from "@/hooks/useDrive";
import { moverFichas, devolverFichas } from "@/hooks/useDriveVarios";
import {
  agruparPorCarpetaAnterior, alternarTodas, clicDeSeleccion, motivoDelError, SIN_SELECCION,
} from "@/lib/drive/seleccion";

const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "yo", parent_id: null, tipo: "archivo", nombre, mime: null, size: 100, estado: "listo",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", last_opened_at: null, trashed_at: null, ...extra,
});
const carpeta = (id: string, nombre: string, extra: Partial<DriveItem> = {}) => item(id, nombre, { tipo: "carpeta", size: null, ...extra });

const LISTA = [
  carpeta("c1", "Contabilidad"),
  carpeta("c2", "Shootings"),
  item("f1", "a.pdf"),
  item("f2", "b.pdf"),
  item("f3", "c.pdf"),
];

function dibujar(url = "/oficina/drive") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/oficina/drive" element={<DrivePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const casilla = (nombre: string) => screen.getByRole("checkbox", { name: `Seleccionar «${nombre}»` });
const barra = () => screen.queryByRole("toolbar", { name: "Acciones con lo seleccionado" });
const updates = () => consultas.filter((c) => c.ops.some(([op]) => op === "update"));

beforeEach(() => {
  consultas.length = 0;
  toasts.exito.length = 0;
  toasts.error.length = 0;
  abrirArchivo.mockClear();
  vistaFalsa.lista = LISTA;
  respuestas.tabla = () => ({ data: [], error: null });
  respuestas.rpc = () => ({ data: "dueno", error: null });
  respuestas.invoke = () => ({ data: null, error: null });
});

describe("las reglas de la selección (sin dibujar)", () => {
  const orden = ["a", "b", "c", "d", "e"];
  it("un clic prende o apaga, y deja el ancla ahí", () => {
    const uno = clicDeSeleccion(SIN_SELECCION, orden, "b", false);
    expect([...uno.ids]).toEqual(["b"]);
    expect(uno.ancla).toBe("b");
    expect([...clicDeSeleccion(uno, orden, "b", false).ids]).toEqual([]);
  });
  it("Shift suma el tramo desde el ancla, hacia abajo y hacia arriba, sin mover el ancla", () => {
    const desdeB = clicDeSeleccion(SIN_SELECCION, orden, "b", false);
    const hastaD = clicDeSeleccion(desdeB, orden, "d", true);
    expect([...hastaD.ids].sort()).toEqual(["b", "c", "d"]);
    expect(hastaD.ancla).toBe("b");
    const hastaA = clicDeSeleccion(hastaD, orden, "a", true);
    expect([...hastaA.ids].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("Shift sin ancla es un clic común", () => {
    expect([...clicDeSeleccion(SIN_SELECCION, orden, "c", true).ids]).toEqual(["c"]);
  });
  it("la casilla de arriba elige todas, y con todas elegidas, ninguna", () => {
    const todas = alternarTodas(SIN_SELECCION, orden);
    expect(todas.ids.size).toBe(5);
    expect(alternarTodas(todas, orden).ids.size).toBe(0);
  });
  it("los errores de la base se traducen a un motivo (y el timeout del subárbol se reconoce)", () => {
    expect(motivoDelError({ code: "42501", message: "No puedes guardar en esa carpeta" })).toBe("destino_sin_permiso");
    expect(motivoDelError({ code: "23514", message: "Una carpeta no puede quedar dentro de sí misma" })).toBe("dentro_de_si_misma");
    expect(motivoDelError({ code: "23503", message: "La carpeta de destino no existe" })).toBe("destino_no_existe");
    expect(motivoDelError({ code: "57014", message: "canceling statement due to statement timeout" })).toBe("muy_grande");
    expect(motivoDelError({ code: "42501", message: 'new row violates row-level security policy for table "drive_items"' })).toBe("sin_permiso");
    expect(motivoDelError(new Error("otra cosa"))).toBe("otro");
  });
  it("«Deshacer» agrupa por la carpeta donde estaba cada cosa", () => {
    const g = agruparPorCarpetaAnterior([{ id: "a", antes: null }, { id: "b", antes: "x" }, { id: "c", antes: null }]);
    expect(g.get(null)).toEqual(["a", "c"]);
    expect(g.get("x")).toEqual(["b"]);
  });
});

describe("elegir varios en la lista", () => {
  it("la casilla elige; Shift-clic suma el tramo; la barra dice cuántos y reemplaza los títulos", () => {
    dibujar();
    expect(barra()).toBeNull();
    expect(screen.getByText("Propietario")).toBeInTheDocument();
    fireEvent.click(casilla("Shootings"));
    expect(within(barra()!).getByText("1 seleccionado")).toBeInTheDocument();
    expect(screen.queryByText("Propietario")).not.toBeInTheDocument();
    fireEvent.click(casilla("b.pdf"), { shiftKey: true });
    expect(within(barra()!).getByText("3 seleccionados")).toBeInTheDocument();
    for (const n of ["Shootings", "a.pdf", "b.pdf"]) expect(casilla(n)).toHaveAttribute("data-state", "checked");
    expect(casilla("Contabilidad")).toHaveAttribute("data-state", "unchecked");
    // Shift otra vez cuenta desde el MISMO ancla (Shootings), hacia arriba.
    fireEvent.click(casilla("Contabilidad"), { shiftKey: true });
    expect(within(barra()!).getByText("4 seleccionados")).toBeInTheDocument();
  });

  it("Shift o Ctrl/⌘ en el NOMBRE eligen y no abren; un clic común abre", () => {
    dibujar();
    fireEvent.click(screen.getByRole("button", { name: "a.pdf" }), { ctrlKey: true, detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "c.pdf" }), { shiftKey: true, detail: 1 });
    expect(within(barra()!).getByText("3 seleccionados")).toBeInTheDocument();
    expect(screen.getByTestId("visor")).toHaveTextContent("cerrado");
    fireEvent.click(screen.getByRole("button", { name: "b.pdf" }), { metaKey: true, detail: 1 });
    expect(within(barra()!).getByText("2 seleccionados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "b.pdf" }), { detail: 1 });
    expect(screen.getByTestId("visor")).toHaveTextContent("f2");
  });

  it("la casilla de arriba elige todo; Esc suelta; ✕ también", () => {
    dibujar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todo" }));
    expect(within(barra()!).getByText("5 seleccionados")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(barra()).toBeNull();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar la selección" }));
    expect(barra()).toBeNull();
  });

  it("la barra trae Descargar, Mover a… y Papelera; en la papelera, Restaurar y Borrar para siempre", () => {
    const { unmount } = dibujar();
    fireEvent.click(casilla("a.pdf"));
    const b = within(barra()!);
    for (const n of ["Descargar", "Mover a…", "Mover a la papelera"]) expect(b.getByRole("button", { name: n })).toBeInTheDocument();
    expect(b.queryByRole("button", { name: "Restaurar" })).not.toBeInTheDocument();
    unmount();
    vistaFalsa.lista = [item("f1", "a.pdf", { trashed_at: "2026-10-01T00:00:00Z" })];
    dibujar("/oficina/drive?vista=papelera");
    fireEvent.click(casilla("a.pdf"));
    const p = within(barra()!);
    expect(p.getByRole("button", { name: "Restaurar" })).toBeInTheDocument();
    expect(p.getByRole("button", { name: "Borrar para siempre" })).toBeInTheDocument();
    expect(p.queryByRole("button", { name: "Mover a…" })).not.toBeInTheDocument();
    expect(p.queryByRole("button", { name: "Descargar" })).not.toBeInTheDocument();
  });

  it("⚠️ una unidad compartida no se ofrece para mover (como en Google)", async () => {
    vistaFalsa.lista = [carpeta("u1", "KASH Marketing", { owner_id: null }), item("f1", "a.pdf")];
    respuestas.tabla = (t) => ({ data: t === "drive_unidades" ? [{ item_id: "u1" }] : [], error: null });
    dibujar("/oficina/drive?vista=unidades");
    fireEvent.click(casilla("a.pdf"));
    await waitFor(() => expect(within(barra()!).getByRole("button", { name: "Mover a…" })).toBeInTheDocument());
    fireEvent.click(casilla("KASH Marketing"));
    await waitFor(() => expect(within(barra()!).queryByRole("button", { name: "Mover a…" })).not.toBeInTheDocument());
  });

  it("Mover a la papelera manda TODO lo elegido en una sentencia, con la sesión de la persona", async () => {
    respuestas.tabla = (_t, ops) => ({ data: ops.some(([o]) => o === "update") ? [{ id: "f1" }, { id: "f2" }] : [], error: null });
    dibujar();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Mover a la papelera" })); });
    await waitFor(() => expect(toasts.exito).toContain("2 elementos movidos a la papelera"));
    const u = updates();
    expect(u).toHaveLength(1);
    expect(u[0].tabla).toBe("drive_items");
    expect(u[0].ops.find(([o]) => o === "in")?.[1]).toEqual(["id", ["f1", "f2"]]);
  });
});

describe("descargar lo elegido", () => {
  it("un archivo solo baja como siempre (sin .zip)", async () => {
    dibujar();
    fireEvent.click(casilla("a.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    expect(abrirArchivo).toHaveBeenCalledWith("f1", true);
  });

  // Lo de siempre (el panel con avance para lo demás se prueba en
  // driveDescargasVersionesEspacio.test.tsx): un .zip de más de 500 MB en un
  // navegador que no deja escribir directo a disco (Safari/Firefox; jsdom
  // tampoco) lo sigue bajando el navegador, con el permiso por POST.
  it("varios (o una carpeta) muy grandes sin disco: la edge da el permiso y el navegador lo manda al NAS por POST, en un iframe escondido", async () => {
    const enviados: { action: string; target: string; t: string; method: string }[] = [];
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
      enviados.push({ action: this.action, target: this.target, method: this.method, t: (this.elements.namedItem("t") as HTMLInputElement).value });
    });
    respuestas.invoke = (_fn, body) => (body.action === "bajar_varios"
      ? { data: { url: "https://nas.example/zip", t: "permiso-largo", archivos: 7, bytes: 2_000_000_000 }, error: null }
      : { data: null, error: null });
    dibujar();
    fireEvent.click(casilla("Contabilidad"));
    fireEvent.click(casilla("a.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ action: "https://nas.example/zip", method: "post", t: "permiso-largo" });
    const marco = document.querySelector(`iframe[name="${enviados[0].target}"]`);
    expect(marco).not.toBeNull();
    expect(marco).toHaveAttribute("hidden");
    // El permiso NUNCA va en la URL.
    expect(enviados[0].action).not.toContain("permiso-largo");
    // El panel de descargas dice dónde sigue (la barra del navegador).
    expect(await screen.findByText(/sigue en las descargas del navegador/)).toBeInTheDocument();
    expect(abrirArchivo).not.toHaveBeenCalled();
    submit.mockRestore();
  });

  it("si la edge dice que es demasiado, se avisa en el idioma de la persona", async () => {
    respuestas.invoke = () => ({ data: { error: "Son más de 5000…", codigo: "zip_demasiados", tope: 5000 }, error: null });
    dibujar();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    await act(async () => { fireEvent.click(within(barra()!).getByRole("button", { name: "Descargar" })); });
    await waitFor(() => expect(toasts.error[0]).toMatch(/Son más de 5000 archivos y carpetas para un solo \.zip/));
  });
});

describe("Mover a…", () => {
  it("se navega por las carpetas y «Mover aquí» hace el UPDATE de parent_id con la sesión de la persona", async () => {
    vistaFalsa.lista = [carpeta("c1", "Contabilidad"), item("f1", "a.pdf")];
    respuestas.tabla = (t, ops) => {
      if (t === "drive_items" && ops.some(([o]) => o === "update")) return { data: [{ id: "f1" }], error: null };
      // Las subcarpetas de Contabilidad.
      if (t === "drive_items" && ops.some(([o, a]) => o === "eq" && a[0] === "parent_id" && a[1] === "c1")) {
        return { data: [carpeta("c3", "2026", { parent_id: "c1" })], error: null };
      }
      return { data: [], error: null };
    };
    const onMovido = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DriveMoverDialog items={[item("f1", "a.pdf")]} inicio={{ raiz: "mia", ruta: [] }} onCerrar={() => {}} onMovido={onMovido} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Mover «a.pdf»" })).toBeInTheDocument();
    // Ya está en la raíz de Mi unidad: «Mover aquí» no hace nada ahí.
    expect(screen.getByRole("button", { name: "Mover aquí" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Abrir «Contabilidad»" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir «2026»" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir «2026»" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mover aquí" })).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mover aquí" })); });
    await waitFor(() => expect(onMovido).toHaveBeenCalled());
    const u = updates();
    expect(u).toHaveLength(1);
    expect(u[0].tabla).toBe("drive_items");
    expect(u[0].ops).toEqual([
      ["update", [{ parent_id: "c3" }]],
      ["in", ["id", ["f1"]]],
      ["select", ["id"]],
    ]);
    expect(onMovido.mock.calls[0][0]).toMatchObject({ destino: "c3", movidos: [{ id: "f1", antes: null }], fallidos: [] });
    expect(onMovido.mock.calls[0][1]).toBe("2026");
  });

  it("en las unidades compartidas solo se ofrecen las carpetas donde se puede guardar", async () => {
    vistaFalsa.lista = [carpeta("u1", "Marketing", { owner_id: null }), carpeta("u2", "Gerencia", { owner_id: null })];
    respuestas.rpc = (_fn, args) => ({ data: (args as { p_item: string }).p_item === "u1" ? "editor" : "lector", error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DriveMoverDialog items={[item("f1", "a.pdf")]} inicio={{ raiz: "unidades", ruta: [] }} onCerrar={() => {}} onMovido={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir «Marketing»" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Abrir «Gerencia»" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mover aquí" })).toBeDisabled();
  });

  it("la fila ⋮ y la barra abren el selector; arrastrar una fila a una carpeta también mueve", async () => {
    respuestas.tabla = (t, ops) => ({ data: t === "drive_items" && ops.some(([o]) => o === "update") ? [{ id: "f1" }, { id: "f2" }] : [], error: null });
    dibujar();
    fireEvent.click(casilla("a.pdf"));
    fireEvent.click(casilla("b.pdf"));
    fireEvent.click(within(barra()!).getByRole("button", { name: "Mover a…" }));
    expect(screen.getByRole("heading", { name: "Mover 2 elementos" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Arrastrar: lo elegido (a.pdf y b.pdf) sobre la carpeta «Shootings».
    const datos = { types: ["application/x-maven-drive"], setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const fila = (n: string) => screen.getByRole("button", { name: n }).closest("li")!;
    fireEvent.dragStart(fila("a.pdf"), { dataTransfer: datos });
    fireEvent.dragOver(fila("Shootings"), { dataTransfer: datos });
    expect(fila("Shootings")).toHaveClass("ring-2");
    await act(async () => { fireEvent.drop(fila("Shootings"), { dataTransfer: datos }); });
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0].ops).toEqual([["update", [{ parent_id: "c2" }]], ["in", ["id", ["f1", "f2"]]], ["select", ["id"]]]);
    await waitFor(() => expect(toasts.exito).toContain("2 elementos movidos a «Shootings»"));
  });
});

describe("mover: lo que pasa cuando la base dice que no", () => {
  it("⚠️ un UPDATE que la RLS no deja hacer no da error: se cuenta como NO movido", async () => {
    respuestas.tabla = () => ({ data: [{ id: "f1" }], error: null });
    const r = await moverFichas([{ id: "f1", parent_id: null }, { id: "f2", parent_id: null }], "c1");
    expect(r.movidos).toEqual([{ id: "f1", antes: null }]);
    expect(r.fallidos).toEqual([{ id: "f2", motivo: "sin_permiso" }]);
  });

  it("si el problema es el destino, no se prueba de a una (fallaría igual)", async () => {
    respuestas.tabla = () => ({ data: null, error: { code: "42501", message: "No puedes guardar en esa carpeta" } });
    const r = await moverFichas([{ id: "f1", parent_id: null }, { id: "f2", parent_id: null }], "c1");
    expect(updates()).toHaveLength(1);
    expect(r.fallidos.map((f) => f.motivo)).toEqual(["destino_sin_permiso", "destino_sin_permiso"]);
  });

  it("si una sola rompe la sentencia (una carpeta dentro de sí misma), las demás se mueven igual", async () => {
    respuestas.tabla = (_t, ops) => {
      const ids = ops.find(([o]) => o === "in")![1][1] as string[];
      if (ids.includes("c9")) return { data: null, error: { code: "23514", message: "Una carpeta no puede quedar dentro de sí misma" } };
      return { data: ids.map((id) => ({ id })), error: null };
    };
    const r = await moverFichas([{ id: "c9", parent_id: null }, { id: "f2", parent_id: null }], "c1");
    expect(r.movidos).toEqual([{ id: "f2", antes: null }]);
    expect(r.fallidos).toEqual([{ id: "c9", motivo: "dentro_de_si_misma" }]);
  });

  it("⚠️ el timeout de un subárbol enorme (mover entre unidades) se dice claro", async () => {
    respuestas.tabla = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const r = await moverFichas([{ id: "c1", parent_id: null }], "u1");
    expect(r.fallidos).toEqual([{ id: "c1", motivo: "muy_grande" }]);
  });

  it("«Deshacer» devuelve cada cosa a su carpeta anterior", async () => {
    respuestas.tabla = (_t, ops) => ({ data: (ops.find(([o]) => o === "in")![1][1] as string[]).map((id) => ({ id })), error: null });
    await devolverFichas({ destino: "c1", movidos: [{ id: "f1", antes: null }, { id: "f2", antes: "x" }, { id: "f3", antes: null }], fallidos: [] });
    const u = updates();
    expect(u.map((c) => [c.ops[0][1][0], c.ops[1][1][1]])).toEqual([
      [{ parent_id: null }, ["f1", "f3"]],
      [{ parent_id: "x" }, ["f2"]],
    ]);
  });
});
