import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup, act, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";

// MENCIONAR CON @ EN EL CORREO, DE PUNTA A PUNTA, COMO EN GMAIL.
//
// Keila (02/10) preguntó por esto y ya existía (#1841): escribir @ y un nombre en
// el cuerpo ofrece personas; elegir una la SUMA a «Para» y deja «@Nombre» en el
// texto. Los tests de mencionesEnElCorreo.test.ts miran el detector y el
// buscador por separado; estos montan el compositor de verdad y siguen el camino
// entero: teclear, elegir (con el ratón y con Enter), ver a la persona en «Para»
// y que al enviar viaje en `menciones`.

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
vi.mock("@/hooks/useDirectorioCorreo", async (original) => {
  const persona = (user_id: string, nombre: string, email_address: string) =>
    ({ user_id, nombre, email_address, avatar_seed: null, avatar_url: null });
  const gente = [
    persona("yo", "Keila Rojas", "keila@maven-ai.me"),
    persona("1", "Fabiana Durán", "fabiana.duran@unlok.me"),
    persona("2", "Daniel Ospina", "daniel.ospina@unlok.me"),
  ];
  return {
    ...(await original<typeof import("@/hooks/useDirectorioCorreo")>()),
    useDirectorioCorreo: () => ({ data: gente }),
  };
});
vi.mock("@/components/UserAvatar", () => ({ UserAvatar: () => null }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import { MailComposer } from "@/components/correo/MailComposer";

function montar(inicial?: Parameters<typeof MailComposer>[0]["inicial"], firma?: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MailComposer abierto onCerrar={() => {}} remitente="keila@maven-ai.me" inicial={inicial} firma={firma} />
    </QueryClientProvider>,
  );
}

function editorEnPantalla(): Editor {
  const dom = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("no se montó el editor");
  return dom.editor;
}

/** Lo que hay en «Para», tal como lo ve la persona: un chip por dirección. */
function chipsDePara(): string[] {
  const fila = document.getElementById("mail-to")!.parentElement!;
  return Array.from(fila.querySelectorAll("span[title]")).map((s) => s.getAttribute("title") ?? "");
}

beforeEach(() => {
  localStorage.clear();
  envio.mutateAsync.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

describe("mencionar con @ en el cuerpo del correo", () => {
  it("@ + nombre ofrece a la persona; elegirla la suma a «Para» y deja la mención", async () => {
    montar();
    await waitFor(() => editorEnPantalla());
    const ed = editorEnPantalla();

    act(() => { ed.commands.insertContent("Hola @fab"); });
    const lista = await screen.findByRole("listbox", { name: "Personas para mencionar" });
    // La lista vive dentro de la hoja blanca (que fija la letra en gris oscuro):
    // sin su propio color de letra, en el tema oscuro se leía oscuro sobre oscuro.
    expect(lista).toHaveClass("text-popover-foreground");
    expect(within(lista).getByText("Se suma al correo y le llega un aviso")).toBeInTheDocument();

    fireEvent.click(within(lista).getByRole("option", { name: /Fabiana Durán/ }));

    await waitFor(() => expect(chipsDePara()).toEqual(["fabiana.duran@unlok.me"]));
    expect(ed.getText()).toBe("Hola @Fabiana Durán ");
    expect(screen.queryByRole("listbox", { name: "Personas para mencionar" })).toBeNull();
    expect(
      screen.getByText("Se sumó Fabiana Durán a este correo: lo recibe y le llega un aviso en Maven."),
    ).toBeInTheDocument();

    // Al enviar, va a «Para» y a la lista de mencionados (el aviso dentro de Maven).
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(envio.mutateAsync).toHaveBeenCalledTimes(1));
    const correo = envio.mutateAsync.mock.calls[0][0] as { to: string[]; menciones: string[]; html: string };
    expect(correo.to).toEqual(["fabiana.duran@unlok.me"]);
    expect(correo.menciones).toEqual(["1"]);
    expect(correo.html).toContain("@Fabiana Durán");
  });

  it("con el teclado: Enter elige a la persona y NO parte el renglón", async () => {
    montar({ to: "ana@x.com" });
    await waitFor(() => editorEnPantalla());
    const ed = editorEnPantalla();

    act(() => { ed.commands.insertContent("Te paso con @osp"); });
    await screen.findByRole("listbox", { name: "Personas para mencionar" });
    fireEvent.keyDown(ed.view.dom, { key: "Enter" });

    await waitFor(() => expect(chipsDePara()).toEqual(["ana@x.com", "daniel.ospina@unlok.me"]));
    expect(ed.getText()).toBe("Te paso con @Daniel Ospina ");
    // Un solo párrafo: el Enter fue para elegir, no para bajar de renglón.
    expect(ed.getJSON().content).toHaveLength(1);
  });

  it("no se ofrece a uno mismo, y alguien que ya está en «Para» no se duplica", async () => {
    montar({ to: "fabiana.duran@unlok.me" });
    await waitFor(() => editorEnPantalla());
    const ed = editorEnPantalla();

    act(() => { ed.commands.insertContent("@"); });
    const lista = await screen.findByRole("listbox", { name: "Personas para mencionar" });
    expect(within(lista).queryByText("Keila Rojas")).toBeNull();
    fireEvent.click(within(lista).getByRole("option", { name: /Fabiana Durán/ }));

    await waitFor(() => expect(ed.getText()).toBe("@Fabiana Durán "));
    expect(chipsDePara()).toEqual(["fabiana.duran@unlok.me"]);
  });

  it("escribir una dirección no abre el buscador", async () => {
    montar();
    await waitFor(() => editorEnPantalla());
    act(() => { editorEnPantalla().commands.insertContent("escríbele a fabiana@unlok"); });
    expect(screen.queryByRole("listbox", { name: "Personas para mencionar" })).toBeNull();
  });
});

describe("cómo se descubre", () => {
  it("la ayuda del cuerpo vacío cuenta lo del @", async () => {
    montar();
    await waitFor(() => editorEnPantalla());
    const primero = document.querySelector(".ProseMirror p");
    expect(primero?.getAttribute("data-placeholder")).toMatch(/@/);
  });

  it("con firma, la ayuda sigue en la primera línea (index.css la muestra ahí)", async () => {
    montar(undefined, "<p>—<br>Keila</p>");
    await waitFor(() => editorEnPantalla());
    const primero = document.querySelector(".ProseMirror > p:first-child");
    expect(primero).toHaveClass("is-empty");
    expect(primero?.getAttribute("data-placeholder")).toMatch(/@/);
  });
});
