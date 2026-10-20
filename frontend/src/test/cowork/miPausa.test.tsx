import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MiPausa, { resumenMiPausa, inicialesDe } from "@/pages/cowork/MiPausa";
import { traducir } from "@/lib/i18n";

describe("inicialesDe", () => {
  it("toma la primera y la última palabra", () => {
    expect(inicialesDe("Grace Duque")).toBe("GD");
    expect(inicialesDe("María De Los Ángeles Suárez")).toBe("MS");
    expect(inicialesDe("Mario")).toBe("M");
    expect(inicialesDe("")).toBe("·");
  });
});

describe("resumenMiPausa", () => {
  const limites = { bano: 10, break: 30 };

  it("suma el tiempo en vivo SOLO al tipo en curso", () => {
    const tiles = resumenMiPausa(
      { bano: 300, break: 600 },
      limites,
      { kind: "bano", elapsed: 120 },
      ["bano", "break"],
    );
    const bano = tiles.find((t) => t.kind === "bano")!;
    const brk = tiles.find((t) => t.kind === "break")!;
    expect(bano.usadoSeg).toBe(420); // 300 cerrado + 120 en vivo
    expect(brk.usadoSeg).toBe(600); // no está en curso: sin tiempo en vivo
  });

  it("marca amarillo cerca del tope y rojo al pasarse", () => {
    const [bano] = resumenMiPausa({ bano: 480 }, limites, null, ["bano"]); // 8/10 min
    expect(bano.estado).toBe("poco");
    const [pasado] = resumenMiPausa({ bano: 660 }, limites, null, ["bano"]); // 11/10 min
    expect(pasado.estado).toBe("excedida");
    const [ok] = resumenMiPausa({ bano: 60 }, limites, null, ["bano"]); // 1/10 min
    expect(ok.estado).toBe("ok");
  });

  it("sin tope configurado no pinta estado de exceso", () => {
    const [t] = resumenMiPausa({ almuerzo: 99999 }, {}, null, ["almuerzo"]);
    expect(t.limiteMin).toBeNull();
    expect(t.estado).toBe("ok");
  });
});

describe("<MiPausa>", () => {
  it("muestra el reloj de la pausa, los recuadros del día y el botón de volver", () => {
    render(
      <MiPausa
        nombre="Grace Duque"
        kind="bano"
        segundos={120}
        desde={Date.now()}
        limiteMin={10}
        consumidoPrevio={0}
        consumoHoy={{ bano: 0, break: 300 }}
        limites={{ bano: 10, break: 30 }}
        kindsResumen={["bano", "break"]}
        horaDesde="1:51 p. m."
        onVolver={() => {}}
        t={traducir}
      />,
    );
    expect(screen.getByTestId("mi-pausa")).toBeInTheDocument();
    // Iniciales en el avatar.
    expect(screen.getByText("GD")).toBeInTheDocument();
    // Cuenta regresiva de ESTA pausa: 10 min de tope − 2 transcurridos = 8:00.
    expect(screen.getByText("8:00")).toBeInTheDocument();
    // Botón de volver.
    expect(screen.getByText(traducir("cowork.miPausa.imBack"))).toBeInTheDocument();
    // El encabezado del resumen del día.
    expect(screen.getByText(traducir("cowork.miPausa.today"))).toBeInTheDocument();
  });

  it("en almuerzo muestra su propio título y los tres recuadros", () => {
    render(
      <MiPausa
        nombre="Grace Duque"
        kind="almuerzo"
        segundos={600}
        desde={Date.now()}
        limiteMin={60}
        consumidoPrevio={0}
        consumoHoy={{ bano: 120, break: 300, almuerzo: 0 }}
        limites={{ bano: 10, break: 30, almuerzo: 60 }}
        kindsResumen={["bano", "break", "almuerzo"]}
        horaDesde="1:00 p. m."
        onVolver={() => {}}
        t={traducir}
      />,
    );
    // Título de la pausa activa: "En almuerzo", no "En break".
    expect(screen.getByText(traducir("cowork.pauseTile.inLunch"))).toBeInTheDocument();
    // Los tres recuadros del día.
    expect(screen.getByText(traducir("cowork.pause.bano"))).toBeInTheDocument();
    expect(screen.getByText(traducir("cowork.pause.break"))).toBeInTheDocument();
    expect(screen.getByText(traducir("cowork.pause.almuerzo"))).toBeInTheDocument();
  });
});
