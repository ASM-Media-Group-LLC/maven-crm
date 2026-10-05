import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// CAMBIAR EL NOMBRE EN LA OFICINA (Jhon, 03/10: no había forma de sacarle el
// «Sin título» a un documento). Como Google Docs:
//   · en la lista, el menú ⋮ de cada fila trae «Cambiar nombre» (un diálogo con
//     el nombre elegido: Enter guarda, Esc cancela), junto con abrir, abrir en
//     otra pestaña, compartir y la papelera;
//   · en el documento abierto, clic en el nombre de arriba: se escribe, Enter
//     (o salir del cuadro) guarda, Esc deja el de antes; vacío, también;
//   · un archivo del Drive abierto en la Oficina cambia el nombre de SU ficha
//     del Drive y conserva la extensión, sin remontar el editor.
// Quién puede: lo mismo que la RLS de `documents` (dueño, equipo, o compartido
// con permiso de editar) y de drive_items (dueño o editor).

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/components/oficina/DialogoAbrirArchivo", () => ({ default: () => null }));
vi.mock("@/components/oficina/DialogoDeCompartir", () => ({
  default: ({ abierto, titulo }: { abierto: boolean; titulo: string }) => (abierto ? <div role="dialog" aria-label={`Compartir ${titulo}`} /> : null),
}));
vi.mock("@/hooks/useHistorialDeOficina", () => ({ useHistorialDeOficina: () => undefined }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
type Accion = { label: string; onClick: () => void };
const toasts = vi.hoisted(() => ({ exito: [] as string[], error: [] as string[], acciones: [] as (Accion | undefined)[] }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn((m: string, o?: { action?: Accion }) => { toasts.exito.push(m); toasts.acciones.push(o?.action); return 1; }),
    error: vi.fn((m: string) => { toasts.error.push(m); return 2; }),
    loading: vi.fn(() => 3),
  }),
}));

// El editor de ONLYOFFICE no se monta en jsdom: se anota con qué apertura se
// llamó, para saber si cambiar el nombre lo hubiera remontado.
const editor = vi.hoisted(() => ({ aperturas: [] as unknown[], modo: "edit" as "edit" | "view" }));
vi.mock("@/hooks/useOnlyOffice", async (original) => ({
  ...(await original<typeof import("@/hooks/useOnlyOffice")>()),
  useEditorDeOffice: (_c: string, apertura: unknown) => {
    if (apertura) editor.aperturas.push(apertura);
    return { estado: apertura ? "listo" : "cargando", error: null };
  },
  useAbrirEnOnlyOffice: () => ({
    mutate: vi.fn(), error: null,
    data: { servidor: "https://oficina", config: { editorConfig: { mode: editor.modo } } },
  }),
  useCrearDocumentoOffice: () => ({ mutate: vi.fn(), isPending: false }),
}));

// ── Un Supabase falso que anota cada consulta ────────────────────────────────
type Op = [string, unknown[]];
const consultas = vi.hoisted(() => [] as { tabla: string; ops: Op[] }[]);
const respuestas = vi.hoisted(() => ({
  tabla: (_t: string, _ops: Op[]): { data: unknown; error: unknown } => ({ data: [], error: null }),
  rpc: (_fn: string): { data: unknown; error: unknown } => ({ data: "editor", error: null }),
  invoke: (_fn: string, _b: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: null, error: null }),
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
      rpc: vi.fn(async (fn: string) => respuestas.rpc(fn)),
      functions: { invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => respuestas.invoke(fn, body)) },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
    },
  };
});

import OficinaPage from "@/pages/oficina/OficinaPage";
import DocumentoPage from "@/pages/oficina/DocumentoPage";
import ArchivoDelDrivePage from "@/pages/oficina/ArchivoDelDrivePage";

