import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { KarmaProfile } from "@/pages/messenger/useKarmaProfile";

// Pedido de Jhon (03/09/2026): desde la lista de Personalizados, clic en un
// chatter abre esta ficha y debe poder "ir a Messenger y mandarle un mensaje";
// al llegar así, el chat muestra el botón de volver a la izquierda de la foto
// (lo arma MessengerPage con ?back=&backName=).

const navegado: string[] = [];
let ruta = "/personalizados";
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("react-router-dom", () => ({
  useNavigate: () => (to: string) => navegado.push(to),
  useLocation: () => ({ pathname: ruta, search: "" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let perfil: KarmaProfile;
vi.mock("@/pages/messenger/useKarmaProfile", async (original) => ({
  ...(await original<typeof import("@/pages/messenger/useKarmaProfile")>()),
  useKarmaProfile: () => ({ data: perfil, isLoading: false }),
  useSendKarma: () => ({ mutate: vi.fn(), isPending: false }),
}));

import ProfileCard from "@/pages/messenger/components/ProfileCard";

const base: KarmaProfile = {
  user_id: "u2", name: "Vanessa Giraldo", avatar_url: null, avatar_seed: null, role: "Chatter",
  email: "vanessa.giraldo@maven-ai.me", viewer_can_mail: false,
  stars: { rendimiento: false, actividad: true, constancia: true, productividad: false, companerismo: false },
  stars_count: 2, special: false, vote_pct: 30, viewer_has_sent: false, is_self: false, viewer_is_admin: false,
};

beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true });
});
beforeEach(() => { perfil = { ...base }; navegado.length = 0; ruta = "/personalizados"; });

const abrir = () => render(<ProfileCard userId="u2" onClose={() => {}} />);
const boton = () => screen.queryByRole("button", { name: /mandarle un mensaje/i });

describe("ficha de perfil · mandar mensaje", () => {
  it("desde Personalizados manda al DM con el volver puesto (y con el nombre de la pantalla)", () => {
    abrir();
    fireEvent.click(boton()!);
    expect(navegado).toHaveLength(1);
    const url = new URL(navegado[0], "https://maven.asmtech.ai");
    expect(url.pathname).toBe("/messenger");
    expect(url.searchParams.get("dm")).toBe("u2");
    expect(url.searchParams.get("back")).toBe("/personalizados");
    expect(url.searchParams.get("backName")).toBe("Personalizados");
  });

  it("estando ya en Messenger abre el DM sin volver (no tiene sentido volver a donde estás)", () => {
    ruta = "/messenger";
    abrir();
    fireEvent.click(boton()!);
    const url = new URL(navegado[0], "https://maven.asmtech.ai");
    expect(url.searchParams.get("dm")).toBe("u2");
    expect(url.searchParams.has("back")).toBe(false);
  });

  it("en la ficha propia no ofrece mandarse un mensaje a uno mismo", () => {
    perfil = { ...base, is_self: true };
    abrir();
    expect(boton()).not.toBeInTheDocument();
  });

  it("sin correo, la fila de contacto sigue existiendo por el botón de mensaje", () => {
    perfil = { ...base, email: null };
    abrir();
    expect(boton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiar correo/i })).not.toBeInTheDocument();
  });
});
