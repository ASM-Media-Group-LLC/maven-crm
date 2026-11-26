import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CierreDiaArgos } from "@/harness/argos-cierre-dia";

const muestra = [
  {
    id: "revision",
    persona: "ana",
    titulo: "Documento por verificar",
    hora: "11:00",
    duracion: "8 min",
    revisar: true,
  },
  {
    id: "red",
    persona: "luis",
    titulo: "Pantalla recuperada",
    hora: "10:02",
    duracion: "1 min",
    recuperado: "10:03",
  },
];
const props = {
  fecha: "2026-11-24",
  hoy: "2026-11-25",
  episodios: muestra,
  decisiones: {},
  nombre: (id: string) => (id === "ana" ? "Ana Ejemplo" : "Luis Ejemplo"),
  abrirEpisodio: vi.fn(),
};

describe("Cierre histórico de Argos", () => {
  it("separa los pendientes de la actividad registrada y abre el episodio elegido", () => {
    const abrirEpisodio = vi.fn();
    render(<CierreDiaArgos {...props} abrirEpisodio={abrirEpisodio} />);
    const cierre = screen.getByRole("region", { name: "Cierre del día" });
    expect(within(cierre).getByText("2 registros de 2 personas")).toBeVisible();
    expect(
      within(cierre).getByRole("heading", { name: "Pendientes de revisión 1" }),
    ).toBeVisible();
    const episodio = within(cierre).getByRole("button", {
      name: /Documento por verificar/,
    });
    expect(episodio).toHaveTextContent("Ana Ejemplo");
    fireEvent.click(episodio);
    expect(abrirEpisodio).toHaveBeenCalledWith(muestra[0]);
    expect(
      within(cierre).getByRole("button", { name: /Pantalla recuperada/ }),
    ).toHaveTextContent(/Recuperación a las 10:03/);
  });

  it("conserva el episodio y permite abrirlo después de revisar un pendiente", () => {
    const abrirEpisodio = vi.fn();
    const { rerender } = render(
      <CierreDiaArgos {...props} abrirEpisodio={abrirEpisodio} />,
    );
    rerender(
      <CierreDiaArgos
        {...props}
        abrirEpisodio={abrirEpisodio}
        decisiones={{ revision: { resultado: "Justificada" } }}
      />,
    );
    expect(screen.getByText("Sin revisiones pendientes.")).toBeVisible();
    const revisado = screen.getByRole("button", {
      name: /Documento por verificar/,
    });
    expect(revisado).toHaveTextContent("justificada");
    fireEvent.click(revisado);
    expect(abrirEpisodio).toHaveBeenCalledWith(muestra[0]);
  });

  it("muestra un día anterior sin registros sin presentar cifras de asistencia", () => {
    render(<CierreDiaArgos {...props} episodios={[]} />);
    expect(screen.getByText(/Sin registros para esta fecha/)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /Pendientes de revisión/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("en fecha futura muestra planificación y no arrastra los episodios históricos", () => {
    render(<CierreDiaArgos {...props} fecha="2026-11-28" />);
    expect(
      screen.getByRole("heading", { name: "Planificación" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Documento por verificar"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Cierre del día" }),
    ).not.toBeInTheDocument();
  });
});