const doc = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, folder: null, visibility: "privado", owner_id: "yo", created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-29T15:00:00Z", updated_by: null, deleted_at: null, storage_key: "k", extension: "docx",
  size_bytes: 10, version: 3, ...extra,
});
const DOCS = [
  doc("d1", "Acta"),
  doc("d2", "Guion del equipo", { owner_id: "otra", visibility: "equipo" }),
  doc("d3", "Privado de otra", { owner_id: "otra" }),
  doc("d4", "Compartido para editar", { owner_id: "otra" }),
];
const update = (tabla: string) => consultas.filter((c) => c.tabla === tabla && c.ops.some(([o]) => o === "update"));
const valorDelUpdate = (c: { ops: Op[] }) => c.ops.find(([o]) => o === "update")![1][0] as Record<string, unknown>;

/** Contesta como la base. `filasDelUpdate` = lo que devuelve un UPDATE
 *  (vacío = la RLS no lo dejó). */
function base(filasDelUpdate: unknown[] = [{ id: "x" }]) {
  return (t: string, ops: Op[]) => {
    if (ops.some(([o]) => o === "update")) return { data: filasDelUpdate, error: null };
    if (t === "documents" && ops.some(([o]) => o === "single")) return { data: doc("d1", "Acta"), error: null };
    if (t === "documents") return { data: DOCS, error: null };
    if (t === "document_shares") return { data: [{ document_id: "d4" }], error: null };
    return { data: [], error: null };
  };
}

