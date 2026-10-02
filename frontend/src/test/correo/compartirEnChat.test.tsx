import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, configure } from "@testing-library/react";

// «Compartir en el chat» (Keila, 02/10): se elige una conversación del
// Messenger y se publica el correo ahí (quién, asunto, fecha, resumen y el
// enlace para abrirlo en Maven). Solo se ofrecen las conversaciones donde
// puedo escribir.

configure({ asyncUtilTimeout: 5000 });

const e = vi.hoisted(() => ({
  insertados: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  avisos: [] as string[],
}));

vi.mock("sonner", () => ({
  toast: { success: (m: string) => e.avisos.push(m), error: (m: string) => e.avisos.push(`error:${m}`) },
}));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/lib/getPublicUrl", () => ({ getPublicBaseUrl: () => "https://app.maven-ai.me" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        e.insertados.push({ tabla, ...fila });
        return Promise.resolve({ error: e.error });
      },
      update: () => ({ eq: () => ({ then: (f: () => void) => f() }) }),
    }),
  },
}));
const conv = (id: string, displayName: string, over: Record<string, unknown> = {}) => ({
  id, displayName, type: "direct", avatar_url: null, unreadCount: 0,
  participants: [{ user_id: "yo", role: "member" }, { user_id: `otro-${id}`, role: "member", profile: null }],
  ...over,
});
vi.mock("@/hooks/ChatProvider", () => ({
  useChatShared: () => ({
    loading: false,
    conversations: [
      conv("c1", "Andrés Gómez"),
      conv("c2", "Contabilidad", { type: "group" }),
      // Grupo donde solo escriben los admins y yo no lo soy: no se ofrece.
      conv("c3", "Anuncios", { type: "group", msg_permission: "admins" }),
    ],
  }),
}));

import CompartirEnChatDialog from "@/components/correo/CompartirEnChatDialog";

const CORREO = {
  de: "Ana <ana@x.com>", asunto: "Contrato", fecha: "2026-09-30T10:00:00", resumen: "Te mando el contrato",
  messageId: "<c@x>",
};

beforeEach(() => {
  e.insertados.length = 0;
  e.avisos.length = 0;
  e.error = null;
});

describe("«Compartir en el chat»", () => {
  it("solo ofrece donde puedo escribir, y busca sin tildes", () => {
    render(<CompartirEnChatDialog correo={CORREO} onCerrar={vi.fn()} />);
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual(["Andrés Gómez", "Contabilidad"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar conversación…" }), { target: { value: "andres" } });
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual(["Andrés Gómez"]);
  });

  it("publica el correo en la conversación elegida, con la nota y el enlace", async () => {
    const onCerrar = vi.fn();
    render(<CompartirEnChatDialog correo={CORREO} onCerrar={onCerrar} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("option", { name: "Contabilidad" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Escribe un mensaje (opcional)" }), { target: { value: "Para pagar" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(e.insertados).toHaveLength(1);
    const fila = e.insertados[0];
    expect(fila).toMatchObject({ tabla: "chat_messages", conversation_id: "c2", sender_id: "yo", type: "text" });
    expect(String(fila.content).split("\n")).toEqual([
      "Para pagar", "", "Correo compartido", "De: Ana <ana@x.com>", "Asunto: Contrato",
      "Fecha: 30 de septiembre de 2026, 10:00", "", "«Te mando el contrato»", "",
      "Abrir en Maven: https://app.maven-ai.me/correo?mensaje=%3Cc%40x%3E",
    ]);
    expect(e.avisos).toEqual(["Compartido en Contabilidad"]);
  });

  it("si la base lo rechaza, avisa y no se cierra", async () => {
    e.error = { message: "permission denied" };
    const onCerrar = vi.fn();
    render(<CompartirEnChatDialog correo={CORREO} onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole("option", { name: "Andrés Gómez" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(e.avisos).toEqual(["error:No se pudo compartir"]));
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
