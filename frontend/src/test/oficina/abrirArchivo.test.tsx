import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";

// «ABRIR UN ARCHIVO» EN LA OFICINA (Jhon, 02/10): «María tiene un Excel que
// descargó y lo quiere abrir en Maven; no veo la opción». Como Archivo › Abrir
// (⌘O) de Google: Recientes / Mi unidad / Unidades compartidas / Compartido
// conmigo / Subir, filtrado por el tipo de la sección. Abrir = la copia
// editable (`desde_drive`), el mismo camino que el visor del Drive.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const invocaciones: { fn: string; body: Record<string, unknown> }[] = [];
const respuesta = vi.hoisted(() => ({ desdeDrive: null as null | { error: string } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => {
        invocaciones.push({ fn, body });
        if (fn === "oficina-doc" && body.action === "desde_drive") {
          if (respuesta.desdeDrive) return { data: respuesta.desdeDrive, error: null };
          return { data: { id: `doc-de-${body.id}`, extension: "xlsx" }, error: null };
        }
        return { data: { error: "no esperado" }, error: null };
      }),
    },
    from: () => ({ select: () => ({}) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));

const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "u1", parent_id: null, tipo: "archivo", nombre, mime: null, size: 2048, estado: "listo",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", last_opened_at: null, trashed_at: null,
  ...extra,
});

// Lo que «ve» cada vista del Drive (las consultas reales se prueban en
// drive.test.tsx): aquí importa qué hace el diálogo con eso.
const VISTAS: Record<string, DriveItem[]> = {
  recientes: [item("x1", "Balance.xlsx"), item("d1", "Contrato.docx"), item("i1", "foto.jpg"), item("p1", "Charla.pptx")],
  mia: [
    item("c1", "Contabilidad", { tipo: "carpeta", size: null }),
    item("x2", "Ventas.csv"),
    item("x3", "Enorme.xlsx", { size: 60 * 1024 * 1024 }),
    item("x4", "A medias.xlsx", { estado: "subiendo" }),
    item("f1", "notas.pdf"),
  ],
  unidades: [item("u1", "Unidad Ventas", { tipo: "carpeta", size: null })],
  compartido: [item("x6", "Presupuesto Señal.xlsx")],
};
const CARPETAS: Record<string, DriveItem[]> = {
  c1: [item("x5", "Cierre 2026.xlsx", { parent_id: "c1" }), item("d2", "Acta.docx", { parent_id: "c1" })],
};
const vistasPedidas: string[] = [];
const uso = vi.hoisted(() => ({ actual: { usado: 0, cupo: 50 * 1024 ** 3 } }));
const subirUno = vi.fn(async (f: File, _parent: string | null, onProgreso: (n: number) => void) => {
  onProgreso(f.size);
  return `drv-${f.name}`;
});
vi.mock("@/hooks/useDrive", async (original) => ({
  ...(await original<typeof import("@/hooks/useDrive")>()),
  useDriveVista: (vista: string, carpeta: string | null) => {
    vistasPedidas.push(`${vista}:${carpeta ?? ""}`);
    return { data: carpeta ? CARPETAS[carpeta] ?? [] : VISTAS[vista] ?? [], isLoading: false, error: null, refetch: vi.fn() };
  },
  useRutaDrive: (carpeta: string | null) => ({
    data: carpeta === "c1" ? [{ id: "c1", nombre: "Contabilidad", owner_id: "u1" }] : [],
  }),
  useUsoDrive: () => ({ data: uso.actual }),
  useSubirUnArchivo: () => subirUno,
}));

import DialogoAbrirArchivo from "@/components/oficina/DialogoAbrirArchivo";
import type { DriveItem } from "@/hooks/useDrive";
import {
  aceptaElSelector, esAtajoDeAbrir, extensionesDe, paraAbrir, problemaParaSubir, TOPE_COPIA,
} from "@/lib/drive/abrirEnLaOficina";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";
import * as edge from "../../../../supabase/functions/oficina-doc/drive";

// ── Las reglas ───────────────────────────────────────────────────────────────

