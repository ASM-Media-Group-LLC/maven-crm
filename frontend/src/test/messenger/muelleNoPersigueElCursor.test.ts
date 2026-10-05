import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMuelleFlotante } from "@/hooks/useMuelleFlotante";

// EL MUELLE NO PERSIGUE EL CURSOR (Keila, 02/10).
//
// El arrastre escucha pointerup en WINDOW. En el Correo el cuerpo del mensaje
// se lee en un iframe: si se suelta encima, el pointerup lo recibe el iframe y
// el muelle seguía «agarrado», moviéndose con el mouse sin botón apretado.

const mover = (x: number, y: number, buttons: number) =>
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, buttons }));

describe("arrastre del muelle", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  });

  const agarrar = (h: ReturnType<typeof renderHook<ReturnType<typeof useMuelleFlotante>, unknown>>) =>
    act(() => h.result.current.arrastreProps.onPointerDown(
      { button: 0, pointerType: "mouse", clientX: 500, clientY: 500 } as unknown as ReactPointerEvent<HTMLElement>,
    ));

  it("con el botón apretado, se mueve (la línea base: si esto falla, lo de abajo no prueba nada)", () => {
    const h = renderHook(() => useMuelleFlotante());
    const antes = h.result.current.pos;
    agarrar(h);
    act(() => mover(400, 400, 1));
    expect(h.result.current.pos).toEqual({ x: antes.x - 100, y: antes.y - 100 });
  });

  it("si el pointerup se perdió (soltó encima del iframe), el primer movimiento sin botón lo suelta", () => {
    const h = renderHook(() => useMuelleFlotante());
    agarrar(h);
    act(() => mover(450, 450, 1));
    const soltado = h.result.current.pos;
    // Vuelve al documento con el botón ya suelto: no tiene que seguirlo.
    act(() => mover(200, 200, 0));
    act(() => mover(100, 100, 1));
    expect(h.result.current.pos).toEqual(soltado);
  });

  it("si la ventana pierde el foco (clic dentro del iframe), también se suelta", () => {
    const h = renderHook(() => useMuelleFlotante());
    const antes = h.result.current.pos;
    agarrar(h);
    act(() => { window.dispatchEvent(new Event("blur")); });
    act(() => mover(300, 300, 1));
    expect(h.result.current.pos).toEqual(antes);
  });
});
