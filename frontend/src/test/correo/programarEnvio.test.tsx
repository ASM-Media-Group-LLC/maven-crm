import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";

// «PROGRAMAR ENVÍO» EN EL CORREO (Keila, 08/10: como Gmail).
//   · La flechita pegada a «Enviar» abre el menú; cada opción programa el MISMO
//     correo que saldría con Enviar, con su hora de Colombia.
//   · «Elegir fecha y hora» repite lo elegido en palabras y no deja una hora pasada.
//   · La carpeta «Programados»: cancelar vuelve a abrir el correo para editarlo.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

const h = vi.hoisted(() => ({
  programar: vi.fn(),
  enviar: vi.fn(),
  cancelar: vi.fn(),
  programados: [] as unknown[],
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useMailbox", () => ({
  useSendMail: () => ({ mutateAsync: h.enviar, isPending: false }),
  useProgramarCorreo: () => ({ mutateAsync: h.programar, isPending: false }),
  useSaveServerDraft: () => ({ mutate: vi.fn() }),
  useDeleteServerDraft: () => ({ mutate: vi.fn() }),
  useCorreosProgramados: () => ({ data: h.programados, isLoading: false, isError: false }),
  useCancelarProgramado: () => ({ mutateAsync: h.cancelar, isPending: false, variables: undefined }),
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
// Radix pide estas al abrir menús en jsdom.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

import { MailComposer } from "@/components/correo/MailComposer";
import { VistaProgramados } from "@/components/correo/VistaProgramados";
import { borradorDeProgramado, CARPETA_PROGRAMADOS, conProgramados } from "@/lib/correo/programados";
import { __reiniciarParaTests } from "@/lib/correo/pesadoDelBorrador";
import { opcionesDeProgramar } from "@/lib/programarEnvio";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeEach(() => {
  localStorage.clear();
  __reiniciarParaTests();
  h.programar.mockReset().mockResolvedValue({ ok: true, id: "p1" });
  h.enviar.mockReset().mockResolvedValue({ ok: true });
  h.cancelar.mockReset();
  h.programados = [];
  h.toast.success.mockReset();
  h.toast.error.mockReset();
});
afterEach(() => cleanup());

describe("la carpeta «Programados» en la columna", () => {
  const carpetas = [
    { folder: "INBOX", unread: 3 }, { folder: "Enviado", unread: 0 }, { folder: "Borrador", unread: 0 }, { folder: "Papelera", unread: 0 },
  ];

  it("va después de Enviados, como en Gmail, con cuántos hay", () => {
    expect(conProgramados(carpetas, 2, false).map((c) => c.folder))
      .toEqual(["INBOX", "Enviado", CARPETA_PROGRAMADOS, "Borrador", "Papelera"]);
    expect(conProgramados(carpetas, 2, false)[2].unread).toBe(2);
  });

  it("sin programados no aparece (salvo que la estés mirando)", () => {
    expect(conProgramados(carpetas, 0, false)).toBe(carpetas);
    expect(conProgramados(carpetas, 0, true).some((c) => c.folder === CARPETA_PROGRAMADOS)).toBe(true);
  });
});

describe("borradorDeProgramado (cancelar lo vuelve a abrir)", () => {
  it("la imagen pegada vuelve al cuerpo, el archivo a la lista, y el Cco se conserva", () => {
    const b = borradorDeProgramado({
      id: "p1", para: ["ana@x.com"], cc: [], cco: ["jefa@z.com"], asunto: "Cotización", enviar_en: "2026-10-09T13:00:00Z",
      correo: {
        html: '<p>Hola</p><img src="cid:img1.ab@maven-ai.me">',
        text: "Hola",
        in_reply_to: "<p@x>",
        attachments: [
          { filename: "cotizacion.pdf", contentType: "application/pdf", contentBase64: "aG9sYQ==" },
          { filename: "imagen-1.png", contentType: "image/png", contentBase64: PNG, contentId: "img1.ab@maven-ai.me" },
        ],
      },
    });
    expect(b.to).toBe("ana@x.com");
    expect(b.bcc).toBe("jefa@z.com");
    expect(b.inReplyTo).toBe("<p@x>");
    expect(b.cuerpoHtml).toContain(`data:image/png;base64,${PNG}`);
    expect(b.adjuntosIniciales?.map((a) => a.filename)).toEqual(["cotizacion.pdf"]);
  });

  it("un correo de solo texto vuelve con sus párrafos", () => {
    const b = borradorDeProgramado({
      id: "p2", para: ["ana@x.com"], cc: [], cco: [], asunto: "(sin asunto)", enviar_en: "2026-10-09T13:00:00Z",
      correo: { html: null, text: "Uno\n\nDos <3" },
    });
    expect(b.subject).toBe("");
    expect(b.cuerpoHtml).toBe("<p>Uno</p><p>Dos &lt;3</p>");
  });
});

function abrirCompositor() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MailComposer abierto onCerrar={() => {}} remitente="keila@maven-ai.me" inicial={{ to: "ana@x.com", subject: "Cotización" }} />
    </QueryClientProvider>,
  );
}

function editorEnPantalla(): Editor {
  const dom = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("no se montó el editor");
  return dom.editor;
}

async function abrirMenu() {
  // Radix abre el menú con Enter (el pointerdown de jsdom no trae `button`).
  fireEvent.keyDown(screen.getByRole("button", { name: "Programar envío" }), { key: "Enter" });
  await screen.findByRole("menu");
}

describe("el compositor: la flechita de «Enviar»", () => {
  it("«Mañana a las 8:00 a. m.» programa el mismo correo, para mañana a las 8 de Bogotá", async () => {
    abrirCompositor();
    await waitFor(() => editorEnPantalla());
    act(() => { editorEnPantalla().commands.insertContent("<p>Va la cotización</p>"); });

    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Mañana a las 8:00 a\. m\./ }));

    await waitFor(() => expect(h.programar).toHaveBeenCalledTimes(1));
    const pedido = h.programar.mock.calls[0][0] as { cuando: Date; to: string[]; subject: string; html: string };
    expect(pedido.to).toEqual(["ana@x.com"]);
    expect(pedido.subject).toBe("Cotización");
    expect(pedido.html).toContain("Va la cotización");
    expect(pedido.cuando.toISOString()).toBe(opcionesDeProgramar()[0].cuando.toISOString());
    expect(h.enviar).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Envío programado: /), undefined);
  });

  it("cada opción muestra su fecha concreta al lado", async () => {
    abrirCompositor();
    await waitFor(() => editorEnPantalla());
    act(() => { editorEnPantalla().commands.insertContent("<p>Hola</p>"); });
    await abrirMenu();
    const items = screen.getAllByRole("menuitem");
    // Las fijas llevan fecha; «Elegir fecha y hora» no.
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].textContent).toMatch(/\d/);
  });

  it("«Elegir fecha y hora»: repite lo elegido en palabras y programa ese instante", async () => {
    abrirCompositor();
    await waitFor(() => editorEnPantalla());
    act(() => { editorEnPantalla().commands.insertContent("<p>Hola</p>"); });
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Elegir fecha y hora/ }));

    const fecha = await screen.findByLabelText("Fecha");
    const anio = new Date().getFullYear() + 1;
    fireEvent.change(fecha, { target: { value: `15/01/${anio}` } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "13:30" } });
    expect(await screen.findByText(/Se envía el .*15 de enero a la 1:30/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Programar envío$/ }));
    await waitFor(() => expect(h.programar).toHaveBeenCalledTimes(1));
    const { cuando } = h.programar.mock.calls[0][0] as { cuando: Date };
    expect(cuando.toISOString()).toBe(`${anio}-01-15T18:30:00.000Z`);
  });

  it("una hora que ya pasó se dice enseguida y no se programa", async () => {
    abrirCompositor();
    await waitFor(() => editorEnPantalla());
    act(() => { editorEnPantalla().commands.insertContent("<p>Hola</p>"); });
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Elegir fecha y hora/ }));
    fireEvent.change(await screen.findByLabelText("Fecha"), { target: { value: "01/01/2020" } });
    expect(await screen.findByText("Esa hora ya pasó: elige una más adelante.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Programar envío$/ }));
    expect(h.programar).not.toHaveBeenCalled();
  });

  it("sin destinatario, la flecha está apagada como Enviar", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MailComposer abierto onCerrar={() => {}} remitente="keila@maven-ai.me" />
      </QueryClientProvider>,
    );
    await waitFor(() => editorEnPantalla());
    expect((screen.getByRole("button", { name: "Programar envío" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("la carpeta «Programados»", () => {
  const fila = {
    id: "p1", enviar_en: "2030-01-15T13:00:00Z", estado: "pendiente", para: ["ana@x.com"], cc: [], cco: [],
    asunto: "Cotización", resumen: "Hola, va la cotización.",
    adjuntos_meta: [{ filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 4 }], ultimo_error: null,
  };

  it("lista cuándo sale, a quién y el asunto; «Cancelar envío» lo abre para editar", async () => {
    h.programados = [fila];
    h.cancelar.mockResolvedValue({
      id: "p1", para: ["ana@x.com"], cc: [], cco: [], asunto: "Cotización", enviar_en: fila.enviar_en,
      correo: { html: "<p>Hola</p>", text: "Hola", attachments: [] },
    });
    const onEditar = vi.fn();
    render(<VistaProgramados onEditar={onEditar} onVolver={() => {}} />);
    expect(screen.getByText("Para: ana@x.com")).toBeTruthy();
    expect(screen.getByText("Cotización")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar envío" }));
    await waitFor(() => expect(onEditar).toHaveBeenCalledTimes(1));
    expect(h.cancelar).toHaveBeenCalledWith("p1");
    expect(onEditar.mock.calls[0][0]).toMatchObject({ to: "ana@x.com", subject: "Cotización", cuerpoHtml: "<p>Hola</p>" });
  });

  it("si ya salió (cancelar devuelve null), lo dice y no abre nada", async () => {
    h.programados = [fila];
    h.cancelar.mockResolvedValue(null);
    const onEditar = vi.fn();
    render(<VistaProgramados onEditar={onEditar} onVolver={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar envío" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Ya salió o está saliendo: no se puede cancelar."));
    expect(onEditar).not.toHaveBeenCalled();
  });

  it("uno que falló dice por qué y se abre para corregir", () => {
    h.programados = [{ ...fila, estado: "fallido", ultimo_error: "tu correo no está conectado a Maven" }];
    render(<VistaProgramados onEditar={() => {}} onVolver={() => {}} />);
    expect(screen.getByText(/No se envió: tu correo no está conectado a Maven/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir para corregir" })).toBeTruthy();
  });

  it("vacía: dice cómo programar uno", () => {
    render(<VistaProgramados onEditar={() => {}} onVolver={() => {}} />);
    expect(screen.getByText("No tienes correos programados.")).toBeTruthy();
  });
});
