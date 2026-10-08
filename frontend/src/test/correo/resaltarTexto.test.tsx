import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup, act, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { sanitizeEmailHtml } from "../../../../supabase/functions/_shared/html-sanitize";

// RESALTAR TEXTO EN EL CORREO (Keila, 02/10).
//
// Lo que pidió es el «Color de fondo» del menú de color de Gmail. Lo delicado no
// es el botón: es que el resaltado LLEGUE. El correo sale de Maven a Gmail y a
// Outlook, que no conocen nuestras clases ni nuestra hoja de estilos, y nuestro
// propio saneador (la copia que se ve en Enviados) no deja pasar `<mark>`. Por
// eso el fondo tiene que viajar como estilo EN LÍNEA en un <span>, igual que el
// color de la letra. Estos tests miran el HTML que de verdad se manda.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

const envio = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useMailbox", () => ({
  useSendMail: () => envio,
  useSaveServerDraft: () => ({ mutate: vi.fn() }),
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
import { ColorDeFondo, FONDOS, fondoDe } from "@/components/correo/colorDeFondo";
import { htmlParaCorreo, rgbAHex } from "@/components/correo/mailHtml";

/** Las mismas extensiones de texto que usa el compositor. */
function editorDelCorreo(html: string): Editor {
  return new Editor({ extensions: [StarterKit, TextStyle, Color, ColorDeFondo], content: html });
}

/** Los tramos resaltados de un HTML: [texto, fondo en hexadecimal]. */
function resaltados(html: string): Array<[string, string]> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>("span[style]"))
    .map((s) => [s.textContent ?? "", rgbAHex(fondoDe(s) ?? "")] as [string, string])
    .filter(([, fondo]) => fondo);
}

