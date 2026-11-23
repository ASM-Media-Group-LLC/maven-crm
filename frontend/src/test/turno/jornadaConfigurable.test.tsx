import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const { config, acciones, turno } = vi.hoisted(() => ({
  config: { configurada: true, registra_horas: true, registra_comida: false, registra_bano: false, requiere_terminos: false },
  acciones: { entrar: { mutate: vi.fn() }, pausar: { mutate: vi.fn() }, retomar: { mutate: vi.fn() } },
  turno: { aplica: true, abierta: true, puede: true, turno_fin: null, marca_inicio: "2026-11-23T12:00:00Z", en_pausa: false, pausa_usada_seg: 0, cupo_seg: 3600 },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "persona" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/useMiTurno", () => ({ useMiTurno: () => ({ data: turno }), useAccionesTurno: () => ({ entrar: acciones.entrar, salir: { mutate: vi.fn() }, sigo: { mutate: vi.fn() } }) }));
vi.mock("@/hooks/useJornada", () => ({ useJornadaConfig: () => ({ data: config }), useJornadaAcciones: () => acciones }));
vi.mock("@/hooks/usePausas", () => ({ useMiPausa: () => ({ data: { comida: 60, bano: 10 } }) }));
vi.mock("@/components/turno/RegistrosJornada", () => ({ RegistrosJornada: () => <div /> }));
vi.mock("@/lib/ahoraCompartido", () => ({ useAhoraCadaSegundo: () => Date.parse("2026-11-23T13:00:00Z") }));
import { TurnoEnMenu } from "@/components/turno/TurnoEnMenu";
beforeEach(() => { cleanup(); vi.clearAllMocks(); config.registra_comida = false; config.registra_bano = false; turno.en_pausa = false; turno.abierta = true; config.requiere_terminos = false; });
describe("Jornada configurable para administradores y consultores", () => {
  it("marcar horas de administrador no acepta términos de monitoreo ocultos", () => {
    turno.abierta = false;
    render(<MemoryRouter><TurnoEnMenu /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cowork.turno.marcarEntrada" }));
    expect(screen.getByText("cowork.jornada.aviso")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "cowork.turno.marcarEntrada" }).at(-1)!);
    expect(acciones.entrar.mutate).toHaveBeenCalledWith({ aceptarTerminos: false }, expect.any(Object));
  });
  it("quien está sujeto al aviso debe verlo y aceptarlo explícitamente", () => {
    turno.abierta = false;
    config.requiere_terminos = true;
    render(<MemoryRouter><TurnoEnMenu /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "cowork.turno.marcarEntrada" }));
    expect(screen.getByText("cowork.turno.aviso.pantalla")).toBeInTheDocument();
    const entrar = screen.getByRole("button", { name: "cowork.turno.aceptarYEntrar" });
    expect(entrar).toBeDisabled();
    expect(acciones.entrar.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "cowork.turno.terminos.acepto" }));
    fireEvent.click(entrar);
    expect(acciones.entrar.mutate).toHaveBeenCalledWith({ aceptarTerminos: true }, expect.any(Object));
  });
  it("consultor conserva salida y no muestra pausa ni afirma que comparte pantalla", () => {
    render(<MemoryRouter><TurnoEnMenu /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "cowork.turno.salida" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cowork.turno.pausa" })).not.toBeInTheDocument();
    expect(screen.queryByText("cowork.turno.seComparte")).not.toBeInTheDocument();
    expect(screen.getByText("cowork.jornada.registrando")).toBeInTheDocument();
  });
  it("comida habilita un menú que excluye baño", () => {
    config.registra_comida = true;
    render(<MemoryRouter><TurnoEnMenu /></MemoryRouter>);
    fireEvent.pointerDown(screen.getByRole("button", { name: "cowork.turno.pausa" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    // Radix también admite teclado; se prueba el menú accesible real.
    fireEvent.keyDown(screen.getByRole("button", { name: "cowork.turno.pausa" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "cowork.turno.pausaComida" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "cowork.turno.pausaBano" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "cowork.turno.pausaComida" }));
    expect(acciones.pausar.mutate).toHaveBeenCalledWith("almuerzo", expect.any(Object));
  });
});
