import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BuscadorPersonaArgos } from "@/harness/argos-buscar-persona";
import { EquipoVisual } from "@/harness/argos-diseno-equipo";
import type { PersonaVistaArgos } from "@/harness/argos-diseno-tipos";

const base: PersonaVistaArgos = {
  id: "ines",
  nombre: "Inés Núñez",
  iniciales: "IN",
  equipo: "Operaciones",
  puesto: "Supervisora",
  turno: "AM",
  inicio: "08:00",
  fin: "17:00",
  marca: "08:00",
  ubicacion: "Cowork · Operaciones",
  conectada: true,
  observacion: {
    app: "Cowork",
    actividad: "Tablero de salas abierto",
    hora: "16:19",
  },
  imagen: null,
  pendientes: 0,
};
const captura: PersonaVistaArgos = {
  ...base,
  id: "lucia",
  nombre: "Lucía León",
  iniciales: "LL",
  imagen: "/captura-ejemplo.png",
};
const desconectada: PersonaVistaArgos = {
  ...base,
  id: "ana",
  nombre: "Ana Núñez",
  iniciales: "AN",
  conectada: false,
  inicio: "17:00",
  fin: "22:00",
  marca: null,
  ubicacion: null,
  observacion: null,
};
const personas = [base, captura, desconectada];
function preparar(historico = false) {
  const acciones = {
    abrirPersona: vi.fn(),
    abrirPantalla: vi.fn(),
    abrirTurno: vi.fn(),
  };
  render(
    <EquipoVisual
      {...acciones}
      corte="16:20"
      personas={personas}
      historico={historico}
    />,
  );
  return acciones;
}

describe("Actividad por persona en la propuesta de Argos", () => {
  it("muestra la actividad y su hora, y abre la pantalla solo si hay captura", () => {
    const { abrirPantalla } = preparar();
    const conectados = within(screen.getByRole("list", { name: "Conectados" }));
    const filas = conectados.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("Tablero de salas abierto");
    expect(filas[0]).toHaveTextContent("16:19");
    expect(
      conectados.queryByRole("button", { name: "Ver pantalla de Inés Núñez" }),
    ).toBeNull();
    expect(conectados.queryByRole("img")).toBeNull();
    expect(abrirPantalla).not.toHaveBeenCalled();
    fireEvent.click(
      conectados.getByRole("button", { name: "Ver pantalla de Lucía León" }),
    );
    expect(abrirPantalla).toHaveBeenCalledWith(captura.id);
  });

  it("permite ver a quién se espera, su hora y su ficha aunque no esté conectado", () => {
    const { abrirTurno, abrirPersona } = preparar();
    const siguiente = screen.getByRole("button", {
      name: /siguiente entrada/i,
    });
    expect(siguiente).toHaveTextContent("Ana Núñez");
    expect(siguiente).toHaveTextContent("17:00");
    fireEvent.click(siguiente);
    expect(abrirTurno).toHaveBeenCalledWith("Próximas entradas");
    fireEvent.click(screen.getByRole("button", { name: /por entrar/i }));
    const entradas = within(screen.getByRole("list", { name: "Por entrar" }));
    expect(entradas.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(
      entradas.getByRole("button", { name: "Abrir ficha de Ana Núñez" }),
    );
    expect(abrirPersona).toHaveBeenCalledWith(desconectada.id);
  });

  it("en histórico incluye perfiles sin señal y omite los controles de conexión en vivo", () => {
    const { abrirPersona } = preparar(true);
    expect(
      screen.queryByRole("group", { name: "Mostrar personas" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /siguiente entrada/i }),
    ).toBeNull();
    const equipo = within(screen.getByRole("list", { name: "Todos" }));
    fireEvent.click(
      equipo.getByRole("button", { name: "Abrir ficha de Ana Núñez" }),
    );
    expect(abrirPersona).toHaveBeenCalledWith(desconectada.id);
  });
});

describe("Búsqueda de personas de Argos", () => {
  // jsdom carece de desplazamiento visual de la opción seleccionada.
  const desplazamiento = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  beforeAll(() =>
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    }),
  );
  afterAll(() => {
    if (desplazamiento)
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        desplazamiento,
      );
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("encuentra nombres sin tildes y abre con el teclado a una persona desconectada", () => {
    const abrirPersona = vi.fn();
    render(
      <BuscadorPersonaArgos
        personas={personas}
        abrirPersona={abrirPersona}
        historico={false}
      />,
    );
    const campo = screen.getByRole("combobox", { name: "Buscar persona" });
    fireEvent.change(campo, { target: { value: "nunez" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    const ana = screen.getByRole("option", {
      selected: true,
      name: /Ana Núñez/,
    });
    expect(campo).toHaveAttribute("aria-activedescendant", ana.id);
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(abrirPersona).toHaveBeenCalledWith(desconectada.id);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("al buscar en una fecha anterior informa si falta evidencia para ese día", () => {
    const abrirPersona = vi.fn();
    render(
      <BuscadorPersonaArgos
        personas={[desconectada]}
        abrirPersona={abrirPersona}
        historico
      />,
    );
    const campo = screen.getByRole("combobox", { name: "Buscar persona" });
    fireEvent.change(campo, { target: { value: "ana nunez" } });
    expect(screen.getByRole("option")).toHaveTextContent(
      "Sin observación de pantalla para esta fecha",
    );
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(abrirPersona).toHaveBeenCalledWith(desconectada.id);
  });
});
