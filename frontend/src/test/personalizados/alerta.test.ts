import { describe, expect, it } from "vitest";
import { DIAS_ATENCION, DIAS_VENCIDO, alertaDe, diasDesde, type Estado } from "@/pages/personalizados/types";

// Regla del negocio: un personalizado se entrega en 12 días como máximo. A los
// 7 avisa (ámbar), a los 12 vence (rojo) — y un pedido CERRADO no alerta nunca,
// porque de un denegado no se espera entrega.
const HOY = new Date(2026, 8, 15, 10, 0, 0); // 15 sep 2026, hora local

const p = (dias: number, status: Estado = "en_produccion", due_on: string | null = null) => {
  const d = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - dias);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { status, requested_on: iso, due_on };
};

describe("alertaDe · plazo de los 12 días", () => {
  it("no alerta antes de los 7 días", () => {
    expect(alertaDe(p(0), HOY)).toBeNull();
    expect(alertaDe(p(DIAS_ATENCION - 1), HOY)).toBeNull();
  });

  it("avisa (ámbar) desde los 7 y hasta los 11 días", () => {
    expect(alertaDe(p(DIAS_ATENCION), HOY)?.nivel).toBe("atencion");
    expect(alertaDe(p(DIAS_VENCIDO - 1), HOY)?.nivel).toBe("atencion");
    expect(alertaDe(p(9), HOY)?.dias).toBe(9);
  });

  it("vence (rojo) a partir de los 12 días", () => {
    expect(alertaDe(p(DIAS_VENCIDO), HOY)?.nivel).toBe("vencido");
    expect(alertaDe(p(40), HOY)?.nivel).toBe("vencido");
    expect(alertaDe(p(40), HOY)?.texto).toBe("Vencido · 40 d");
  });

  it("los pedidos cerrados NO alertan, por viejos que sean", () => {
    for (const s of ["entregado", "denegado", "reembolsado"] as Estado[]) {
      expect(alertaDe(p(90, s), HOY), s).toBeNull();
    }
  });

  it("los abiertos sí alertan, en cualquiera de sus estados", () => {
    for (const s of ["solicitado", "aprobado", "en_produccion", "listo"] as Estado[]) {
      expect(alertaDe(p(90, s), HOY)?.nivel, s).toBe("vencido");
    }
  });

  it("una fecha de entrega ya pasada vence el pedido aunque sea nuevo", () => {
    expect(alertaDe(p(1, "aprobado", "2026-09-14"), HOY)?.nivel).toBe("vencido");
    // La de hoy todavía no: se tiene todo el día para entregar.
    expect(alertaDe(p(1, "aprobado", "2026-09-15"), HOY)).toBeNull();
    // Y una futura no adelanta la alarma.
    expect(alertaDe(p(1, "aprobado", "2026-09-30"), HOY)).toBeNull();
  });

  it("cuenta días enteros y no se corre por la hora ni por el huso", () => {
    expect(diasDesde("2026-09-15", HOY)).toBe(0);
    expect(diasDesde("2026-09-14", HOY)).toBe(1);
    expect(diasDesde("2026-09-14", new Date(2026, 8, 15, 23, 59, 0))).toBe(1);
    expect(diasDesde("2026-09-14T08:30:00+00:00", HOY)).toBe(1);
    expect(diasDesde("basura", HOY)).toBe(0);
  });
});