describe("qué archivos ofrece cada sección", () => {
  const nombres = (destino: "docx" | "xlsx" | "pptx", todos = false, q = "") =>
    paraAbrir([...VISTAS.recientes, ...VISTAS.mia, ...CARPETAS.c1, ...VISTAS.compartido], { destino, todos, q })
      .map((i) => i.nombre);

  it("Hojas de cálculo: las carpetas (para entrar) y solo hojas; nada a medio subir", () => {
    expect(nombres("xlsx")).toEqual([
      "Balance.xlsx", "Contabilidad", "Ventas.csv", "Enorme.xlsx", "Cierre 2026.xlsx", "Presupuesto Señal.xlsx",
    ]);
  });

  it("Documentos y Presentaciones, cada uno lo suyo", () => {
    expect(nombres("docx")).toEqual(["Contrato.docx", "Contabilidad", "Acta.docx"]);
    expect(nombres("pptx")).toEqual(["Charla.pptx", "Contabilidad"]);
  });

  it("«Todos los de Oficina» suma las otras secciones, pero nunca un PDF o una foto", () => {
    const todos = nombres("xlsx", true);
    expect(todos).toEqual(expect.arrayContaining(["Contrato.docx", "Charla.pptx", "Acta.docx", "Balance.xlsx"]));
    expect(todos).not.toContain("notas.pdf");
    expect(todos).not.toContain("foto.jpg");
    expect(todos).not.toContain("A medias.xlsx");
  });

  it("la búsqueda es por nombre, sin mayúsculas ni tildes", () => {
    expect(nombres("xlsx", false, "senal")).toEqual(["Presupuesto Señal.xlsx"]);
    expect(nombres("xlsx", false, "CONTAB")).toEqual(["Contabilidad"]);
    expect(nombres("xlsx", false, "acta")).toEqual([]);
  });

  it("las extensiones de cada sección, con la suya primero", () => {
    const docs = extensionesDe("docx");
    expect(docs[0]).toBe("docx");
    expect(docs).toEqual(expect.arrayContaining(["doc", "odt", "rtf"]));
    expect(docs).not.toContain("xlsx");
    const hojas = extensionesDe("xlsx");
    expect(hojas[0]).toBe("xlsx");
    expect(hojas).toEqual(expect.arrayContaining(["xls", "ods", "csv"]));
    const presentaciones = extensionesDe("pptx");
    expect(presentaciones[0]).toBe("pptx");
    expect(presentaciones).toEqual(expect.arrayContaining(["ppt", "odp"]));
    // El selector de la computadora acepta todo lo de Oficina: un Word subido
    // desde Hojas de cálculo se abre igual, en Documentos.
    expect(aceptaElSelector().split(",")).toEqual(expect.arrayContaining([".xlsx", ".docx", ".pptx", ".csv"]));
  });

  it("⚠️ el tope es EL DE LA EDGE (si fuera más grande, se sube entero para terminar en error)", () => {
    expect(TOPE_COPIA).toBe(edge.TOPE_COPIA);
  });

  it("lo que se sabe antes de subir", () => {
    const f = (name: string, size = 10, type = "") => ({ name, size, type });
    expect(problemaParaSubir(f("Balance.xlsx"))).toBeNull();
    expect(problemaParaSubir(f("datos", 10, "text/csv"))).toBeNull();
    expect(problemaParaSubir(f("cv.pdf", 10, "application/pdf"))).toBe("formato");
    expect(problemaParaSubir(f("vacio.xlsx", 0))).toBe("vacio");
    expect(problemaParaSubir(f("enorme.xlsx", TOPE_COPIA + 1))).toBe("grande");
    expect(problemaParaSubir(f("justo.xlsx", TOPE_COPIA))).toBeNull();
    expect(problemaParaSubir(f("Balance.xlsx", 100), { usado: 950, cupo: 1000 })).toBe("espacio");
    // Sin cupo conocido no se adivina: lo revisa la edge.
    expect(problemaParaSubir(f("Balance.xlsx", 100), { usado: 0, cupo: 0 })).toBeNull();
  });

  it("⌘O y Ctrl+O; con Shift o Alt es de otro", () => {
    const k = (extra: Partial<KeyboardEvent>) =>
      ({ key: "o", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra }) as KeyboardEvent;
    expect(esAtajoDeAbrir(k({ metaKey: true }))).toBe(true);
    expect(esAtajoDeAbrir(k({ ctrlKey: true }))).toBe(true);
    expect(esAtajoDeAbrir(k({ ctrlKey: true, key: "O" }))).toBe(true);
    expect(esAtajoDeAbrir(k({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(esAtajoDeAbrir(k({ metaKey: true, altKey: true }))).toBe(false);
    expect(esAtajoDeAbrir(k({}))).toBe(false);
  });

  it("los textos nuevos tienen su inglés", () => {
    const claves = Object.keys(translations).filter((c) => c.startsWith("oficina.abrir."));
    expect(claves.length).toBeGreaterThan(20);
    const sinIngles = claves.filter((c) => {
      const en = (translations as unknown as Record<string, { en: string }>)[c].en;
      return !en || esEspanol(en);
    });
    expect(sinIngles).toEqual([]);
  });
});

// ── El diálogo dibujado ──────────────────────────────────────────────────────

function Prueba({ inicial }: { inicial: boolean }) {
  const [abierto, setAbierto] = useState(inicial);
  return (
    <>
      <p data-testid="estado">{abierto ? "abierto" : "cerrado"}</p>
      <DialogoAbrirArchivo abierto={abierto} onCambiar={setAbierto} formato="xlsx" />
    </>
  );
}

function dibujar(inicial = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/oficina/hojas"]}>
        <Routes>
          <Route path="/oficina/hojas" element={<Prueba inicial={inicial} />} />
          <Route path="/oficina/:id" element={<DocumentoFalso />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function DocumentoFalso() {
  return <p>Documento abierto</p>;
}

const fila = (nombre: string) => screen.getByRole("button", { name: new RegExp(nombre) });
const pestana = (nombre: string) => screen.getByRole("button", { name: nombre });
const botonAbrir = () => screen.getByRole("button", { name: "Abrir" });

beforeEach(() => {
  invocaciones.length = 0;
  vistasPedidas.length = 0;
  subirUno.mockClear();
  respuesta.desdeDrive = null;
  uso.actual = { usado: 0, cupo: 50 * 1024 ** 3 };
});

describe("el diálogo «Abrir un archivo»", () => {
  it("arranca en Recientes y muestra solo hojas de cálculo; el filtro suma lo demás de Oficina", () => {
    dibujar();
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Abrir un archivo")).toBeInTheDocument();
    expect(vistasPedidas).toContain("recientes:");
    expect(fila("Balance.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("Contrato.docx")).not.toBeInTheDocument();
    expect(screen.queryByText("foto.jpg")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos los de Oficina" }));
    expect(fila("Contrato.docx")).toBeInTheDocument();
    expect(fila("Charla.pptx")).toBeInTheDocument();
    expect(screen.queryByText("foto.jpg")).not.toBeInTheDocument();
  });

  it("las pestañas cambian de vista, y las carpetas se recorren con sus migas", () => {
    dibujar();
    fireEvent.click(pestana("Mi unidad"));
    expect(vistasPedidas).toContain("mia:");
    expect(fila("Ventas.csv")).toBeInTheDocument();
    expect(screen.queryByText("notas.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("A medias.xlsx")).not.toBeInTheDocument();

    fireEvent.click(fila("Contabilidad"), { detail: 1 });
    expect(vistasPedidas).toContain("mia:c1");
    expect(fila("Cierre 2026.xlsx")).toBeInTheDocument();
    const migas = screen.getByRole("navigation", { name: "Ubicación" });
    expect(within(migas).getByText("Contabilidad")).toBeInTheDocument();
    fireEvent.click(within(migas).getByRole("button", { name: "Mi unidad" }));
    expect(fila("Ventas.csv")).toBeInTheDocument();

    fireEvent.click(pestana("Unidades compartidas"));
    expect(fila("Unidad Ventas")).toBeInTheDocument();
    fireEvent.click(pestana("Compartido conmigo"));
    expect(fila("Presupuesto Señal.xlsx")).toBeInTheDocument();
  });

  it("la búsqueda filtra lo que se ve", () => {
    dibujar();
    fireEvent.click(pestana("Mi unidad"));
    fireEvent.change(screen.getByRole("textbox", { name: /Buscar por nombre/ }), { target: { value: "ventas" } });
    expect(fila("Ventas.csv")).toBeInTheDocument();
    expect(screen.queryByText("Contabilidad")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Buscar por nombre/ }), { target: { value: "zzz" } });
    expect(screen.getByText("Nada con «zzz» en esta vista")).toBeInTheDocument();
  });

  it("elegir un archivo y «Abrir» crea la copia editable (desde_drive) y va al documento nuevo", async () => {
    dibujar();
    expect(botonAbrir()).toBeDisabled();
    fireEvent.click(fila("Balance.xlsx"), { detail: 1 });
    expect(fila("Balance.xlsx")).toHaveAttribute("aria-pressed", "true");
    expect(invocaciones).toEqual([]);
    await act(async () => { fireEvent.click(botonAbrir()); });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(invocaciones).toEqual([{ fn: "oficina-doc", body: { action: "desde_drive", id: "x1" } }]);
  });

  it("doble clic abre directo", async () => {
    dibujar();
    fireEvent.click(pestana("Compartido conmigo"));
    const f = fila("Presupuesto Señal.xlsx");
    // Cada evento por separado, como en el navegador (React aplica el clic
    // antes de que llegue el siguiente).
    fireEvent.click(f, { detail: 1 });
    fireEvent.click(f, { detail: 2 });
    await act(async () => { fireEvent.doubleClick(f, { detail: 2 }); });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(invocaciones).toEqual([{ fn: "oficina-doc", body: { action: "desde_drive", id: "x6" } }]);
  });

  it("⚠️ el doble clic sobre una carpeta NO abre lo que queda debajo en la carpeta nueva", () => {
    dibujar();
    fireEvent.click(pestana("Mi unidad"));
    fireEvent.click(fila("Contabilidad"), { detail: 1 });
    // El 2.º clic y el dblclick caen en la primera fila de la carpeta nueva.
    const debajo = fila("Cierre 2026.xlsx");
    fireEvent.click(debajo, { detail: 2 });
    fireEvent.doubleClick(debajo, { detail: 2 });
    expect(debajo).toHaveAttribute("aria-pressed", "false");
    expect(invocaciones).toEqual([]);
  });

  it("lo que pasa del tope de la copia se ve pero no se puede elegir", () => {
    dibujar();
    fireEvent.click(pestana("Mi unidad"));
    expect(fila("Enorme.xlsx")).toBeDisabled();
    expect(screen.getByText(/Más de 50 MB/)).toBeInTheDocument();
  });

  it("si la copia falla, se dice por qué y el diálogo sigue abierto", async () => {
    respuesta.desdeDrive = { error: "El servidor de Oficina no pudo convertir el archivo (502)" };
    dibujar();
    fireEvent.click(fila("Balance.xlsx"), { detail: 1 });
    await act(async () => { fireEvent.click(botonAbrir()); });
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo abrir «Balance.xlsx»: El servidor de Oficina no pudo convertir el archivo (502)");
    expect(screen.getByTestId("estado")).toHaveTextContent("abierto");
  });

  it("⌘O / Ctrl+O lo abre", () => {
    dibujar(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const e = new KeyboardEvent("keydown", { key: "o", metaKey: true, bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true })); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Subir desde la computadora", () => {
  const archivo = (nombre: string, tipo = "", size?: number) => {
    const f = new File([new Uint8Array(1234)], nombre, { type: tipo });
    if (size !== undefined) Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const elegir = async (f: File) => {
    await act(async () => {
      fireEvent.change(screen.getByTestId("selector-de-archivo"), { target: { files: [f] } });
    });
  };

  it("sube a «Mi unidad», espera que quede listo y abre la copia", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    expect(screen.getByText("Arrastra un archivo aquí")).toBeInTheDocument();
    expect(screen.getByText(/Formatos: \.xlsx, /)).toBeInTheDocument();
    const f = archivo("Reporte María.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await elegir(f);
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(subirUno).toHaveBeenCalledTimes(1);
    expect(subirUno.mock.calls[0][0]).toBe(f);
    expect(subirUno.mock.calls[0][1]).toBeNull(); // la raíz de «Mi unidad»
    expect(invocaciones).toEqual([{ fn: "oficina-doc", body: { action: "desde_drive", id: "drv-Reporte María.xlsx" } }]);
  });

  it("también soltándolo encima", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    const f = archivo("Ventas.csv", "text/csv");
    await act(async () => {
      fireEvent.drop(screen.getByTestId("zona-de-subida"), { dataTransfer: { files: [f] } });
    });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(subirUno.mock.calls[0][0]).toBe(f);
  });

  it("un formato que la Oficina no abre: se dice ANTES de subir", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    await elegir(archivo("cv.pdf", "application/pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent("«cv.pdf» no se puede abrir en la Oficina. Sirven: .xlsx");
    expect(subirUno).not.toHaveBeenCalled();
  });

  it("demasiado grande: tampoco se sube", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    await elegir(archivo("enorme.xlsx", "", TOPE_COPIA + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("lo máximo para abrirlo en la Oficina es 50 MB");
    expect(subirUno).not.toHaveBeenCalled();
  });

  it("sin espacio en el Drive: tampoco", async () => {
    uso.actual = { usado: 1000, cupo: 1500 };
    dibujar();
    fireEvent.click(pestana("Subir"));
    await elegir(archivo("Balance.xlsx"));
    expect(screen.getByRole("alert")).toHaveTextContent("No te alcanza el espacio del Drive");
    expect(subirUno).not.toHaveBeenCalled();
  });

  it("de a un archivo", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    await act(async () => {
      fireEvent.drop(screen.getByTestId("zona-de-subida"), { dataTransfer: { files: [archivo("a.xlsx"), archivo("b.xlsx")] } });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Elige un solo archivo");
    expect(subirUno).not.toHaveBeenCalled();
  });

  it("si la subida falla se dice, y si falla la copia se aclara que el archivo quedó en el Drive", async () => {
    dibujar();
    fireEvent.click(pestana("Subir"));
    subirUno.mockRejectedValueOnce(new Error("No se pudo llegar al NAS"));
    await elegir(archivo("Balance.xlsx"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo subir «Balance.xlsx»: No se pudo llegar al NAS");

    respuesta.desdeDrive = { error: "El archivo tiene contraseña" };
    await elegir(archivo("Clave.xlsx"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "«Clave.xlsx» quedó en tu «Mi unidad», pero no se pudo abrir: El archivo tiene contraseña",
    ));
    expect(screen.getByTestId("estado")).toHaveTextContent("abierto");
  });
});
