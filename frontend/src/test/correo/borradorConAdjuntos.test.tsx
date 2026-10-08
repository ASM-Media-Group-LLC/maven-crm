import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";

// LOS ADJUNTOS DEL BORRADOR (Keila, 08/10: «los adjuntos de un borrador no se
// guardan»). Se perdían por los dos caminos:
//   · «Guardar borrador» subía a Borradores solo el texto;
//   · el autoguardado local (localStorage) no aguanta archivos, y las imágenes
//     pegadas volvían como «[imagen pegada — se perdió…]».
// Estos tests cierran el compositor, lo vuelven a abrir y miran que todo esté.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

const servidor = vi.hoisted(() => ({ guardar: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useMailbox", () => ({
  useSendMail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerDraft: () => ({ mutate: servidor.guardar }),
  useDeleteServerDraft: () => ({ mutate: vi.fn() }),
  useProgramarCorreo: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useSugerenciasDestinatarios", async (original) => ({
  ...(await original<typeof import("@/hooks/useSugerenciasDestinatarios")>()),
  useSugerenciasDestinatarios: () => [],
}));
vi.mock("@/hooks/useDirectorioCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useDirectorioCorreo")>()),
  useDirectorioCorreo: () => ({ data: [] }),
}));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import { MailComposer } from "@/components/correo/MailComposer";
import {
  __reiniciarParaTests, cargarPesado, devolverImagenes, guardarPesado, huellaDe,
  olvidarPesado, pesadoEnMemoria, separarImagenes,
} from "@/lib/correo/pesadoDelBorrador";

// Un PNG de 1×1 de verdad.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const MARCA = "[imagen pegada — se perdió al recuperar el borrador]";

beforeEach(() => {
  localStorage.clear();
  __reiniciarParaTests();
  servidor.guardar.mockReset();
});
afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

describe("las imágenes pegadas, afuera de localStorage", () => {
  it("el HTML queda liviano y cada imagen, nombrada por su huella", () => {
    const { html, imagenes } = separarImagenes(`<p>Mira</p><img src="${PNG}" width="200">`);
    expect(html).not.toContain("data:");
    expect(html).toContain(`src="borrador:${huellaDe(PNG)}"`);
    expect(html).toContain('width="200"');
    expect(imagenes).toEqual({ [huellaDe(PNG)]: PNG });
  });

  it("ida y vuelta da el mismo HTML", () => {
    const original = `<p>Uno</p><img src="${PNG}" width="200"><p>Dos</p><img src="${GIF}">`;
    const { html, imagenes } = separarImagenes(original);
    expect(devolverImagenes(html, imagenes, MARCA)).toBe(original);
  });

  it("la misma captura pegada dos veces se guarda una sola vez", () => {
    const { imagenes } = separarImagenes(`<img src="${PNG}"><img src="${PNG}">`);
    expect(Object.keys(imagenes)).toHaveLength(1);
  });

  it("imágenes distintas, huellas distintas", () => {
    expect(huellaDe(PNG)).not.toBe(huellaDe(GIF));
  });

  it("⚠️ la que no está vuelve como la marca, NUNCA como src=\"borrador:…\" (saldría rota en el correo)", () => {
    const r = devolverImagenes(`<p>Hola</p><img src="borrador:abc-123">`, {}, MARCA);
    expect(r).not.toContain("borrador:");
    expect(r).toContain(MARCA);
  });
});

