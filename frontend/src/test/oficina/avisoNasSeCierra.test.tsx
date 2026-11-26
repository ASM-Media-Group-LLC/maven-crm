import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// 26/11/2026 (Alvaro): el cuadro de «NAS caído» se cierra con la X; la franja se queda.
const salud = { caido: true, desde: "2026-11-25T12:00:00Z", pendientes: 8 };
vi.mock("@/hooks/useNasSalud", () => ({ useNasSalud: () => salud }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
import { AvisoNasCaido } from "@/components/oficina/AvisoNasCaido";

describe("aviso de NAS caído", () => {
  beforeEach(() => { localStorage.clear(); salud.desde = "2026-11-25T12:00:00Z"; });

  it("la X cierra el cuadro y la franja se queda", () => {
    render(<AvisoNasCaido />);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("drive.nas.cerrarCuadro"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("no vuelve en la misma caída, pero sí en una caída nueva", () => {
    const { unmount } = render(<AvisoNasCaido />);
    fireEvent.click(screen.getByLabelText("drive.nas.cerrarCuadro"));
    unmount();
    const r = render(<AvisoNasCaido />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    r.unmount();
    salud.desde = "2026-11-27T08:00:00Z";
    render(<AvisoNasCaido />);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
