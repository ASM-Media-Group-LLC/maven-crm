import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";

// EL VISOR DE ARCHIVOS DEL DRIVE (Jhon, 02/10): «hay que agregar visor de
// archivos, los de word los abrimos con documentos de maven, los de excel con
// hojas de cálculo de maven, visor de pdf que usamos en los correos, de
// videos, imágenes… con opción de descargar».

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const invocaciones: { fn: string; body: Record<string, unknown> }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, { body }: { body: Record<string, unknown> }) => {
        invocaciones.push({ fn, body });
        if (fn === "drive" && body.action === "abrir") return { data: { url: `https://nas/o?t=${body.id}` }, error: null };
        if (fn === "oficina-doc" && body.action === "ver_drive") {
          return { data: { servidor: "https://oficina", config: { document: { key: `k-${body.id}` } } }, error: null };
        }
        if (fn === "oficina-doc" && body.action === "desde_drive") return { data: { id: "doc-nuevo", extension: "docx" }, error: null };
        return { data: { error: "no esperado" }, error: null };
      }),
    },
    from: () => ({ select: () => ({}) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));

const abrirArchivo = vi.fn(async (_id: string, _descargar: boolean) => {});
vi.mock("@/hooks/useDrive", async (original) => ({
  ...(await original<typeof import("@/hooks/useDrive")>()),
  abrirArchivo: (id: string, descargar: boolean) => abrirArchivo(id, descargar),
}));

// El editor de ONLYOFFICE no se puede montar en jsdom (trae su api.js del
// servidor de Oficina): se registra qué configuración le llegó.
const montajes: { contenedor: string; apertura: unknown }[] = [];
vi.mock("@/hooks/useOnlyOffice", async (original) => ({
  ...(await original<typeof import("@/hooks/useOnlyOffice")>()),
  useEditorDeOffice: (contenedor: string, apertura: unknown) => {
    if (apertura) montajes.push({ contenedor, apertura });
    return { estado: apertura ? "listo" : "cargando", error: null };
  },
}));

import {
  decodificarTexto, destinoEnLaOficina, FORMATOS_OFFICE, pareceBinario, POR_MIME, TOPE_OFFICE, vistaDeArchivo,
} from "@/lib/drive/tipoDeArchivo";
import { leerTexto } from "@/hooks/useVisorDrive";
import { lasFlechasSonDeOtro, soloUnClic } from "@/pages/oficina/drive/gestos";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import type { DriveItem } from "@/hooks/useDrive";
import * as edge from "../../../../supabase/functions/oficina-doc/drive";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/oficina/DrivePage.tsx"], { query: "?raw", import: "default", eager: true });
const drivePage = Object.values(fuentes)[0] ?? "";

const vista = (nombre: string, mime: string | null = null, size: number | null = 1000) => vistaDeArchivo({ nombre, mime, size });

