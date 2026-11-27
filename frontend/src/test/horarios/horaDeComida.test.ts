// HORA DE COMIDA (Alvaro, 27/11/2026): la empresa decide si es recomendada u
// obligatoria (con margen); RR. HH. ajusta por persona. Todo sale de los roles.
import { describe, it, expect } from "vitest";
import { debeRecordarComida, horaBogotaAhora, minutosDe } from "@/lib/horaDeComida";

const fuentes = import.meta.glob(
  ["../../components/horarios/ModalidadesPausa.tsx", "../../components/horarios/ListaHorarios.tsx", "../../components/dashboard/AppShell.tsx", "../../../../supabase/migrations/20261127070000_hora_de_comida.sql"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const leer = (fin: string) => fuentes[Object.keys(fuentes).find((k) => k.endsWith(fin))!];

describe("el recordatorio", () => {
  it("avisa desde la hora y hasta 10 min después, una vez al día", () => {
    expect(minutosDe("12:30")).toBe(750);
    expect(debeRecordarComida("12:30", 749, "2026-11-27", null)).toBe(false);
    expect(debeRecordarComida("12:30", 750, "2026-11-27", null)).toBe(true);
    expect(debeRecordarComida("12:30", 759, "2026-11-27", null)).toBe(true);
    expect(debeRecordarComida("12:30", 760, "2026-11-27", null)).toBe(false);
    expect(debeRecordarComida("12:30", 752, "2026-11-27", "2026-11-27")).toBe(false);
  });
  it("usa la hora de Bogotá", () => {
    const r = horaBogotaAhora(new Date("2026-11-27T17:30:00Z"));
    expect(r).toEqual({ hoy: "2026-11-27", minutos: 12 * 60 + 30 });
  });
});

describe("cada empresa decide, y todo sale de los roles", () => {
  it("el plan tiene hora, recomendada/obligatoria y margen", () => {
    const m = leer("ModalidadesPausa.tsx");
    expect(m).toContain('type="time"');
    expect(m).toContain("setObligatoria");
    expect(m).toContain('t("hr.pausas.margen")');
  });
  it("RR. HH. ajusta la hora por persona en su horario", () => {
    expect(leer("ListaHorarios.tsx")).toContain("<ComidaDeLaFila");
    expect(leer("AppShell.tsx")).toContain("<RecordatorioComida />");
  });
  it("los permisos salen de las posiciones, no de una lista", () => {
    const sql = leer("20261127070000_hora_de_comida.sql");
    expect(sql).toContain("public.puedo_configurar_empresa()");
    expect(sql).toContain("public.puede_editar_horario(_uid)");
    expect(sql).toMatch(/comida_fuera_de_hora[\s\S]*revoke all[\s\S]*authenticated/);
  });
});
