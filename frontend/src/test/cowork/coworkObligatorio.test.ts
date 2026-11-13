import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: { getSession: vi.fn() } }, SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "" }));

import { debeIrACowork, rutaLibreDeCowork } from "@/hooks/useCoworkObligatorio";

// GUARDA (Alvaro, 13/11/2026): «Nadie puede estar fuera de un cowork… y si no, que no
// puedan entrar». Quien debe estar en Cowork y no está en su sala no usa el resto de
// Maven; un fallo de la consulta nunca deja a nadie afuera.
const shell = import.meta.glob("../../components/dashboard/AppShell.tsx", { query: "?raw", import: "default", eager: true });
const sql = import.meta.glob("../../../../supabase/migrations/20261113230000_cowork_solo_el_suyo.sql", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("todos adentro de Cowork", () => {
  it("si debe estar y no está, se le manda a Cowork", () => {
    expect(debeIrACowork({ debe: true, presente: false }, false, "/messenger")).toBe(true);
  });
  it("en su sala (aquí o en otra pestaña) usa todo Maven", () => {
    expect(debeIrACowork({ debe: true, presente: false }, true, "/messenger")).toBe(false);
    expect(debeIrACowork({ debe: true, presente: true }, false, "/messenger")).toBe(false);
  });
  it("los libres (admins, dueño, Luis, Daniel, Breyner, Vanessa) nunca se bloquean", () => {
    expect(debeIrACowork({ debe: false, presente: false }, false, "/messenger")).toBe(false);
  });
  it("sin datos (cargando o falló) no se bloquea", () => {
    expect(debeIrACowork(null, false, "/messenger")).toBe(false);
  });
  it("entrar a Cowork y las llamadas de Maven siempre se pueden abrir", () => {
    expect(rutaLibreDeCowork("/cowork?session=x")).toBe(true);
    expect(rutaLibreDeCowork("/meet")).toBe(true);
    expect(rutaLibreDeCowork("/call/sala-1")).toBe(true);
    expect(debeIrACowork({ debe: true, presente: false }, false, "/cowork")).toBe(false);
  });
  it("el cascarón de la app manda a Cowork en vez de mostrar la página", () => {
    expect(fuente(shell)).toMatch(/\{irACowork \? <Navigate to="\/cowork" replace \/> : <Outlet \/>\}/);
  });
  it("la base deja a cada quien en UN solo Cowork (el de su departamento)", () => {
    expect(fuente(sql)).toMatch(/raise exception 'Tu Cowork es «%»\. Entra por ahí\.'/);
  });
});
