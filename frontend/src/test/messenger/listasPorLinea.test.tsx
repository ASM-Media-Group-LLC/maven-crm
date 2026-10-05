import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { render, cleanup, act, waitFor, fireEvent, screen } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// LA LISTA TOMA LA LÍNEA, NO EL PÁRRAFO.
//
// Keila (02/10): escribe una intro y, con Shift+Enter, las líneas que quiere
// numerar. Al tocar «Lista numerada» se numeraba todo desde la primera palabra.
//
// En el Messenger, Enter envía, así que los renglones se hacen con Shift+Enter,
// que mete un salto (`hardBreak`) DENTRO del mismo párrafo. La lista del
// StarterKit envuelve el párrafo entero: la intro caía adentro. Lo esperado (como
// Google Chat/Docs) es que la lista tome solo la línea del cursor o las líneas
// seleccionadas, y que lo de antes y lo de después quede como texto normal.

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/pages/chatter-evaluator/workspace/EmojiBar", () => ({
  EmojiBar: () => null,
  usePersistedEmojis: () => [[], () => {}],
}));
vi.mock("@/pages/inbox/GifPicker", () => ({ GifPicker: () => null }));
vi.mock("@/pages/inbox/StickerPicker", () => ({ StickerPicker: () => null }));
vi.mock("@/components/chat/ScriptsButton", () => ({ ScriptsButton: () => null }));
vi.mock("@/pages/messenger/components/Expresiones", () => ({ default: () => null }));
vi.mock("@/pages/messenger/components/VoiceNoteRecorder", () => ({ default: () => null }));

import MessageInput from "@/pages/messenger/components/MessageInput";
import {
  ListaConVinetasPorLinea, ListaNumeradaPorLinea,
} from "@/pages/messenger/components/listasPorLinea";

/* ── Utilidades ─────────────────────────────────────────────────────────── */

/** El mismo juego de extensiones de listas que usa el cuadro del Messenger. */
function editorDelMessenger(html: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false }),
      ListaConVinetasPorLinea,
      ListaNumeradaPorLinea,
    ],
    content: html,
  });
}

/** El documento resumido: cada bloque como "p:texto" u "ol:[a|b]". Los saltos
 *  que queden dentro de un bloque se ven como "⏎". */
function forma(ed: Editor): string[] {
  const texto = (n: JSONContent): string =>
    n.type === "text" ? n.text ?? "" : n.type === "hardBreak" ? "⏎" : (n.content ?? []).map(texto).join("");
  return (ed.getJSON().content ?? []).map((b) => {
    if (b.type === "orderedList" || b.type === "bulletList") {
      const tipo = b.type === "orderedList" ? "ol" : "ul";
      const inicio = b.attrs?.start && b.attrs.start !== 1 ? `@${b.attrs.start}` : "";
      return `${tipo}${inicio}:[${(b.content ?? []).map(texto).join("|")}]`;
    }
    return `${b.type === "paragraph" ? "p" : b.type}:${texto(b)}`;
  });
}

/** Posición (en el documento) del principio de `palabra`. */
function posDe(ed: Editor, palabra: string): number {
  let encontrada = -1;
  ed.state.doc.descendants((n, pos) => {
    if (encontrada >= 0 || !n.isText) return;
    const i = n.text!.indexOf(palabra);
    if (i >= 0) encontrada = pos + i;
  });
  if (encontrada < 0) throw new Error(`no está «${palabra}»`);
  return encontrada;
}

/** Teclear un carácter como lo hace el navegador: pasando por las reglas de
 *  entrada («1. », «- »). */