describe("qué vista le toca a cada archivo", () => {
  it("por la extensión", () => {
    for (const n of ["a.jpg", "a.JPEG", "a.png", "a.gif", "a.webp", "a.heic", "a.bmp"]) expect(vista(n).tipo, n).toBe("imagen");
    for (const n of ["a.mp4", "a.mov", "a.webm", "a.m4v"]) expect(vista(n).tipo, n).toBe("video");
    for (const n of ["a.mp3", "a.m4a", "a.wav", "a.ogg"]) expect(vista(n).tipo, n).toBe("audio");
    expect(vista("cv.pdf").tipo).toBe("pdf");
    for (const n of ["a.doc", "a.docx", "a.odt", "a.rtf", "a.xls", "a.xlsx", "a.ods", "a.csv", "a.ppt", "a.pptx", "a.odp"]) {
      expect(vista(n).tipo, n).toBe("office");
    }
    for (const n of ["a.txt", "a.md", "a.json", "a.log", "a.html", "a.xml"]) expect(vista(n).tipo, n).toBe("texto");
    for (const n of ["a.zip", "a.exe", "a.psd", "a.dmg"]) expect(vista(n)).toEqual({ tipo: "ninguno", motivo: "formato" });
  });

  it("⚠️ la extensión manda sobre el tipo de la ficha (lo importado llega como octet-stream)", () => {
    expect(vista("cv.pdf", "application/octet-stream").tipo).toBe("pdf");
    expect(vista("foto.jpg", "application/pdf").tipo).toBe("imagen");
    expect(vista("Balance.xlsx", "application/zip").tipo).toBe("office");
  });

  it("sin extensión conocida, cuenta el tipo de la ficha", () => {
    expect(vista("IMG_1234", "image/jpeg").tipo).toBe("imagen");
    expect(vista("grabacion", "video/mp4").tipo).toBe("video");
    expect(vista("nota-de-voz", "audio/mpeg").tipo).toBe("audio");
    expect(vista("escaneo", "application/pdf").tipo).toBe("pdf");
    expect(vista("Contrato", "application/vnd.openxmlformats-officedocument.wordprocessingml.document").tipo).toBe("office");
    expect(vista("LEEME", "text/plain; charset=utf-8").tipo).toBe("texto");
    expect(vista("datos", "text/csv").tipo).toBe("office");
    expect(vista("x", "application/octet-stream").tipo).toBe("ninguno");
    expect(vista("x", null).tipo).toBe("ninguno");
  });

  it("⚠️ un SVG se marca: se dibuja SOLO con <img> desde una data: URL", () => {
    expect(vista("logo.svg")).toEqual({ tipo: "imagen", esSvg: true });
    expect(vista("logo", "image/svg+xml")).toEqual({ tipo: "imagen", esSvg: true });
    expect(vista("logo.png").esSvg).toBeUndefined();
  });

  it("un documento de más de 100 MB no va a ONLYOFFICE (no lo baja): tarjeta con Descargar", () => {
    expect(vista("enorme.pptx", null, TOPE_OFFICE + 1)).toEqual({ tipo: "ninguno", motivo: "grande" });
    expect(vista("justo.pptx", null, TOPE_OFFICE).tipo).toBe("office");
    // Un texto enorme sí se ve: se muestra el principio.
    expect(vista("enorme.log", null, 5 * 1024 ** 3).tipo).toBe("texto");
  });

  it("la copia editable va a la sección que corresponde de la Oficina", () => {
    expect(destinoEnLaOficina({ nombre: "Acta.doc", mime: null })).toBe("docx");
    expect(destinoEnLaOficina({ nombre: "ventas.csv", mime: null })).toBe("xlsx");
    expect(destinoEnLaOficina({ nombre: "charla.odp", mime: null })).toBe("pptx");
    expect(destinoEnLaOficina({ nombre: "cv.pdf", mime: null })).toBeNull();
  });

  it("⚠️ la tabla de Office del visor es IGUAL a la de la edge (si sobra algo, la edge lo rechaza)", () => {
    expect(FORMATOS_OFFICE).toEqual(edge.FORMATOS_OFFICE);
    expect(POR_MIME).toEqual(edge.POR_MIME);
    expect(TOPE_OFFICE).toBe(edge.TOPE_VISTA);
  });
});

