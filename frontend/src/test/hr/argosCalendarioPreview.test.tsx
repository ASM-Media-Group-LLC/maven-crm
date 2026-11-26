import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarioArgos } from "@/harness/argos-calendario";

function Jornada() {
  const hoy = "2026-12-31";
  const [fecha, alCambiar] = useState(hoy);
  return (
    <CalendarioArgos
      hoy={hoy}
      fecha={fecha}
      pendientes={{ "2026-12-30": 2, "2026-12-31": 3, "2027-01-01": 1 }}
      alCambiar={alCambiar}
    />
  );
}

describe("Calendario del resumen de Argos", () => {
  it("abre en Hoy, identifica los cierres con pendientes y permite regresar desde ayer", () => {
    render(<Jornada />);
    const semana = within(
      screen.getByRole("navigation", { name: "Semana de la jornada" }),
    );
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeInTheDocument();
    expect(
      semana.getAllByRole("button", { name: /pendientes por revisar/i }),
    ).toHaveLength(1);
    const hoy = semana.getByRole("button", { current: "date" });
    expect(hoy).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      semana.getByRole("button", { name: /miércoles, 30.*pendientes/i }),
    );
    expect(
      screen.getByRole("heading", { name: /miércoles 30/i }),
    ).toBeInTheDocument();
    expect(hoy).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Volver a hoy" }));
    expect(hoy).toHaveAttribute("aria-pressed", "true");
  });

  it("mueve la semana aunque atraviese un cambio de año", () => {
    render(<Jornada />);
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(
      screen.getByRole("button", {
        name: /jueves, 7 de enero de 2027/i,
        pressed: true,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeInTheDocument();
  });

  it("permite elegir una fecha de otro mes y devuelve el foco al disparador", async () => {
    render(<Jornada />);
    const abrir = screen.getByRole("button", { name: "Abrir calendario" });
    fireEvent.click(abrir);
    const calendario = within(
      await screen.findByRole("dialog", { name: "Calendario de la jornada" }),
    );
    expect(abrir).toHaveAttribute("aria-expanded", "true");
    expect(
      calendario.getByRole("gridcell", { name: /miércoles, 30.*pendientes/i }),
    ).toBeInTheDocument();
    fireEvent.click(calendario.getByRole("button", { name: "Mes siguiente" }));
    fireEvent.click(
      calendario.getByRole("gridcell", {
        name: /viernes, 15 de enero de 2027/i,
      }),
    );
    expect(
      screen.getByRole("heading", { name: /viernes 15/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(abrir).toHaveFocus());
    expect(abrir).toHaveAttribute("aria-expanded", "false");
  });

  it("permite cerrar con Escape sin cambiar el día", async () => {
    render(<Jornada />);
    const abrir = screen.getByRole("button", { name: "Abrir calendario" });
    fireEvent.click(abrir);
    const calendario = await screen.findByRole("dialog", {
      name: "Calendario de la jornada",
    });
    fireEvent.keyDown(calendario, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(abrir).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeInTheDocument();
  });
});
