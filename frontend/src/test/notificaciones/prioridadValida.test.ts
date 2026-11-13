import { describe, it, expect } from "vitest";

// GUARDA (13/11/2026): notifications solo acepta priority high | medium | low
// (trigger validate_notification_fields). Un 'normal' en un vigía hace fallar la
// corrida entera: así se perdieron los avisos de tiempo sin pantalla, los resúmenes
// de turno y los de cortes de llamada. Desde la migración que lo arregló, ninguna
// migración nueva puede volver a mandar 'normal'.
const migraciones = import.meta.glob("../../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const DESDE = "20261114010000";

describe("prioridad de los avisos", () => {
  it("ninguna migración nueva inserta avisos con prioridad 'normal'", () => {
    const malas = Object.entries(migraciones)
      .filter(([ruta]) => (ruta.split("/").pop() ?? "") > DESDE)
      .filter(([, sql]) => /insert into public\.notifications[\s\S]*?'normal'/i.test(sql))
      .map(([ruta]) => ruta.split("/").pop());
    expect(malas).toEqual([]);
  });
  it("la migración del arreglo cambia 'normal' por 'medium'", () => {
    const sql = Object.entries(migraciones).find(([r]) => r.endsWith(`${DESDE}_avisos_prioridad_valida.sql`))?.[1] ?? "";
    expect(sql).toMatch(/replace\(d, '''normal''', '''medium'''\)/);
  });
});