beforeEach(() => {
  localStorage.clear();
  envio.mutateAsync.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

describe("el resaltado como atributo de textStyle", () => {
  it("se escribe como <span style=background-color> en línea, nunca como <mark>", () => {
    const ed = editorDelCorreo("<p>Ojo con la fecha</p>");
    ed.chain().setTextSelection({ from: 9, to: 17 }).setBackgroundColor("#ffff00").run();
    const html = ed.getHTML();
    expect(html).not.toContain("<mark");
    expect(resaltados(html)).toEqual([["la fecha", "#ffff00"]]);
    ed.destroy();
  });

  it("convive con el color de la letra en el mismo <span>", () => {
    const ed = editorDelCorreo("<p>urgente</p>");
    ed.chain().selectAll().setColor("#dc2626").setBackgroundColor("#fff2cc").run();
    const spans = new DOMParser().parseFromString(ed.getHTML(), "text/html").querySelectorAll("span");
    expect(spans).toHaveLength(1);
    expect(rgbAHex(spans[0].style.color)).toBe("#dc2626");
    expect(rgbAHex(spans[0].style.backgroundColor)).toBe("#fff2cc");
    ed.destroy();
  });

  it("«Sin resaltado» lo quita y no deja un <span> vacío de estilos", () => {
    const ed = editorDelCorreo('<p><span style="background-color: #ffff00">ya no</span></p>');
    ed.chain().selectAll().unsetBackgroundColor().run();
    expect(ed.getHTML()).toBe("<p>ya no</p>");
    ed.destroy();
  });

  it("vuelve igual del borrador (el borrador se guarda como HTML)", () => {
    const ed = editorDelCorreo('<p><span style="background-color: #d9ead3">listo</span></p>');
    const otra = editorDelCorreo(ed.getHTML());
    expect(otra.getHTML()).toBe(ed.getHTML());
    ed.destroy();
    otra.destroy();
  });

  it("lo pegado de Google Docs (fondo transparent en cada tramo) no cuenta como resaltado", () => {
    const ed = editorDelCorreo('<p><span style="background-color:transparent;color:#000000">texto</span></p>');
    expect(ed.getHTML()).not.toContain("background-color");
    ed.destroy();
  });

  it("la paleta es corta y de fondos claros (el texto del correo es oscuro)", () => {
    const todos = FONDOS.flat();
    expect(todos.length).toBeLessThanOrEqual(16);
    for (const c of todos) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      // Luminancia percibida alta: el gris oscuro del texto se lee encima.
      expect(0.299 * r + 0.587 * g + 0.114 * b, c).toBeGreaterThan(150);
    }
  });
});

describe("el HTML que sale", () => {
  it("htmlParaCorreo deja el fondo en línea, en hexadecimal", () => {
    // Así lo entrega el editor en el navegador: el estilo pasa por el CSSOM y
    // el color queda como rgb().
    const html = htmlParaCorreo('<p>Ojo con <span style="background-color: rgb(255, 255, 0);">la fecha</span></p>');
    expect(html).toMatch(/<span style="background-color: #ffff00;?">la fecha<\/span>/);
  });

  it("el color de la letra también sale en hexadecimal", () => {
    const html = htmlParaCorreo('<p><span style="color: rgb(220, 38, 38); background-color: rgb(255, 242, 204);">x</span></p>');
    expect(html).toMatch(/<span style="color: #dc2626; background-color: #fff2cc;?">x<\/span>/);
    // rgba() no tiene hexadecimal de 6: se deja como está.
    expect(rgbAHex("color: rgba(0, 0, 0, 0.5)")).toBe("color: rgba(0, 0, 0, 0.5)");
  });

  it("el saneador de Enviados lo deja pasar", () => {
    const html = htmlParaCorreo('<p>Ojo con <span style="background-color: #ffff00">la fecha</span></p>');
    expect(resaltados(sanitizeEmailHtml(html).html)).toEqual([["la fecha", "#ffff00"]]);
  });
});

describe("en el compositor de verdad", () => {
  function editorEnPantalla(): Editor {
    const dom = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
    if (!dom?.editor) throw new Error("no se montó el editor");
    return dom.editor;
  }

  it("resaltar con la barra y enviar: el correo lleva el fondo en línea", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MailComposer abierto onCerrar={() => {}} remitente="yo@maven-ai.me" inicial={{ to: "ana@x.com" }} />
      </QueryClientProvider>,
    );
    await waitFor(() => editorEnPantalla());
    const ed = editorEnPantalla();
    act(() => {
      // Sin `focus()`: TipTap enfoca en el cuadro siguiente, y ese foco tardío
      // cerraría el menú de color que se abre después (foco afuera = se cierra).
      ed.commands.insertContent("Ojo con la fecha");
    });
    const desde = ed.getText().indexOf("la fecha") + 1;
    act(() => {
      ed.commands.setTextSelection({ from: desde, to: desde + "la fecha".length });
    });

    // El menú de color, como en Gmail: «Color de fondo» al lado de «Color de texto».
    fireEvent.click(screen.getByRole("button", { name: "Color del texto y de fondo" }));
    await screen.findByRole("group", { name: "Color de texto" });
    fireEvent.click(within(screen.getByRole("group", { name: "Color de fondo" })).getByTitle("#ffff00"));

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(envio.mutateAsync).toHaveBeenCalledTimes(1));
    const { html } = envio.mutateAsync.mock.calls[0][0] as { html: string };
    expect(html).not.toContain("<mark");
    expect(html).toMatch(/<span style="background-color: #ffff00;?">la fecha<\/span>/);
    // Y la copia que se guarda en Enviados (saneada) lo conserva.
    expect(resaltados(sanitizeEmailHtml(html).html)).toEqual([["la fecha", "#ffff00"]]);
  });

  it("«Sin resaltado» en la barra lo saca antes de enviar", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MailComposer
          abierto
          onCerrar={() => {}}
          remitente="yo@maven-ai.me"
          inicial={{ to: "ana@x.com", cuerpoHtml: '<p><span style="background-color: #ffff00">ya no</span></p>' }}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => editorEnPantalla());
    act(() => {
      editorEnPantalla().commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Color del texto y de fondo" }));
    await screen.findByRole("group", { name: "Color de fondo" });
    fireEvent.click(within(screen.getByRole("group", { name: "Color de fondo" })).getByRole("button", { name: "Sin resaltado" }));

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(envio.mutateAsync).toHaveBeenCalledTimes(1));
    const { html } = envio.mutateAsync.mock.calls[0][0] as { html: string };
    expect(html).toContain("ya no");
    expect(resaltados(html)).toEqual([]);
  });
});
