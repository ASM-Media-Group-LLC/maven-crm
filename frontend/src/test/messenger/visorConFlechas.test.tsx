import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Jhon (28/09): «cuando me mandan varias imágenes y las visualizo en zoom, no
// tengo opciones para ir pasando de imágenes, tengo que salirme y seleccionar
// otra». El visor ahora conoce todas las fotos y videos del chat.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

import ImageLightbox from "@/pages/messenger/components/ImageLightbox";
import { mediaDelChat, type MediaDelChat } from "@/pages/messenger/galeriaDelChat";
import type { ChatMessage } from "@/pages/messenger/types";

const msg = (id: string, extra: Partial<ChatMessage>): ChatMessage => ({
  id, conversation_id: "c", sender_id: "u", content: null, type: "text",
  file_url: null, file_name: null, file_size: null, reply_to_id: null,
  created_at: "2026-09-28T10:00:00Z", is_deleted: false,
  ...extra,
} as ChatMessage);

describe("la galería del chat", () => {
  it("junta fotos, GIFs y videos EN ORDEN, y deja afuera texto, notas de voz, audios y archivos", () => {
    const g = mediaDelChat([
      msg("1", { type: "image", file_url: "https://x/a.jpg" }),
      msg("2", { content: "hola" }),
      msg("3", { type: "file", file_url: "https://x/voice.webm", file_name: "voice-note-1.webm" }),
      msg("4", { type: "file", file_url: "https://x/v.mp4", file_name: "video.mp4" }),
      msg("5", { type: "file", file_url: "https://x/cancion.mp3", file_name: "cancion.mp3" }),
      msg("6", { type: "file", file_url: "https://x/doc.pdf", file_name: "doc.pdf" }),
      msg("7", { type: "file", file_url: "https://media.giphy.com/x.mp4", file_name: "gif.mp4" }),
      msg("8", { type: "image", file_url: "https://x/b.gif" }),
    ]);
    expect(g.map((m) => [m.id, m.tipo])).toEqual([
      ["1", "image"], ["4", "video"], ["7", "video"], ["8", "image"],
    ]);
  });

  it("una foto borrada no entra: en el chat ya no se ve", () => {
    expect(mediaDelChat([msg("1", { type: "image", file_url: "https://x/a.jpg", is_deleted: true })])).toEqual([]);
  });
});

describe("el visor con flechas", () => {
  const galeria: MediaDelChat[] = [
    { id: "1", src: "https://x/1.jpg", tipo: "image", nombre: "1.jpg" },
    { id: "2", src: "https://x/2.jpg", tipo: "image", nombre: "2.jpg" },
    { id: "3", src: "https://x/3.mp4", tipo: "video", nombre: "3.mp4" },
  ];
  const abrir = (src: string) =>
    render(<ImageLightbox src={src} isOpen onClose={() => {}} galeria={galeria} />);
  const mostrando = () =>
    (document.querySelector("img[src], video[src]") as HTMLImageElement | HTMLVideoElement).getAttribute("src");

  it("arranca en la que se tocó y dice cuál de cuántas", () => {
    abrir("https://x/2.jpg");
    expect(mostrando()).toBe("https://x/2.jpg");
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
  });

  it("→ y ← pasan de foto, con los botones y con el teclado", () => {
    abrir("https://x/1.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(mostrando()).toBe("https://x/2.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    // El tercero es un video: el visor cambia a <video>.
    expect(document.querySelector("video")?.getAttribute("src")).toBe("https://x/3.mp4");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mostrando()).toBe("https://x/2.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(mostrando()).toBe("https://x/1.jpg");
  });

  it("no da la vuelta: en la primera no hay ←, en la última no hay →", () => {
    abrir("https://x/1.jpg");
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mostrando()).toBe("https://x/1.jpg");
  });

  it("cada foto arranca sin el zoom de la anterior", () => {
    abrir("https://x/1.jpg");
    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("⚠️ tocar una flecha NO cierra el visor (el fondo sí lo cierra)", () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://x/1.jpg" isOpen onClose={onClose} galeria={galeria} />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sin galería (o con una sola) queda como antes: sin flechas ni contador", () => {
    render(<ImageLightbox src="https://x/1.jpg" isOpen onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
    expect(screen.queryByText(/de 1/)).not.toBeInTheDocument();
  });
});
