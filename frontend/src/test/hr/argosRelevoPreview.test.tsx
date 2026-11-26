import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelevoArgos } from "@/harness/argos-relevo";

const personas = [
  { id: "camila", nombre: "Carmen Ejemplo", turno: "AM" },
  { id: "lucia", nombre: "Luz Ejemplo", turno: "PM" },
  { id: "mateo", nombre: "Manuel Ejemplo", turno: "PM" },
  { id: "ines", nombre: "Irene Ejemplo", turno: "PM" },
  { id: "nora", nombre: "Nuria Ejemplo", turno: "PM" },
];

const episodios = [
  {
    id: "abierto",
    persona: "camila",
    titulo: "Pantalla en revisión",
    hora: "15:10",
    tipo: "Hub",
    revisar: true,
    responsable: "Jefa de turno",
  },
  {
    id: "recuperado",
    persona: "camila",
    titulo: "Conexión recuperada",
    hora: "10:08",
    tipo: "Conexión",
    recuperado: "10:09",
  },
  {
    id: "posterior",
    persona: "lucia",
    titulo: "Cámara sin señal",
    hora: "16:12",
    tipo: "Hub",
    revisar: true,
  },
];

function preparar(equipo = personas, incidencias: typeof episodios = []) {
  const abrirPersona = vi.fn();
  const abrirEpisodio = vi.fn();
  render(
    <RelevoArgos
      personas={equipo}
      episodios={incidencias}
      decisiones={{}}
      abrirPersona={abrirPersona}
      abrirEpisodio={abrirEpisodio}
    />,
  );
  return { abrirPersona, abrirEpisodio };
}

describe("Relevo de supervisión de Argos", () => {
  it("compara la marca con lo previsto al corte, dejando las entradas futuras fuera de los pendientes", () => {
    preparar();
    const pm = screen.getByRole("button", { name: /ver turno PM/i });
    expect(pm).toHaveTextContent("1 de 2");
    fireEvent.click(pm);
    const luz = screen.getByRole("button", { name: /Luz Ejemplo/ });
    const manuel = screen.getByRole("button", { name: /Manuel Ejemplo/ });
    expect(luz).toHaveTextContent("16:00");
    expect(luz).toHaveTextContent(
      /16:02.*\+2 min.*dentro de la tolerancia de 5 min/i,
    );
    expect(manuel).toHaveTextContent(
      /Sin entrada registrada.*20 min.*supera la tolerancia de 10 min/i,
    );
    expect(
      screen.queryByRole("button", { name: /Nuria Ejemplo/ }),
    ).not.toBeInTheDocument();
  });

  it("distingue los próximos 60 minutos del resto del día y permite abrir a la persona correcta", () => {
    const { abrirPersona } = preparar();
    fireEvent.click(
      screen.getByRole("button", { name: /ver próximas entradas/i }),
    );
    expect(
      screen.getByRole("button", { name: /17:00 Irene Ejemplo/ }),
    ).toHaveTextContent(/En 40 min/i);
    expect(
      screen.queryByRole("button", { name: /18:00 Nuria Ejemplo/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resto del día/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /18:00 Nuria Ejemplo/ }),
    );
    expect(abrirPersona).toHaveBeenCalledWith("nora");
  });

  it("muestra los episodios AM y abre el pendiente con su responsable", () => {
    const { abrirEpisodio } = preparar(personas, episodios);
    const am = screen.getByRole("button", { name: /ver cierre AM/i });
    expect(am).toHaveTextContent("1 pendiente");
    fireEvent.click(am);
    expect(
      screen.getByRole("button", { name: /Conexión recuperada/ }),
    ).toHaveTextContent("10:09");
    const abierto = screen.getByRole("button", {
      name: /Pantalla en revisión/,
    });
    expect(abierto).toHaveTextContent(/15:10.*Jefa de turno/);
    expect(
      screen.queryByRole("button", { name: /Cámara sin señal/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(abierto);
    expect(abrirEpisodio).toHaveBeenCalledWith(episodios[0]);
  });

  it("recalcula las cifras al filtrar por persona, aunque todavía no deba entrar", () => {
    preparar(personas.filter((p) => p.id === "nora"));
    const pm = screen.getByRole("button", { name: /ver turno PM/i });
    expect(pm).toHaveTextContent("Nadie debía entrar todavía");
    fireEvent.click(pm);
    expect(
      screen.getByText(/Sin entradas previstas en este intervalo/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/sin entrada registrada/i),
    ).not.toBeInTheDocument();
  });
});
