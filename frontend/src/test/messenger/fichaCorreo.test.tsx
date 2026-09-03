import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { KarmaProfile } from "@/pages/messenger/useKarmaProfile";

// La ficha del Messenger ahora muestra el correo (pedido de Jhon, 02/09/2026):
// clic en el chip = copiar la dirección completa; el lápiz "escribirle" solo
// aparece si quien mira puede mandar correo desde Maven y no es su propia ficha.

const navegado: string[] = [];
vi.mock("react-router-dom", () => ({
  useNavigate: () => (to: string) => navegado.push(to),
  useLocation: () => ({ pathname: "/messenger", search: "" }),
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toasts.push(`ok:${m}`), error: (m: string) => toasts.push(`err:${m}`) },
}));

let perfil: KarmaProfile;
vi.mock("@/pages/messenger/useKarmaProfile", async (original) => ({
  ...(await original<typeof import("@/pages/messenger/useKarmaProfile")>()),
  useKarmaProfile: () => ({ data: perfil, isLoading: false }),
  useSendKarma: () => ({ mutate: vi.fn(), isPending: false }),
}));

import ProfileCard from "@/pages/messenger/components/ProfileCard";

const base: KarmaProfile = {
  user_id: "u2", name: "Vanessa Giraldo", avatar_url: null, avatar_seed: null, role: "Chatter",
  email: "vanessa.giraldo@maven-ai.me", viewer_can_mail: true,
  stars: { rendimiento: false, actividad: true, constancia: true, productividad: false, companerismo: false },
  stars_count: 2, special: false, vote_pct: 30, viewer_has_sent: false, is_self: false, viewer_is_admin: false,
};

let copiado: string[] = [];
beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (t: string) => { copiado.push(t); return Promise.resolve(); } },
    configurable: true,
  });
});
beforeEach(() => { perfil = { ...base }; copiado = []; toasts.length = 0; navegado.length = 0; });

const abrir = () => render(<ProfileCard userId="u2" onClose={() => {}} />);

describe("ficha del Messenger · correo", () => {
  it("muestra el correo y al hacer clic copia la dirección completa", async () => {
    abrir();
    const chip = screen.getByRole("button", { name: /copiar correo/i });
    expect(chip.textContent).toContain("vanessa.giraldo@maven-ai.me");
    fireEvent.click(chip);
    await waitFor(() => expect(copiado).toEqual(["vanessa.giraldo@maven-ai.me"]));
    expect(toasts).toContain("ok:Correo copiado");
    // Confirmación visible en el propio chip.
    await waitFor(() => expect(screen.getByText("Correo copiado")).toBeInTheDocument());
  });

  it("el lápiz abre el correo de Maven con el destinatario puesto", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /escribirle un correo/i }));
    expect(navegado).toEqual(["/correo?to=vanessa.giraldo%40maven-ai.me"]);
  });

  it("sin casilla propia (o sin el módulo Correo) queda solo copiar", () => {
    perfil = { ...base, viewer_can_mail: false };
    abrir();
    expect(screen.getByRole("button", { name: /copiar correo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /escribirle un correo/i })).not.toBeInTheDocument();
  });

  it("en la ficha propia no ofrece escribirse a sí mismo, pero sí copiar", () => {
    perfil = { ...base, is_self: true };
    abrir();
    expect(screen.getByRole("button", { name: /copiar correo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /escribirle un correo/i })).not.toBeInTheDocument();
  });

  it("si la persona no tiene correo, no se dibuja la fila", () => {
    perfil = { ...base, email: null };
    abrir();
    expect(screen.queryByRole("button", { name: /copiar correo/i })).not.toBeInTheDocument();
  });

  it("si el portapapeles falla, avisa y muestra la dirección", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denegado")) }, configurable: true,
    });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /copiar correo/i }));
    await waitFor(() => expect(toasts).toContain("err:No se pudo copiar"));
    expect(screen.queryByText("Correo copiado")).not.toBeInTheDocument();
  });
});
