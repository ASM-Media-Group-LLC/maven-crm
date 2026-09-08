import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SalaEnPausa, { describirPausa } from "@/pages/cowork/SalaEnPausa";
import { suscribirOrdenesDePausa, pedirApagarPorPausa, pedirReanudarTrasPausa, ultimaOrdenDePausa, olvidarOrdenesDePausa } from "@/lib/ordenesDePausa";

const T = new Date("2026-09-08T12:04:00-05:00").getTime();

describe("describirPausa — lo que dice el panel gris", () => {
  it("break dentro del tope: cuánto queda y barra en verde", () => {
    const d = describirPausa({ kind: "break", segundos: 18 * 60 + 42, desde: T, limiteMin: 45, consumidoSeg: 0, excedida: false });
    expect(d.titulo).toBe("En break");
    expect(d.detalle).toMatch(/límite 45 min · le quedan 27/);
    expect(d.pct).toBe(42);
    expect(d.tono).toBe("ok");
  });
  it("break pasado del tope: título 'pasado', minutos de más y tono rojo", () => {
    const d = describirPausa({ kind: "break", segundos: 52 * 60 + 10, desde: T, limiteMin: 45, consumidoSeg: 0, excedida: true });
    expect(d.titulo).toBe("En break · pasado");
    expect(d.detalle).toMatch(/8 min de más/);
    expect(d.pct).toBe(100);
    expect(d.tono).toBe("excedida");
  });
  it("baño: presupuesto del día, sumando lo ya gastado", () => {
    const d = describirPausa({ kind: "bano", segundos: 200, desde: T, limiteMin: 10, consumidoSeg: 220, excedida: false });
    expect(d.titulo).toBe("En el baño");
    expect(d.detalle).toMatch(/hoy lleva 7 de 10 min de baño/);
    expect(d.pct).toBe(70);
    expect(d.tono).toBe("ok");
  });
  it("sin tope configurado no inventa uno", () => {
    const d = describirPausa({ kind: "break", segundos: 60, desde: null, limiteMin: null, consumidoSeg: 0, excedida: false });
    expect(d.detalle).toBe("sin tope configurado");
    expect(d.pct).toBe(0);
  });
});

describe("SalaEnPausa", () => {
  it("dibuja título, tiempo y detalle, y marca el tono", () => {
    render(<SalaEnPausa pausa={{ kind: "break", segundos: 18 * 60 + 42, desde: T, limiteMin: 45, consumidoSeg: 0, excedida: false }} />);
    expect(screen.getByText("En break")).toBeInTheDocument();
    expect(screen.getByText("18:42")).toBeInTheDocument();
    expect(screen.getByTestId("sala-en-pausa").getAttribute("data-tono")).toBe("ok");
  });
});

describe("órdenes de pausa hacia la llamada", () => {
  beforeEach(() => olvidarOrdenesDePausa());
  it("la página avisa y la llamada se entera, en orden", () => {
    const visto: string[] = [];
    const baja = suscribirOrdenesDePausa((o) => visto.push(o));
    pedirApagarPorPausa();
    pedirReanudarTrasPausa();
    expect(visto).toEqual(["apagar", "reanudar"]);
    expect(ultimaOrdenDePausa()).toBe("reanudar");
    baja();
    pedirApagarPorPausa();
    expect(visto).toHaveLength(2);
  });
  it("un oyente que explota no frena a los demás", () => {
    const ok = vi.fn();
    const baja1 = suscribirOrdenesDePausa(() => { throw new Error("x"); });
    const baja2 = suscribirOrdenesDePausa(ok);
    pedirApagarPorPausa();
    expect(ok).toHaveBeenCalledWith("apagar");
    baja1(); baja2();
  });
});
