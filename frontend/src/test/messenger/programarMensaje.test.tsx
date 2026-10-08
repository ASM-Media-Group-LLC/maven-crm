import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, configure } from "@testing-library/react";
import { createRef } from "react";
import type { Editor } from "@tiptap/core";

// «PROGRAMAR ENVÍO» EN EL MESSENGER (Jhon, 08/10: como Google Chat).
//   · La pestañita pegada a Enviar programa EXACTAMENTE lo que se habría mandado
//     (mismos argumentos que onSendMessage), y no lo manda.
//   · Si la base dice que no (ya no está en el grupo), el texto se queda.
//   · Sin `onProgramar` (el panel de un hilo) no hay pestañita.
//   · El clic en Enviar sigue mandando: el evento no se cuela como «hora».

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

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

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

import MessageInput, { type MessageInputHandle } from "@/pages/messenger/components/MessageInput";
import { __reiniciarParaTests } from "@/pages/messenger/adjuntosDelBorrador";
import { getDraft } from "@/pages/messenger/drafts";
import {
  argsDeMensaje, docDelMensaje, mensajeDeArgs, sePuedeEditar,
} from "@/pages/messenger/programados";
import { opcionesDeProgramar } from "@/lib/programarEnvio";

describe("los mensajes de un programado", () => {
  it("ida y vuelta: los argumentos de onSendMessage → fila → los mismos argumentos", () => {
    const rich = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hola", marks: [{ type: "bold" }] }] }] };
    const m = mensajeDeArgs("hola", "text", undefined, undefined, "r1", undefined, undefined, rich);
    expect(m).toMatchObject({ content: "hola", type: "text", reply_to_id: "r1", content_rich: rich, is_thread_reply: false });
    expect(argsDeMensaje(JSON.parse(JSON.stringify(m)))).toEqual(["hola", "text", undefined, undefined, "r1", undefined, undefined, rich]);
  });

  it("se puede editar uno de texto; con archivos, no (ya están subidos)", () => {
    expect(sePuedeEditar([mensajeDeArgs("hola")])).toBe(true);
    expect(sePuedeEditar([mensajeDeArgs("foto", "image", "https://x/y.png", "y.png")])).toBe(false);
    expect(sePuedeEditar([mensajeDeArgs("a"), mensajeDeArgs("b")])).toBe(false);
  });

  it("vuelve al cajón con sus renglones (TipTap leería un string como HTML y los aplastaría)", () => {
    const doc = docDelMensaje(mensajeDeArgs("uno\n\ntres"));
    expect(doc.content?.map((p) => p.content?.[0]?.text ?? "")).toEqual(["uno", "", "tres"]);
  });
});

function montar(props: Partial<Parameters<typeof MessageInput>[0]> = {}) {
  const ref = createRef<MessageInputHandle>();
  const onSendMessage = vi.fn();
  const r = render(
    <MessageInput
      ref={ref}
      conversationId="c1"
      onSendMessage={onSendMessage}
      onSendTyping={() => {}}
      replyTo={null}
      profiles={{}}
      onCancelReply={() => {}}
      {...props}
    />,
  );
  return { ref, onSendMessage, ...r };
}

function editor(container: HTMLElement): Editor {
  const dom = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("no se montó el editor");
  return dom.editor;
}

async function escribir(container: HTMLElement, texto: string) {
  await waitFor(() => editor(container));
  act(() => { editor(container).commands.setContent(`<p>${texto}</p>`, true); });
}

beforeEach(() => {
  localStorage.clear();
  __reiniciarParaTests();
});
afterEach(() => cleanup());

describe("el cajón: la pestañita de «Programar envío»", () => {
  it("programa el texto para la hora elegida y NO lo manda; el cajón queda vacío", async () => {
    const onProgramar = vi.fn().mockResolvedValue(true);
    const { container, onSendMessage } = montar({ onProgramar });
    await escribir(container, "buenos días equipo");

    fireEvent.keyDown(screen.getByRole("button", { name: "Programar envío" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Mañana a las 8:00 a\. m\./ }));

    await waitFor(() => expect(onProgramar).toHaveBeenCalledTimes(1));
    const [mensajes, cuando] = onProgramar.mock.calls[0] as [Array<{ content: string; type: string }>, Date];
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatchObject({ content: "buenos días equipo", type: "text" });
    expect(cuando.toISOString()).toBe(opcionesDeProgramar()[0].cuando.toISOString());
    expect(onSendMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(editor(container).getText()).toBe(""));
    expect(getDraft("u1", "c1")).toBe("");
  });

  it("si no quedó programado (la base dijo que no), el texto se queda en el cajón", async () => {
    const onProgramar = vi.fn().mockResolvedValue(false);
    const { container } = montar({ onProgramar });
    await escribir(container, "no me borres");
    fireEvent.keyDown(screen.getByRole("button", { name: "Programar envío" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Mañana a la 1:00 p\. m\./ }));
    await waitFor(() => expect(onProgramar).toHaveBeenCalledTimes(1));
    expect(editor(container).getText()).toBe("no me borres");
  });

  it("⚠️ el clic en Enviar sigue MANDANDO (el evento no se cuela como hora de programar)", async () => {
    const onProgramar = vi.fn().mockResolvedValue(true);
    const { container, onSendMessage } = montar({ onProgramar });
    await escribir(container, "ya");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage.mock.calls[0][0]).toBe("ya");
    expect(onProgramar).not.toHaveBeenCalled();
  });

  it("sin onProgramar (el panel de un hilo) no hay pestañita", async () => {
    const { container } = montar();
    await escribir(container, "hola");
    expect(screen.queryByRole("button", { name: "Programar envío" })).toBeNull();
  });

  it("vacío, la pestañita está apagada como Enviar", async () => {
    const { container } = montar({ onProgramar: vi.fn() });
    await waitFor(() => editor(container));
    expect((screen.getByRole("button", { name: "Programar envío" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("«Editar» un programado lo vuelve a poner en el cajón, con sus renglones", async () => {
    const { container, ref } = montar({ onProgramar: vi.fn() });
    await waitFor(() => editor(container));
    act(() => { ref.current?.ponerParaEditar(docDelMensaje(mensajeDeArgs("uno\ndos"))); });
    expect(editor(container).getText({ blockSeparator: "\n" })).toBe("uno\ndos");
  });
});
