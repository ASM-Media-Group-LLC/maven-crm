// Contrato: el patrón lista→chat del Messenger corta en el MISMO umbral que
// useIsMobile y el Sheet del sidebar (md = 768). Con `sm` (640), entre 640 y
// 767 px se veían dos columnas de 280 px con el menú ya en modo teléfono.
import { describe, it, expect } from "vitest";
import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";

const fuentes = import.meta.glob("../../pages/messenger/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const leer = (sufijo: string) => {
  const k = Object.keys(fuentes).find((f) => f.endsWith(sufijo));
  if (!k) throw new Error(`no encontré ${sufijo}`);
  return fuentes[k];
};

describe("breakpoint lista→chat", () => {
  it("useIsMobile corta en 768", () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
  });
  it("MessengerPage usa md para ocultar/mostrar lista y chat, no sm", () => {
    const src = leer("MessengerPage.tsx");
    expect(src).toContain("hidden md:flex md:flex-col");
    expect(src).toContain('!activeChatId ? "hidden md:flex" : "flex"');
    expect(src).not.toMatch(/hidden sm:flex/);
    expect(src).not.toMatch(/sm:w-\[280px\]/);
  });
  it("el botón Volver del chat se esconde desde md", () => {
    const src = leer("components/ChatHeader.tsx");
    const boton = src.slice(src.indexOf('aria-label="Volver a la lista de chats"'), src.indexOf("onClick={onBack}"));
    expect(boton).toContain("md:hidden");
    expect(boton).not.toContain("sm:hidden");
  });
});