describe("lo pesado, en memoria (sin IndexedDB, como en jsdom)", () => {
  const pdf = { filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 4, contentBase64: "aG9sYQ==" };

  it("lo anotado se encuentra al instante y al cargar", async () => {
    await guardarPesado("Keila@maven-ai.me", "nuevo", { adjuntos: [pdf], imagenes: {} });
    expect(pesadoEnMemoria("keila@maven-ai.me", "nuevo")?.adjuntos).toEqual([pdf]);
    expect((await cargarPesado("keila@maven-ai.me", "nuevo"))?.adjuntos).toEqual([pdf]);
  });

  it("cada contexto tiene lo suyo: la respuesta a un hilo no trae lo del correo nuevo", async () => {
    await guardarPesado("keila@maven-ai.me", "nuevo", { adjuntos: [pdf], imagenes: {} });
    expect(await cargarPesado("keila@maven-ai.me", "reply:<a@x>")).toBeNull();
  });

  it("olvidado (se mandó o se descartó): no vuelve", async () => {
    await guardarPesado("keila@maven-ai.me", "nuevo", { adjuntos: [pdf], imagenes: {} });
    await olvidarPesado("keila@maven-ai.me", "nuevo");
    expect(await cargarPesado("keila@maven-ai.me", "nuevo")).toBeNull();
    // «No hay nada» también se sabe: el compositor no espera al disco.
    expect(pesadoEnMemoria("keila@maven-ai.me", "nuevo")).toEqual({ adjuntos: [], imagenes: {} });
  });
});

function abrir() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MailComposer abierto onCerrar={() => {}} remitente="keila@maven-ai.me" />
    </QueryClientProvider>,
  );
}

function editorEnPantalla(): Editor {
  const dom = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("no se montó el editor");
  return dom.editor;
}

/** Escribe, adjunta un PDF, pega una imagen y cierra con «Guardar borrador». */
async function redactarYGuardar() {
  abrir();
  await waitFor(() => editorEnPantalla());
  act(() => {
    editorEnPantalla().chain().focus()
      .insertContent("<p>Va la cotización</p>")
      .insertContent({ type: "image", attrs: { src: PNG, width: 200 } })
      .run();
  });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(["hola"], "cotizacion.pdf", { type: "application/pdf" })] },
  });
  await screen.findByText("cotizacion.pdf");

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(await screen.findByRole("button", { name: "Guardar borrador" }));
}

describe("el compositor: cerrar con «Guardar borrador» y volver a abrir", () => {
  it("al servidor van el PDF y la imagen pegada (como parte con cid:, no adentro del HTML)", async () => {
    await redactarYGuardar();
    expect(servidor.guardar).toHaveBeenCalledTimes(1);
    const enviado = servidor.guardar.mock.calls[0][0] as {
      html: string;
      attachments: Array<{ filename: string; contentType: string; contentBase64: string; contentId?: string }>;
    };
    expect(enviado.html).not.toContain("data:");
    expect(enviado.html).toMatch(/src="cid:img1\.[^"]+@maven-ai\.me"/);
    expect(enviado.attachments).toContainEqual({
      filename: "cotizacion.pdf", contentType: "application/pdf", contentBase64: btoa("hola"),
    });
    expect(enviado.attachments.some((a) => a.contentType === "image/png" && a.contentId)).toBe(true);
  });

  it("vuelve con el texto, el PDF y la imagen", async () => {
    await redactarYGuardar();
    cleanup();

    abrir();
    await screen.findByText("Retomaste un borrador que habías empezado.");
    expect(screen.getByText("cotizacion.pdf")).toBeTruthy();
    const html = editorEnPantalla().getHTML();
    expect(html).toContain("Va la cotización");
    expect(html).toContain(PNG);
    expect(html).not.toContain("borrador:");
  });

  it("si el disco no contesta (WebKit), abre igual con su texto y la marca donde iba la imagen", async () => {
    await redactarYGuardar();
    cleanup();
    // Como después de recargar: la memoria vacía y un IndexedDB que nunca abre.
    __reiniciarParaTests();
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: vi.fn(() => ({})) };

    abrir();
    await screen.findByText("Retomaste un borrador que habías empezado.");
    const html = editorEnPantalla().getHTML();
    expect(html).toContain("Va la cotización");
    expect(html).toContain(MARCA);
    expect(html).not.toContain("borrador:");
  });
});
