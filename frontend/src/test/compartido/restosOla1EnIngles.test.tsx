// Los restos que encontró la revisión de la ola 1 de traducción, en INGLÉS:
// pantallas ya traducidas que todavía mostraban una palabra en español o una
// traducción que no decía lo que hacía el botón.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { fijarIdioma, getTranslation } from "@/lib/i18n";
import Expresiones from "@/pages/messenger/components/Expresiones";
import { VolumeControl } from "@/pages/chatter-evaluator/workspace/VolumeControl";
import { EMOJI_CATALOG } from "@/pages/chatter-evaluator/workspace/EmojiBar";

// El control de volumen "desbloquea" el audio con play() al primer clic; jsdom no
// reproduce nada.
Object.defineProperty(HTMLMediaElement.prototype, "play", { value: () => Promise.resolve(), configurable: true });
Object.defineProperty(HTMLMediaElement.prototype, "pause", { value: () => {}, configurable: true });

const montar = (nodo: React.ReactNode, idioma: "es" | "en") => {
  localStorage.setItem("app-language", idioma);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>{nodo}</LanguageProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.removeItem("app-language");
  fijarIdioma("es");
});

describe("Messenger → Expresiones: los títulos del catálogo de emojis", () => {
  // Desde el 02/10 la pestaña de emojis es el selector de Google
  // (components/chat/SelectorDeEmojis), con sus nueve categorías.
  it("en inglés se leen traducidos; las llaves del catálogo del evaluador no cambian", async () => {
    montar(<Expresiones favoritos={["🦄"]} onEmoji={() => {}} onGif={() => {}} onSticker={() => {}} />, "en");
    fireEvent.click(screen.getByTestId("expresiones"));
    expect(await screen.findByText("Smileys & emotion")).toBeInTheDocument();
    // Las otras categorías llegan un cuadro después (primero se dibuja lo que se ve).
    for (const titulo of ["Frequently used", "People & body", "Animals & nature", "Food & drink", "Flags"]) {
      expect(await screen.findByText(titulo)).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText("Search emoji")).toBeInTheDocument();
    for (const enEspanol of ["Uso frecuente", "Caras y emociones", "Banderas"]) {
      expect(screen.queryByText(enEspanol)).toBeNull();
    }
    // La llave es dato (la comparte el evaluador): sigue en español.
    expect(Object.keys(EMOJI_CATALOG)).toEqual(["Caras", "Amor", "Cuerpo", "Gestos", "Objetos", "Otros"]);
  });

  it("en español, en español", async () => {
    montar(<Expresiones favoritos={[]} onEmoji={() => {}} onGif={() => {}} onSticker={() => {}} />, "es");
    fireEvent.click(screen.getByTestId("expresiones"));
    expect(await screen.findByText("Caras y emociones")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar emojis")).toBeInTheDocument();
  });
});

describe("Evaluador → control de volumen", () => {
  it("el botón y la barra se leen en inglés", () => {
    montar(<VolumeControl />, "en");
    const boton = screen.getByRole("button", { name: "Sound" });
    expect(boton).toHaveAttribute("title", "Mute");
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("title", "Unmute");
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
  });

  it("en español, los de siempre", () => {
    localStorage.removeItem("maven.chatter.soundVolume");
    montar(<VolumeControl />, "es");
    expect(screen.getByRole("button", { name: "Sonido" })).toHaveAttribute("title", "Silenciar");
  });
});

describe("las traducciones que no decían lo que hace el botón", () => {
  const en = (k: Parameters<typeof getTranslation>[0], p?: Record<string, string | number>) => getTranslation(k, "en", p);
  it("dicen lo que hacen", () => {
    // Llamada: sacar a alguien es "Remove" (no "Delete"); volver al zoom normal.
    expect(en("messenger.tile.quitarDeLaLlamada")).toBe("Remove");
    expect(en("messenger.tile.verCompleta")).toBe("Reset zoom");
    // Promolog: la hora de la promo, y el contador de historias sin promo.
    expect(en("promolog.time")).toBe("Time");
    expect(en("promolog.notPromotedCount", { count: 3 })).toBe("3 not promoted");
    // Tickets: lo que se agrega es otra prueba, no otro link.
    expect(en("tickets.form.addEvidence")).toBe("Add another proof");
    expect(en("contactos.channelFallback")).toBe("Channel");
  });
});
