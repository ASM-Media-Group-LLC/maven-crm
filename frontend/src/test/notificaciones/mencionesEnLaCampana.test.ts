import { describe, it, expect } from "vitest";
import { getTypeIcon } from "@/lib/notificationHelpers";
import { CATALOGO_DE_EVENTOS } from "@/lib/catalogoDeEventos";
import { AtSign, Bell } from "lucide-react";

// LAS MENCIONES LLEGAN A LA CAMPANA; LOS MENSAJES NORMALES NO.
//
// Jhon se mencionó desde la cuenta test y no le llegó nada (16/09): el trigger
// las creaba como chat_message —igual que un "hola"— y la campana excluye
// chat_message a propósito. Ahora el trigger las marca chat_mention.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/components/notifications/NotificationBell.tsx", { query: "?raw", import: "default", eager: true });

describe("menciones en la campana", () => {
  it("la campana excluye SOLO chat_message; chat_mention entra", () => {
    const c = Object.values(fuentes)[0] ?? "";
    expect(c).toMatch(/n\.type === "chat_message"/);
    expect(c).not.toMatch(/n\.type === "chat_mention"/);
  });
  it("la mención tiene su icono (arroba), no la campana genérica", () => {
    expect(getTypeIcon("chat_mention")).toBe(AtSign);
    expect(getTypeIcon("algo_que_no_existe")).toBe(Bell);
  });
  it("está en el catálogo de eventos para que se pueda apagar", () => {
    const messenger = CATALOGO_DE_EVENTOS.find((m) => m.modulo === "Messenger");
    expect(messenger?.eventos.map((e) => e.type)).toEqual(expect.arrayContaining(["chat_message", "chat_mention"]));
  });
});