describe("el texto", () => {
  it("UTF-8, y si no lo es, Windows-1252; una letra cortada al final no lo rompe", () => {
    const utf8 = new TextEncoder().encode("año — ñandú");
    expect(decodificarTexto(utf8)).toBe("año — ñandú");
    expect(decodificarTexto(new Uint8Array([0x61, 0xf1, 0x6f]))).toBe("año"); // «año» en Windows-1252
    expect(decodificarTexto(utf8.slice(0, 2))).toBe("a"); // la «ñ» quedó a medias
  });

  it("con bytes nulos no es texto", () => {
    expect(pareceBinario(new Uint8Array([0x50, 0x4b, 0x00, 0x03]))).toBe(true);
    expect(pareceBinario(new TextEncoder().encode("hola"))).toBe(false);
  });

  describe("leerTexto pide solo el principio", () => {
    const fetchReal = globalThis.fetch;
    afterEach(() => { globalThis.fetch = fetchReal; });

    it("por Range, y avisa que se cortó", async () => {
      const pedidos: (HeadersInit | undefined)[] = [];
      globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
        pedidos.push(init?.headers);
        return new Response("x".repeat(10), { status: 206 });
      }) as typeof fetch;
      const r = await leerTexto("https://nas/o?t=1", 5000, 10);
      expect(pedidos[0]).toEqual({ Range: "bytes=0-9" });
      expect(r).toEqual({ texto: "x".repeat(10), cortado: true, binario: false });
    });

    it("si el servidor manda todo igual, corta en el tope", async () => {
      globalThis.fetch = vi.fn(async () => new Response("y".repeat(50), { status: 200 })) as typeof fetch;
      const r = await leerTexto("https://nas/o?t=1", null, 10);
      expect(r.texto).toBe("y".repeat(10));
      expect(r.cortado).toBe(true);
    });

    it("⚠️ un archivo vacío no se pide (el NAS contesta 416 a un rango sobre 0 bytes)", async () => {
      const f = vi.fn();
      globalThis.fetch = f as unknown as typeof fetch;
      expect(await leerTexto("https://nas/o?t=1", 0)).toEqual({ texto: "", cortado: false, binario: false });
      expect(f).not.toHaveBeenCalled();
      globalThis.fetch = vi.fn(async () => new Response(null, { status: 416 })) as typeof fetch;
      expect((await leerTexto("https://nas/o?t=1", null)).texto).toBe("");
    });
  });
});

describe("doble clic", () => {
  it("el segundo clic de un doble clic no abre otra vez; el teclado (detail 0) sí abre", () => {
    const abrir = vi.fn();
    render(<button type="button" onClick={soloUnClic(abrir)}>archivo</button>);
    const b = screen.getByRole("button", { name: "archivo" });
    fireEvent.click(b, { detail: 1 });
    fireEvent.click(b, { detail: 2 });
    fireEvent.doubleClick(b, { detail: 2 });
    expect(abrir).toHaveBeenCalledTimes(1);
    fireEvent.click(b, { detail: 0 });
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it("la fila del Drive abre con soloUnClic, y abrir un archivo es el visor, no una pestaña", () => {
    expect(drivePage).toMatch(/onClick=\{soloUnClic\(\(\) => abrir\(i\)\)\}/);
    const i = drivePage.indexOf("const abrir = (i: DriveItem) => {");
    const cuerpo = drivePage.slice(i, drivePage.indexOf("};", i));
    expect(cuerpo).toMatch(/setViendo\(i\.id\)/);
    expect(cuerpo).not.toMatch(/abrirArchivo\(/);
  });
});

describe("las flechas no se roban del video ni de un campo", () => {
  const tecla = (target: EventTarget, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, ...extra });
    Object.defineProperty(e, "target", { value: target });
    return e;
  };
  it("en un video, un input o con modificadores son de otro; en un botón, del visor", () => {
    expect(lasFlechasSonDeOtro(tecla(document.createElement("video")))).toBe(true);
    expect(lasFlechasSonDeOtro(tecla(document.createElement("input")))).toBe(true);
    expect(lasFlechasSonDeOtro(tecla(document.createElement("button"), { altKey: true }))).toBe(true);
    expect(lasFlechasSonDeOtro(tecla(document.createElement("button")))).toBe(false);
    expect(lasFlechasSonDeOtro(tecla(document.body))).toBe(false);
  });
});

// ── El visor dibujado ────────────────────────────────────────────────────────

const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "u1", parent_id: null, tipo: "archivo", nombre, mime: null, size: 2048, estado: "listo",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", last_opened_at: null, trashed_at: null,
  ...extra,
});

const LISTA: DriveItem[] = [
  item("c1", "Contabilidad", { tipo: "carpeta", size: null }),
  item("f1", "foto.jpg", { mime: "image/jpeg" }),
  item("f2", "plano.png", { mime: "image/png" }),
  item("s1", "a medias.mp4", { estado: "subiendo" }),
  item("v1", "video.mp4", { mime: "video/mp4" }),
];

