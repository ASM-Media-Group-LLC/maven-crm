import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// EL BORRADOR TIENE QUE VOLVER COMO SE DEJÓ.
//
// Reporte del 28/09: "si yo tengo un mensaje con espacios y me salgo, cuando
// vuelvo me amontona todo el mensaje, y si tengo una imagen copiada y me salgo
// también me la borra". Dos causas:
//   1. El borrador se guardaba como texto plano ("\n" entre renglones) y se le
//      pasaba a TipTap como string. TipTap lo lee como HTML → "\n" = espacio.
//   2. Los adjuntos solo vivían en el estado del cajón, que se remonta al
//      cambiar de chat.

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "es" }) }));
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

import MessageInput, { type MessageInputHandle } from "@/pages/messenger/components/MessageInput";
import { getDraft, getDraftDoc, getDraftAttachmentCount, docDesdeTexto } from "@/pages/messenger/drafts";
import {
  __reiniciarParaTests, elegirParaDisco, cargarAdjuntos, guardarAdjuntos,
  TOPE_POR_ARCHIVO_BYTES, TOPE_TOTAL_BYTES,
} from "@/pages/messenger/adjuntosDelBorrador";

const LISTA = [
  "-Diegomineiro_xl - Tiene mucho contenido",
  "-Gabbielondon - Solicitado contenido para feed",
  "",
  "-laotacostena - Tiene Stock",
].join("\n");

function textoDelEditor(content: unknown) {
  const ed = new Editor({ extensions: [StarterKit], content: content as never });
  const t = ed.getText({ blockSeparator: "\n" });
  ed.destroy();
  return t;
}

function montar(conversationId = "c1") {
  const ref = createRef<MessageInputHandle>();
  const r = render(
    <MessageInput
      ref={ref}
      conversationId={conversationId}
      onSendMessage={() => {}}
      onSendTyping={() => {}}
      replyTo={null}
      profiles={{}}
      onCancelReply={() => {}}
    />,
  );
  return { ref, ...r };
}

function editorEnPantalla(container: HTMLElement): Editor {
  const dom = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("no se montó el editor");
  return dom.editor;
}

beforeEach(() => {
  localStorage.clear();
  __reiniciarParaTests();
  let n = 0;
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => `blob:prueba-${++n}`;
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});
afterEach(() => cleanup());

describe("la causa, en TipTap solo", () => {
  it("un string con \\n se aplasta en un renglón (el bug)", () => {
    expect(textoDelEditor(LISTA)).not.toContain("\n");
  });
  it("el documento convertido conserva cada renglón, incluido el vacío", () => {
    expect(textoDelEditor(docDesdeTexto(LISTA))).toBe(LISTA);
  });
});

describe("borrador de texto: salir y volver", () => {
  it("un borrador VIEJO (texto plano) vuelve con sus renglones", async () => {
    localStorage.setItem("mvn_chat_draft_u1_c1", LISTA);
    const { container } = montar();
    await waitFor(() => expect(container.querySelectorAll(".ProseMirror p").length).toBe(4));
    expect(editorEnPantalla(container).getText({ blockSeparator: "\n" })).toBe(LISTA);
    // La lista de chats sigue leyendo el texto plano de siempre.
    expect(getDraft("u1", "c1")).toBe(LISTA);
  });

  it("lo que se escribe se guarda con formato y vuelve igual tras remontar", async () => {
    const primero = montar();
    await waitFor(() => editorEnPantalla(primero.container));
    act(() => {
      editorEnPantalla(primero.container).commands.setContent(
        "<p><strong>Kathe</strong> revisé cada cc:</p><ul><li><p>Diego</p></li><li><p>Gabbie</p></li></ul>",
        true,
      );
    });
    // El plano (para la lista de chats) es el de getText; lo que importa es el documento.
    expect(getDraft("u1", "c1")).toMatch(/^Kathe revisé cada cc:\n+Diego\n+Gabbie$/);
    primero.unmount();

    const segundo = montar();
    await waitFor(() => expect(segundo.container.querySelectorAll(".ProseMirror li").length).toBe(2));
    expect(segundo.container.querySelector(".ProseMirror strong")?.textContent).toBe("Kathe");
  });

  it("un texto que empieza con { no se confunde con el formato nuevo", () => {
    localStorage.setItem("mvn_chat_draft_u1_c1", "{no es json");
    expect(getDraft("u1", "c1")).toBe("{no es json");
    expect(getDraftDoc("u1", "c1")).toEqual(docDesdeTexto("{no es json"));
  });
});

describe("adjuntos: salir y volver", () => {
  it("una captura pegada sigue ahí al volver al chat", async () => {
    const primero = montar();
    await act(async () => { await Promise.resolve(); });
    const captura = new File(["png"], "pasted-image.png", { type: "image/png" });
    act(() => primero.ref.current!.addFiles([captura]));
    await waitFor(() => expect(getDraftAttachmentCount("u1", "c1")).toBe(1));
    primero.unmount();

    const segundo = montar();
    const img = segundo.container.querySelector('img[alt="pasted-image.png"]');
    expect(img).not.toBeNull();
    // Y no se cuela en otra conversación.
    segundo.unmount();
    const otro = montar("c2");
    expect(otro.container.querySelector('img[alt="pasted-image.png"]')).toBeNull();
  });

  it("quitarla la olvida", async () => {
    const primero = montar();
    await act(async () => { await Promise.resolve(); });
    act(() => primero.ref.current!.addFiles([new File(["png"], "a.png", { type: "image/png" })]));
    await waitFor(() => expect(getDraftAttachmentCount("u1", "c1")).toBe(1));
    act(() => (primero.container.querySelector('[aria-label="messenger.input.quitarArchivo"]') as HTMLElement).click());
    await waitFor(() => expect(getDraftAttachmentCount("u1", "c1")).toBe(0));
    expect(await cargarAdjuntos("u1", "c1")).toEqual([]);
  });
});

describe("adjuntos: lo que se copia al disco", () => {
  const de = (bytes: number, nombre: string) => ({ size: bytes, name: nombre }) as File;

  it("un video enorme no se copia, pero la captura de al lado sí", () => {
    const video = de(TOPE_POR_ARCHIVO_BYTES + 1, "video.mp4");
    const captura = de(200_000, "captura.png");
    expect(elegirParaDisco([video, captura]).map((f) => f.name)).toEqual(["captura.png"]);
  });

  it("no se pasa del tope total", () => {
    const mitad = de(TOPE_TOTAL_BYTES / 2, "x");
    expect(elegirParaDisco([mitad, mitad, mitad]).length).toBe(2);
  });
});

describe("cuando IndexedDB no contesta", () => {
  it("leer los adjuntos se rinde con [] en vez de colgar el cajón", async () => {
    const abierto = { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null, result: null };
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: vi.fn(() => abierto) };
    vi.useFakeTimers();
    try {
      const pedido = cargarAdjuntos("u1", "sin-memoria");
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pedido).resolves.toEqual([]);
      // Y guardar tampoco se cuelga ni tira.
      const g = guardarAdjuntos("u1", "sin-memoria", [new File(["x"], "x.png", { type: "image/png" })]);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(g).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
      delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    }
  });
});