function dibujar(ruta: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/oficina" element={<OficinaPage />} />
          <Route path="/oficina/:id" element={<DocumentoPage />} />
          <Route path="/oficina/drive/:id" element={<ArchivoDelDrivePage />} />
          <Route path="/oficina/drive" element={<p>El Drive</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function abrirMenu(titulo: string) {
  fireEvent.keyDown(await screen.findByRole("button", { name: `Opciones de «${titulo}»` }), { key: "Enter" });
  return within(await screen.findByRole("menu"));
}

beforeEach(() => {
  consultas.length = 0;
  toasts.exito.length = 0;
  toasts.error.length = 0;
  toasts.acciones.length = 0;
  editor.aperturas.length = 0;
  editor.modo = "edit";
  respuestas.tabla = base();
  respuestas.rpc = () => ({ data: "editor", error: null });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("la lista: el menú ⋮ de cada documento", () => {
  it("trae abrir, abrir en otra pestaña, cambiar nombre, compartir y la papelera (lo mío)", async () => {
    dibujar("/oficina");
    const menu = await abrirMenu("Acta");
    for (const n of ["Abrir", "Abrir en una pestaña nueva", "Cambiar nombre", "Compartir", "Mover a la papelera"]) {
      expect(menu.getByRole("menuitem", { name: n })).toBeInTheDocument();
    }
  });

  it("«Cambiar nombre» solo a quien puede escribirlo; la papelera, solo el dueño", async () => {
    dibujar("/oficina");
    let menu = await abrirMenu("Guion del equipo"); // del equipo: cualquiera lo edita
    expect(menu.getByRole("menuitem", { name: "Cambiar nombre" })).toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: "Mover a la papelera" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    menu = await abrirMenu("Privado de otra"); // privado, compartido solo para ver
    expect(menu.queryByRole("menuitem", { name: "Cambiar nombre" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    menu = await abrirMenu("Compartido para editar"); // compartido con permiso de editar
    await waitFor(() => expect(menu.getByRole("menuitem", { name: "Cambiar nombre" })).toBeInTheDocument());
  });

  it("el diálogo arranca con el nombre elegido; Enter guarda con la sesión de la persona", async () => {
    dibujar("/oficina");
    fireEvent.click((await abrirMenu("Acta")).getByRole("menuitem", { name: "Cambiar nombre" }));
    const campo = await screen.findByRole("textbox", { name: "Nombre" }) as HTMLInputElement;
    expect(campo.value).toBe("Acta");
    await waitFor(() => expect([campo.selectionStart, campo.selectionEnd]).toEqual([0, 4]));
    fireEvent.change(campo, { target: { value: "Acta de la reunión" } });
    fireEvent.submit(campo.closest("form")!);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nombre" })).not.toBeInTheDocument());
    const u = update("documents");
    expect(u).toHaveLength(1);
    expect(valorDelUpdate(u[0])).toMatchObject({ title: "Acta de la reunión" });
    expect(u[0].ops).toContainEqual(["eq", ["id", "d1"]]);
    // Pide la fila de vuelta: sin permiso la RLS no da error, toca cero filas.
    expect(u[0].ops).toContainEqual(["select", ["id"]]);
  });

  it("Esc cancela sin guardar", async () => {
    dibujar("/oficina");
    fireEvent.click((await abrirMenu("Acta")).getByRole("menuitem", { name: "Cambiar nombre" }));
    const campo = await screen.findByRole("textbox", { name: "Nombre" });
    fireEvent.change(campo, { target: { value: "Otra cosa" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nombre" })).not.toBeInTheDocument());
    expect(update("documents")).toHaveLength(0);
  });

  it("si la base no lo deja (cero filas), lo dice y el diálogo sigue abierto", async () => {
    respuestas.tabla = base([]);
    dibujar("/oficina");
    fireEvent.click((await abrirMenu("Acta")).getByRole("menuitem", { name: "Cambiar nombre" }));
    const campo = await screen.findByRole("textbox", { name: "Nombre" });
    fireEvent.change(campo, { target: { value: "Nuevo" } });
    fireEvent.submit(campo.closest("form")!);
    await waitFor(() => expect(toasts.error).toContain("No tienes permiso para cambiarle el nombre"));
    expect(screen.getByRole("textbox", { name: "Nombre" })).toBeInTheDocument();
  });

  it("«Compartir» abre el diálogo de ese documento; la papelera avisa con «Deshacer»", async () => {
    dibujar("/oficina");
    fireEvent.click((await abrirMenu("Acta")).getByRole("menuitem", { name: "Compartir" }));
    expect(await screen.findByRole("dialog", { name: "Compartir Acta" })).toBeInTheDocument();
    fireEvent.click((await abrirMenu("Acta")).getByRole("menuitem", { name: "Mover a la papelera" }));
    await waitFor(() => expect(toasts.exito).toContain("Documento en la papelera"));
    expect(toasts.acciones[toasts.exito.indexOf("Documento en la papelera")]?.label).toBe("Deshacer");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("el documento abierto: clic en el nombre, como Google Docs", () => {
  it("se escribe y Enter guarda; el nombre nuevo queda arriba", async () => {
    dibujar("/oficina/d1");
    fireEvent.click(await screen.findByRole("button", { name: "Acta" }));
    const campo = screen.getByRole("textbox", { name: "Cambiar nombre" }) as HTMLInputElement;
    expect(campo.value).toBe("Acta");
    fireEvent.change(campo, { target: { value: "Acta final" } });
    fireEvent.submit(campo.closest("form")!);
    expect(await screen.findByRole("button", { name: "Acta final" })).toBeInTheDocument();
    const u = update("documents");
    expect(u).toHaveLength(1);
    expect(valorDelUpdate(u[0])).toMatchObject({ title: "Acta final" });
  });

  it("salir del cuadro también guarda; Esc deja el de antes; vacío, también", async () => {
    dibujar("/oficina/d1");
    fireEvent.click(await screen.findByRole("button", { name: "Acta" }));
    let campo = screen.getByRole("textbox", { name: "Cambiar nombre" });
    fireEvent.change(campo, { target: { value: "No va" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Acta" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Acta" }));
    campo = screen.getByRole("textbox", { name: "Cambiar nombre" });
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.blur(campo);
    expect(await screen.findByRole("button", { name: "Acta" })).toBeInTheDocument();
    expect(update("documents")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Acta" }));
    campo = screen.getByRole("textbox", { name: "Cambiar nombre" });
    fireEvent.change(campo, { target: { value: "Acta del lunes" } });
    fireEvent.blur(campo);
    expect(await screen.findByRole("button", { name: "Acta del lunes" })).toBeInTheDocument();
    expect(update("documents")).toHaveLength(1);
  });

  it("si la base no lo deja, vuelve el nombre de antes y lo dice", async () => {
    respuestas.tabla = base([]);
    dibujar("/oficina/d1");
    fireEvent.click(await screen.findByRole("button", { name: "Acta" }));
    const campo = screen.getByRole("textbox", { name: "Cambiar nombre" });
    fireEvent.change(campo, { target: { value: "Prohibido" } });
    fireEvent.submit(campo.closest("form")!);
    await waitFor(() => expect(toasts.error).toContain("No tienes permiso para cambiarle el nombre"));
    expect(await screen.findByRole("button", { name: "Acta" })).toBeInTheDocument();
  });

  it("quien solo puede ver (el editor se abrió en modo «view») no tiene dónde hacer clic", async () => {
    editor.modo = "view";
    dibujar("/oficina/d1");
    expect(await screen.findByText("Acta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acta" })).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("un archivo del Drive abierto en la Oficina", () => {
  const apertura = (modo: "editar" | "ver") => ({
    servidor: "https://oficina", config: { document: { key: "k" } }, modo, motivo: modo === "ver" ? "permiso" : null,
    archivo: { id: "e1", nombre: "Balance.xlsx", mime: null, size: 2048, updated_at: "2026-10-01T00:00:00Z" },
  });

  it("cambia el nombre de su ficha del Drive, conserva la extensión y no remonta el editor", async () => {
    respuestas.invoke = (fn, b) => (fn === "oficina-doc" && b.action === "editar_drive" ? { data: apertura("editar"), error: null } : { data: null, error: null });
    dibujar("/oficina/drive/e1");
    fireEvent.click(await screen.findByRole("button", { name: "Balance.xlsx" }));
    const campo = screen.getByRole("textbox", { name: "Cambiar nombre" }) as HTMLInputElement;
    // Como Google: se edita sin la extensión.
    expect(campo.value).toBe("Balance");
    fireEvent.change(campo, { target: { value: "Balance 2026" } });
    await act(async () => { fireEvent.submit(campo.closest("form")!); });
    expect(await screen.findByRole("button", { name: "Balance 2026.xlsx" })).toBeInTheDocument();
    const u = update("drive_items");
    expect(u).toHaveLength(1);
    expect(valorDelUpdate(u[0])).toEqual({ nombre: "Balance 2026.xlsx" });
    expect(u[0].ops).toContainEqual(["eq", ["id", "e1"]]);
    // Siempre la MISMA apertura: un objeto nuevo remontaría ONLYOFFICE.
    expect(new Set(editor.aperturas).size).toBe(1);
  });

  it("quien solo es lector no lo puede cambiar", async () => {
    respuestas.rpc = () => ({ data: "lector", error: null });
    respuestas.invoke = (fn, b) => (fn === "oficina-doc" && b.action === "editar_drive" ? { data: apertura("ver"), error: null } : { data: null, error: null });
    dibujar("/oficina/drive/e1");
    expect(await screen.findByText("Balance.xlsx")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Balance.xlsx" })).not.toBeInTheDocument();
  });
});

// Jhon, 03/10: «el nombre del documento siempre sale en dos renglones», hasta
// «Sin título». El botón corre su borde 6 px a cada lado (-mx-1.5) para que el
// texto quede alineado con «Versión N»; el título mide el texto MENOS esos 12 px
// y `max-w-full` dejaba el botón 12 px más angosto que su texto. El tope tiene
// que sumar los márgenes. jsdom no mide, así que se cuida la clase.
describe("el nombre de arriba entra en un renglón", () => {
  it("el botón y el cuadro de texto topan en 100 % + los 12 px de sus márgenes negativos", async () => {
    const { default: NombreEditable } = await import("@/components/oficina/NombreEditable");
    render(<NombreEditable valor="Sin título" editable etiqueta="Cambiar nombre" onGuardar={async () => {}} />);
    const boton = screen.getByRole("button", { name: "Sin título" });
    expect(boton.className).toContain("-mx-1.5");
    expect(boton.className).toContain("max-w-[calc(100%+0.75rem)]");
    expect(boton.className).not.toMatch(/(^|\s)max-w-full(\s|$)/);
    fireEvent.click(boton);
    const campo = screen.getByRole("textbox", { name: "Cambiar nombre" });
    expect(campo.className).toContain("max-w-[calc(100%+0.75rem)]");
    expect(campo.className).not.toMatch(/(^|\s)max-w-full(\s|$)/);
  });
});
