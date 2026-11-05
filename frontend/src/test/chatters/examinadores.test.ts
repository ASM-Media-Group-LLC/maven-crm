import { describe, it, expect } from "vitest";

// EXAMINADORES A MANO (Grace, 05/11/2026: «no deja agregar ni quitar personal
// ahí»). La lista de «Asignar a» salía solo de los roles y mostraba cuentas en la
// papelera. Guarda: la pestaña Admin tiene la sección, la base filtra la
// papelera y respeta lo agregado/sacado a mano, y el frontend deja entrar al
// evaluador a quien se agregó a mano.

const admin = import.meta.glob("../../pages/chatter-evaluator/AdminContent.tsx", { query: "?raw", import: "default", eager: true });
const permisos = import.meta.glob("../../hooks/usePermissions.ts", { query: "?raw", import: "default", eager: true });
const migracion = import.meta.glob("../../../../supabase/migrations/20261105150000_chatter_examinadores.sql", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("examinadores del Chatter Evaluator", () => {
  it("la pestaña Admin muestra la sección de examinadores", () => {
    expect(fuente(admin)).toContain("<ExaminadoresSection />");
  });

  it("la lista no muestra cuentas en la papelera y respeta a los sacados", () => {
    const sql = fuente(migracion);
    expect(sql).toMatch(/list_chatter_evaluators[\s\S]*p\.deleted_at is null/);
    expect(sql).toMatch(/list_chatter_evaluators[\s\S]*not x\.permitido/);
  });

  it("a un sacado no se le pueden asignar sesiones", () => {
    expect(fuente(migracion)).toMatch(/alter policy chatter_sessions_insert[\s\S]*puede_ser_examinador\(examiner_user_id\)/);
  });

  it("quien se agregó a mano entra al evaluador", () => {
    expect(fuente(permisos)).toContain('module === "Chatters" && submodule === "Evaluator"');
  });
});
