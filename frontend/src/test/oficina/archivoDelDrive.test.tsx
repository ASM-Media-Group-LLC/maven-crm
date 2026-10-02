import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// UN ARCHIVO DEL DRIVE ABIERTO EN LA OFICINA (Jhon, 02/10: «que sea
// exactamente como Google»): el mismo .xlsx en modo edición, lo guardado vuelve
// al Drive, y la copia en la Oficina queda como opción aparte. Si no se puede
// editar, se abre para ver y se dice por qué.

// Diálogos enteros (Radix) con toda la suite corriendo en paralelo: los 5 s por
// prueba (y el segundo de findBy) a veces no alcanzan sin que haya nada roto.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const invocaciones: { fn: string; body: Record<string, unknown> }[] = [];
const archivo = (id: string, nombre: string) => ({ id, nombre, mime: null, size: 2048, updated_at: "2026-10-01T00:00:00Z" });
const RESPUESTAS: Record<string, unknown> = {
  e1: { servidor: "https://oficina", config: { document: { key: "k-e1" } }, modo: "editar", motivo: null, archivo: archivo("e1", "Balance.xlsx") },
  v1: { servidor: "https://oficina", config: { document: { key: "k-v1" } }, modo: "ver", motivo: "formato", archivo: archivo("v1", "Viejo.xls") },
  p1: { servidor: "https://oficina", config: { document: { key: "k-p1" } }, modo: "ver", motivo: "permiso", archivo: archivo("p1", "Ajeno.docx") },
  s1: { servidor: "https://oficina", config: { document: { key: "k-s1" } }, modo: "ver", motivo: "espacio", archivo: archivo("s1", "Lleno.pptx") },
  x1: { error: "No existe o no tienes acceso" },
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => {
        invocaciones.push({ fn, body });
        if (fn === "oficina-doc" && body.action === "editar_drive") return { data: RESPUESTAS[String(body.id)], error: null };
        if (fn === "oficina-doc" && body.action === "desde_drive") return { data: { id: "doc-copia", extension: "xlsx" }, error: null };
        return { data: { error: "no esperado" }, error: null };
      }),
    },
    from: () => ({ select: () => ({}) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));

// ONLYOFFICE no se monta en jsdom: se registra qué le llegó.
const montajes: { contenedor: string; apertura: unknown }[] = [];
vi.mock("@/hooks/useOnlyOffice", async (original) => ({
  ...(await original<typeof import("@/hooks/useOnlyOffice")>()),
  useEditorDeOffice: (contenedor: string, apertura: unknown) => {
    if (apertura) montajes.push({ contenedor, apertura });
    return { estado: apertura ? "listo" : "cargando", error: null };
  },
}));

import ArchivoDelDrivePage from "@/pages/oficina/ArchivoDelDrivePage";

function dibujar(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/oficina/drive/${id}`]}>
        <Routes>
          <Route path="/oficina/drive/:id" element={<ArchivoDelDrivePage />} />
          <Route path="/oficina/drive" element={<p>El Drive</p>} />
          <Route path="/oficina/:id" element={<p>Documento abierto</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invocaciones.length = 0;
  montajes.length = 0;
});

describe("un archivo del Drive en la Oficina", () => {
  it("⚠️ se abre EL MISMO archivo en modo edición, y lo dice", async () => {
    dibujar("e1");
    expect(await screen.findByText("Balance.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Lo que cambies se guarda en este archivo del Drive")).toBeInTheDocument();
    expect(invocaciones).toEqual([{ fn: "oficina-doc", body: { action: "editar_drive", id: "e1", tema: "light", idioma: "es" } }]);
    await waitFor(() => expect(montajes.length).toBeGreaterThan(0));
    expect(montajes[0].contenedor).toBe("archivo-del-drive");
    expect(document.getElementById("archivo-del-drive")).not.toBeNull();
    // Sin aviso de «solo ver».
    expect(screen.queryByRole("button", { name: "Editar una copia" })).not.toBeInTheDocument();
  });

  it("«Hacer una copia» es aparte (el «Guardar como» de Google) y va al documento nuevo", async () => {
    dibujar("e1");
    await screen.findByText("Balance.xlsx");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Hacer una copia" })); });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(invocaciones).toContainEqual({ fn: "oficina-doc", body: { action: "desde_drive", id: "e1" } });
  });

  it("un .xls se abre para ver y ofrece editar una copia", async () => {
    dibujar("v1");
    expect(await screen.findByText(/Los archivos \.xls se abren solo para ver/)).toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Editar una copia" })); });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(invocaciones).toContainEqual({ fn: "oficina-doc", body: { action: "desde_drive", id: "v1" } });
  });

  it("sin permiso de editor, o sin espacio, se dice por qué", async () => {
    dibujar("p1");
    expect(await screen.findByText(/Solo puedes ver este archivo/)).toBeInTheDocument();
  });

  it("sin espacio, también", async () => {
    dibujar("s1");
    expect(await screen.findByText(/No queda espacio en el Drive/)).toBeInTheDocument();
  });

  it("si no se puede abrir, se dice y se puede reintentar", async () => {
    dibujar("x1");
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo abrir el archivo: No existe o no tienes acceso");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("la flecha vuelve al Drive", async () => {
    dibujar("e1");
    await screen.findByText("Balance.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Volver al Drive" }));
    expect(screen.getByText("El Drive")).toBeInTheDocument();
  });
});