function teclear(ed: Editor, texto: string) {
  for (const ch of texto) {
    const { view } = ed;
    const { from, to } = view.state.selection;
    const atendida = view.someProp("handleTextInput", (f) =>
      f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!atendida) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

/** Un párrafo con `texto` y un Shift+Enter al final, con el cursor en el
 *  renglón nuevo (vacío): justo donde queda Keila después de la intro. */
function conRenglonNuevo(texto: string): Editor {
  const ed = editorDelMessenger(`<p>${texto}</p>`);
  ed.chain().setTextSelection(ed.state.doc.content.size - 1).setHardBreak().run();
  return ed;
}

const INTRO = "<p>Pendientes de hoy:<br>Diego<br>Gabbie<br>Laota</p>";

afterEach(() => cleanup());

/* ── La causa ───────────────────────────────────────────────────────────── */

describe("la causa, con las listas del StarterKit", () => {
  it("numerar la línea del cursor numeraba también la intro (el bug)", () => {
    const ed = new Editor({ extensions: [StarterKit], content: INTRO });
    ed.chain().setTextSelection(posDe(ed, "Gabbie")).toggleOrderedList().run();
    expect(forma(ed)).toEqual(["ol:[Pendientes de hoy:⏎Diego⏎Gabbie⏎Laota]"]);
    ed.destroy();
  });
});

/* ── El botón ───────────────────────────────────────────────────────────── */

describe("el botón de lista toma solo la línea", () => {
  it("con el cursor en una línea, numera esa y nada más", () => {
    const ed = editorDelMessenger(INTRO);
    ed.chain().setTextSelection(posDe(ed, "Gabbie") + 2).toggleOrderedList().run();
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:⏎Diego", "ol:[Gabbie]", "p:Laota"]);
    // El cursor sigue donde estaba: dentro de «Gabbie», no al principio.
    expect(ed.state.selection.from).toBe(posDe(ed, "Gabbie") + 2);
    ed.destroy();
  });

  it("con varias líneas seleccionadas, una viñeta por línea", () => {
    const ed = editorDelMessenger(INTRO);
    ed.chain()
      .setTextSelection({ from: posDe(ed, "Diego") + 1, to: posDe(ed, "Laota") + 2 })
      .toggleOrderedList()
      .run();
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ol:[Diego|Gabbie|Laota]"]);
    ed.destroy();
  });

  it("una selección que llega justo al principio del renglón de abajo no lo incluye", () => {
    const ed = editorDelMessenger(INTRO);
    // De la «D» de Diego hasta el principio de «Gabbie» (después del salto).
    ed.chain()
      .setTextSelection({ from: posDe(ed, "Diego"), to: posDe(ed, "Gabbie") })
      .toggleBulletList()
      .run();
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ul:[Diego]", "p:Gabbie⏎Laota"]);
    ed.destroy();
  });

  it("en el renglón vacío después de la intro, la lista arranca ahí", () => {
    const ed = conRenglonNuevo("Pendientes de hoy:");
    ed.commands.toggleOrderedList();
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ol:[]"]);
    // Lo que se escribe después cae en la viñeta, no en la intro.
    ed.commands.insertContent("Diego");
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ol:[Diego]"]);
    ed.destroy();
  });

  it("numerar la línea de abajo la suma a la misma lista (2., no otro 1.)", () => {
    const ed = editorDelMessenger("<p>Pendientes de hoy:<br>Diego<br>Gabbie</p>");
    ed.chain().setTextSelection(posDe(ed, "Diego")).toggleOrderedList().run();
    ed.chain().setTextSelection(posDe(ed, "Gabbie")).toggleOrderedList().run();
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ol:[Diego|Gabbie]"]);
    ed.destroy();
  });

  it("sin saltos de línea se comporta como siempre", () => {
    const ed = editorDelMessenger("<p>Diego</p><p>Gabbie</p>");
    ed.chain().setTextSelection(posDe(ed, "Gabbie")).toggleBulletList().run();
    expect(forma(ed)).toEqual(["p:Diego", "ul:[Gabbie]"]);
    ed.destroy();
  });

  it("dentro de una lista, el botón la quita sin partir la viñeta", () => {
    const ed = editorDelMessenger("<ol><li><p>Diego<br>sigue aquí</p></li></ol>");
    ed.chain().setTextSelection(posDe(ed, "sigue")).toggleOrderedList().run();
    expect(forma(ed)).toEqual(["p:Diego⏎sigue aquí"]);
    ed.destroy();
  });

  it("el atajo de teclado usa la misma regla", () => {
    const ed = editorDelMessenger(INTRO);
    ed.commands.setTextSelection(posDe(ed, "Laota"));
    // Ctrl+Shift+7 (Cmd en Mac) llama a toggleOrderedList: el comando reemplazado.
    ed.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "7", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:⏎Diego⏎Gabbie", "ol:[Laota]"]);
    ed.destroy();
  });
});

/* ── «1. » y «- » al principio de una línea ─────────────────────────────── */

describe("«1. » y «- » al principio de una línea hecha con Shift+Enter", () => {
  it("«1. » arma la lista con esa línea y deja la intro afuera", () => {
    const ed = conRenglonNuevo("Pendientes de hoy:");
    teclear(ed, "1. Diego");
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ol:[Diego]"]);
    ed.destroy();
  });

  it("«- » arma viñetas igual", () => {
    const ed = conRenglonNuevo("Pendientes de hoy:");
    teclear(ed, "- Diego");
    expect(forma(ed)).toEqual(["p:Pendientes de hoy:", "ul:[Diego]"]);
    ed.destroy();
  });

  it("«3. » respeta el número", () => {
    const ed = conRenglonNuevo("Sigo la lista:");
    teclear(ed, "3. Laota");
    expect(forma(ed)).toEqual(["p:Sigo la lista:", "ol@3:[Laota]"]);
    ed.destroy();
  });

  it("si abajo hay más líneas, no se las lleva", () => {
    const ed = editorDelMessenger("<p>Intro<br><br>después</p>");
    // El cursor en el renglón vacío del medio.
    ed.commands.setTextSelection(posDe(ed, "Intro") + "Intro".length + 1);
    teclear(ed, "1. ");
    expect(forma(ed)).toEqual(["p:Intro", "ol:[]", "p:después"]);
    ed.destroy();
  });

  it("al principio del mensaje sigue andando como siempre", () => {
    const ed = editorDelMessenger("<p></p>");
    ed.commands.setTextSelection(1);
    teclear(ed, "1. Diego");
    expect(forma(ed)).toEqual(["ol:[Diego]"]);
    ed.destroy();
  });

  it("un «1. » en medio de una frase no arma nada", () => {
    const ed = editorDelMessenger("<p>Van</p>");
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    teclear(ed, " 1. y 2. ");
    expect(forma(ed)).toEqual(["p:Van 1. y 2. "]);
    ed.destroy();
  });
});

/* ── En el cuadro del Messenger de verdad ───────────────────────────────── */

describe("en el cuadro del Messenger", () => {
  // Armar una lista lleva el cursor a la vista (scrollIntoView), y para eso
  // ProseMirror mide un rango de texto con getClientRects, que jsdom no tiene.
  // Si el foco diferido de TipTap ya llegó al cuadro, la medida tiraba un error
  // suelto que tumbaba la corrida entera (solo a veces: depende del reloj).
  const rangoOriginal = {
    rects: Range.prototype.getClientRects,
    caja: Range.prototype.getBoundingClientRect,
  };
  beforeAll(() => {
    const vacio = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => vacio as DOMRect;
  });
  afterAll(() => {
    Range.prototype.getClientRects = rangoOriginal.rects;
    Range.prototype.getBoundingClientRect = rangoOriginal.caja;
  });

  function editorEnPantalla(container: HTMLElement): Editor {
    const dom = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
    if (!dom?.editor) throw new Error("no se montó el editor");
    return dom.editor;
  }

  it("la barra de formato numera solo la línea y el mensaje sale así", async () => {
    localStorage.clear();
    const enviados: Array<{ plano: string; rico: unknown }> = [];
    const { container } = render(
      <MessageInput
        conversationId="c-listas"
        onSendMessage={(plano, _t, _u, _n, _r, _a, _h, rico) => enviados.push({ plano, rico })}
        onSendTyping={() => {}}
        replyTo={null}
        profiles={{}}
        onCancelReply={() => {}}
      />,
    );
    await waitFor(() => editorEnPantalla(container));
    const ed = editorEnPantalla(container);

    // Lo que hace Keila: la intro, Shift+Enter, la línea a numerar.
    act(() => {
      ed.chain().focus().insertContent("Pendientes de hoy:").setHardBreak().insertContent("Diego").run();
    });
    // El foco de TipTap llega en el cuadro siguiente: se espera, como en la vida
    // real, para que el cursor esté de verdad en el cuadro al tocar la barra.
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(ed.isFocused).toBe(true);
    fireEvent.click(screen.getByTitle("Opciones de formato"));
    fireEvent.click(await screen.findByTitle("Lista numerada"));

    expect(container.querySelectorAll(".ProseMirror ol li")).toHaveLength(1);
    expect(container.querySelector(".ProseMirror ol li")?.textContent).toBe("Diego");
    expect(container.querySelector(".ProseMirror > p")?.textContent).toBe("Pendientes de hoy:");

    // Enter dentro de la lista no envía: hace la siguiente viñeta.
    act(() => { ed.commands.splitListItem("listItem"); ed.commands.insertContent("Gabbie"); });
    expect(container.querySelectorAll(".ProseMirror ol li")).toHaveLength(2);

    act(() => { ed.commands.keyboardShortcut("Mod-Enter"); });
    expect(enviados).toHaveLength(1);
    // El plano (vista previa, búsqueda) mete un salto por cada nivel de la
    // lista, como siempre; lo que importa es que la intro va APARTE.
    expect(enviados[0].plano).toMatch(/^Pendientes de hoy:\n+Diego\n+Gabbie$/);
    const rico = enviados[0].rico as JSONContent;
    expect(rico.content?.map((b) => b.type)).toEqual(["paragraph", "orderedList"]);
  });
});