function Prueba({ items, inicial }: { items: DriveItem[]; inicial: string | null }) {
  const [abierto, setAbierto] = useState<string | null>(inicial);
  return (
    <>
      <p data-testid="abierto">{abierto ?? "cerrado"}</p>
      <VisorArchivo items={items} abierto={abierto} onAbierto={setAbierto} />
    </>
  );
}

function dibujar(items: DriveItem[], inicial: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/oficina/drive"]}>
        <Routes>
          <Route path="/oficina/drive" element={<Prueba items={items} inicial={inicial} />} />
          <Route path="/oficina/:id" element={<p>Documento abierto</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const imagen = () => document.querySelector("img")?.getAttribute("src");

beforeEach(() => {
  invocaciones.length = 0;
  montajes.length = 0;
  abrirArchivo.mockClear();
});

describe("el visor", () => {
  it("abre el archivo tocado con su nombre, y cuenta solo los archivos listos (sin carpetas)", async () => {
    dibujar(LISTA, "f2");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("plano.png")).toBeInTheDocument();
    expect(screen.getByText(/2 de 3/)).toBeInTheDocument();
    await waitFor(() => expect(imagen()).toBe("https://nas/o?t=f2"));
    expect(invocaciones).toEqual([{ fn: "drive", body: { action: "abrir", id: "f2", descargar: false } }]);
  });

  it("→ y ← pasan de archivo, con los botones y con el teclado, y no dan la vuelta", async () => {
    dibujar(LISTA, "f1");
    await waitFor(() => expect(imagen()).toBe("https://nas/o?t=f1"));
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("abierto")).toHaveTextContent("f1");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(imagen()).toBe("https://nas/o?t=f2"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    // El tercero es un video: se saltó la subida a medias.
    await waitFor(() => expect(document.querySelector("video")?.getAttribute("src")).toBe("https://nas/o?t=v1"));
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("abierto")).toHaveTextContent("v1");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(imagen()).toBe("https://nas/o?t=f2"));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(imagen()).toBe("https://nas/o?t=f1"));
  });

  it("⚠️ con el foco en el video, las flechas adelantan el video y NO cambian de archivo", async () => {
    dibujar(LISTA, "v1");
    const video = await waitFor(() => {
      const v = document.querySelector("video");
      expect(v).not.toBeNull();
      return v!;
    });
    fireEvent.keyDown(video, { key: "ArrowLeft" });
    expect(screen.getByTestId("abierto")).toHaveTextContent("v1");
  });

  it("Esc cierra", async () => {
    dibujar(LISTA, "f1");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("abierto")).toHaveTextContent("cerrado"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("la X cierra", () => {
    dibujar(LISTA, "f1");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByTestId("abierto")).toHaveTextContent("cerrado");
  });

  it("Descargar está siempre y baja ESE archivo", () => {
    dibujar(LISTA, "f2");
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    expect(abrirArchivo).toHaveBeenCalledWith("f2", true);
  });

  it("«Abrir en otra pestaña» abre ese archivo (y no aparece en lo que el navegador no muestra solo)", () => {
    dibujar(LISTA, "f1");
    fireEvent.click(screen.getByRole("button", { name: "Abrir en otra pestaña" }));
    expect(abrirArchivo).toHaveBeenCalledWith("f1", false);
  });

  it("un formato sin vista: tarjeta con Descargar, y NO se pide la URL (pedirla anota «abierto»)", () => {
    dibujar([item("z1", "fotos.zip", { mime: "application/zip" })], "z1");
    expect(screen.getByText("Este archivo no tiene vista previa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir en otra pestaña" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Descargar" }).length).toBeGreaterThan(0);
    expect(invocaciones).toEqual([]);
  });

  it("si el archivo abierto sale de la lista (otra carpeta), el visor se cierra", () => {
    const { rerender } = dibujar(LISTA, "f1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const qc = new QueryClient();
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/oficina/drive"]}>
          <Routes>
            <Route path="/oficina/drive" element={<Prueba items={[item("otro", "otro.png")]} inicial="f1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Word, Excel y PowerPoint", () => {
  it("se abren en ONLYOFFICE en modo lectura con la config de la edge, sin pedir la URL del NAS", async () => {
    dibujar([item("d1", "Contrato.docx"), item("x1", "Balance.xlsx")], "d1");
    await waitFor(() => expect(montajes.length).toBeGreaterThan(0));
    expect(invocaciones).toEqual([{ fn: "oficina-doc", body: { action: "ver_drive", id: "d1", tema: "light", idioma: "es" } }]);
    expect(montajes[0].contenedor).toBe("visor-drive-office-d1");
    expect(document.getElementById("visor-drive-office-d1")).not.toBeNull();
    // Cada archivo en su propio contenedor.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(montajes.some((m) => m.contenedor === "visor-drive-office-x1")).toBe(true));
  });

  it("el botón dice a qué parte de la Oficina va la copia", () => {
    dibujar([item("d1", "Contrato.docx"), item("x1", "Balance.xls"), item("p1", "Charla.odp")], "d1");
    expect(screen.getByRole("button", { name: "Editar en Documentos de Maven" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Editar en Hojas de cálculo de Maven" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Editar en Presentaciones de Maven" })).toBeInTheDocument();
  });

  it("«Editar en Documentos de Maven» crea la copia y abre el documento nuevo", async () => {
    dibujar([item("d1", "Contrato.doc")], "d1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar en Documentos de Maven" }));
    });
    await waitFor(() => expect(screen.getByText("Documento abierto")).toBeInTheDocument());
    expect(invocaciones).toContainEqual({ fn: "oficina-doc", body: { action: "desde_drive", id: "d1" } });
  });

  it("un PDF o una imagen no ofrecen «Editar en…»", () => {
    dibujar([item("p", "cv.pdf")], "p");
    expect(screen.queryByRole("button", { name: /Editar en/ })).not.toBeInTheDocument();
  });
});

describe("⚠️ un SVG solo como imagen", () => {
  const fetchReal = globalThis.fetch;
  afterEach(() => { globalThis.fetch = fetchReal; });

  it("se dibuja con <img> desde una data: URL (un blob: tendría el origen de Maven) y nada del SVG llega al DOM", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" id="malo"><script>window.__svg=1</script><circle r="4"/></svg>';
    globalThis.fetch = vi.fn(async () => new Response(svg, { status: 200 })) as typeof fetch;
    const crear = vi.spyOn(URL, "createObjectURL");
    dibujar([item("g1", "logo.svg", { mime: "application/octet-stream", size: svg.length })], "g1");
    const img = await waitFor(() => {
      const i = document.querySelector("img");
      expect(i?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
      return i!;
    });
    expect(atob(img.getAttribute("src")!.split(",")[1])).toBe(svg);
    expect(document.getElementById("malo")).toBeNull();
    expect(document.body.innerHTML).not.toContain("__svg");
    expect((window as unknown as { __svg?: number }).__svg).toBeUndefined();
    expect(crear).not.toHaveBeenCalled();
    crear.mockRestore();
  });
});

describe("⚠️ el texto se muestra como TEXTO", () => {
  const fetchReal = globalThis.fetch;
  afterEach(() => { globalThis.fetch = fetchReal; });

  it("un .html se ve como su código: ni una etiqueta llega al DOM", async () => {
    const html = "<b id=\"inyectado\">hola</b><img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=1</script>";
    globalThis.fetch = vi.fn(async () => new Response(html, { status: 206 })) as typeof fetch;
    dibujar([item("h1", "pagina.html", { mime: "text/html", size: html.length })], "h1");
    const pre = await waitFor(() => {
      const p = document.querySelector("pre");
      expect(p?.textContent).toBe(html);
      return p!;
    });
    expect(pre.children.length).toBe(0);
    expect(document.getElementById("inyectado")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // El NAS lo manda como descarga: «otra pestaña» no se ofrece.
    expect(screen.queryByRole("button", { name: "Abrir en otra pestaña" })).not.toBeInTheDocument();
  });
});
