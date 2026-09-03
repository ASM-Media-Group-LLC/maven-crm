import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CalendarioMovimiento from "@/pages/chatters/dashboard/CalendarioMovimiento";

// El calendario de movimiento del dashboard del chatter: un mes, un cuadrito
// por día, coloreado por la nota; descanso con borde punteado; sin dato = gris.
describe("CalendarioMovimiento", () => {
  const hoy = new Date(2026, 8, 3); // jueves 3 de septiembre de 2026
  const dias = [
    { dia: "2026-09-01", nota: 8.6, nota_ventas: 9, nota_tiempo: 8, nota_meet: 10, ventas: 420, ventas_esperadas: 380, horas: 8, detalle: null },
    { dia: "2026-09-02", nota: 4.2, nota_ventas: 3, nota_tiempo: 6, nota_meet: 10, ventas: 90, ventas_esperadas: 380, horas: 7.5, detalle: { faltantes: [] } },
  ];
  const descansos = [{ id: "r1", week_start: "2026-08-31", agency: "plus" as const, weekday: 5, shift: "am" as const, identity_id: "yo", covered_by_identity_id: null, note: null }];

  it("empieza en lunes y pinta septiembre 2026 con su offset (el 1 cae martes)", () => {
    render(<CalendarioMovimiento mes={hoy} dias={dias} descansos={descansos} desde="2026-09-01" hasta="2026-09-30" diaSel={null} onDia={() => {}} hoy={hoy} />);
    expect(screen.getByText(/septiembre de 2026/i)).toBeTruthy();
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(30);
    expect(botones[0].textContent).toContain("1");
  });

  it("colorea por nota, marca el descanso con borde punteado y deja gris el día sin dato", () => {
    render(<CalendarioMovimiento mes={hoy} dias={dias} descansos={descansos} desde="2026-09-01" hasta="2026-09-30" diaSel={null} onDia={() => {}} hoy={hoy} />);
    const botones = screen.getAllByRole("button");
    expect(botones[0].className).toContain("success");      // 1 sep, nota 8.6
    expect(botones[1].className).toContain("destructive");  // 2 sep, nota 4.2
    expect(botones[2].className).not.toMatch(/success|warning|destructive/); // 3 sep, sin dato
    expect(botones[4].className).toContain("border-dashed"); // sábado 5, descanso
  });

  it("los días futuros no se pueden elegir; los pasados avisan el día elegido", () => {
    const onDia = vi.fn();
    render(<CalendarioMovimiento mes={hoy} dias={dias} descansos={[]} desde="2026-09-01" hasta="2026-09-30" diaSel={null} onDia={onDia} hoy={hoy} />);
    const botones = screen.getAllByRole("button");
    expect((botones[10] as HTMLButtonElement).disabled).toBe(true); // 11 sep
    fireEvent.click(botones[1]);
    expect(onDia).toHaveBeenCalledWith("2026-09-02");
  });
});
