import { describe, it, expect } from "vitest";

// GUARDA de la migración de Argos minuto a minuto (20261111230000): la base solo
// le entrega lo crudo a quien puede vigilar a la persona, auth.uid() va envuelto,
// no hay DROP de policies, el expediente de RR. HH. y supervisores deja de salir
// en 0 horas (cowork_tiempo_diario responde por puede_vigilar_a) y la migración
// está anotada en los cinco bancos que listan migraciones.
const fuentes = import.meta.glob(
  [
    "/supabase/migrations/20261111230000_argos_minuto_a_minuto.sql",
    "/supabase/tests/api_messenger_escritura.ts",
    "/supabase/tests/api_messenger_escritura_edge.ts",
    "/supabase/tests/chat_mensajes_de_sistema.ts",
    "/supabase/tests/chat_programados.ts",
    "/supabase/tests/chat_agencia_y_huecos.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const fuente = (ruta: string) => fuentes[ruta] ?? "";

describe("la migración de Argos minuto a minuto", () => {
  const sql = fuente("/supabase/migrations/20261111230000_argos_minuto_a_minuto.sql");

  it("solo entrega lo crudo a quien puede vigilar; auth.uid() envuelto y sin drop", () => {
    expect(sql).toContain("create or replace function public.argos_jornada_cruda(");
    expect(sql).toContain("if not public.puede_vigilar_a(v_viewer, _uid) then");
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/(?<!select )auth\.uid\(\)/);
  });

  it("RR. HH. y supervisores ven las horas de quien pueden vigilar (no 0)", () => {
    const i = sql.indexOf("CREATE OR REPLACE FUNCTION public.cowork_tiempo_diario(");
    expect(i).toBeGreaterThan(0);
    expect(sql.slice(i)).toContain("where public.puede_vigilar_a((select auth.uid()), p.id)");
  });

  it("está anotada en los cinco bancos, después de la de cuentas atadas", () => {
    for (const banco of [
      "/supabase/tests/api_messenger_escritura.ts",
      "/supabase/tests/api_messenger_escritura_edge.ts",
      "/supabase/tests/chat_mensajes_de_sistema.ts",
      "/supabase/tests/chat_programados.ts",
      "/supabase/tests/chat_agencia_y_huecos.ts",
    ]) {
      const src = fuente(banco);
      const i = src.indexOf('"20261111220000_costos_cuentas_atadas.sql"');
      const j = src.indexOf('"20261111230000_argos_minuto_a_minuto.sql"');
      expect(i, banco).toBeGreaterThan(0);
      expect(j, banco).toBeGreaterThan(i);
    }
  });
});
