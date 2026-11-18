import { describe, it, expect } from "vitest";

// LA LIMPIEZA DE LA PAPELERA VUELVE A ANDAR (18/11/2026).
//
// RR. HH. no podía agregar gente («No quedan puestos de correo en Zoho») porque
// el cron que purga las cuentas con más de 30 días en la papelera nunca terminó
// bien: una sola cuenta trabada (una creadora con fecha de nacimiento imposible
// que no dejaba poner created_by en NULL) frenaba la purga de todas, y sus
// casillas seguían ocupando puestos.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const migraciones = (import.meta as unknown as Glob).glob("/supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const NOMBRE = "20261118060000_purga_papelera_destrabada.sql";
const migracion = Object.entries(migraciones).find(([ruta]) => ruta.endsWith(NOMBRE))?.[1] ?? "";
const sql = migracion.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

describe("purga de la papelera, cuenta por cuenta", () => {
  it("la migración se cargó", () => {
    expect(migracion.length).toBeGreaterThan(1000);
  });

  it("una cuenta trabada no frena a las demás", () => {
    const funcion = sql.slice(sql.indexOf("create or replace function public.app_purgar_cuentas_vencidas"));
    const bucle = funcion.slice(funcion.indexOf("loop"), funcion.indexOf("end loop;"));
    // El bloque con su excepción está DENTRO del bucle y envuelve el borrado.
    expect(bucle).toMatch(/\bbegin\b[\s\S]*app_purge_user_refs[\s\S]*app_force_delete_auth_user[\s\S]*exception when others then/);
    expect(bucle).toMatch(/raise warning/);
    // Sigue anotando la constancia y encolando el buzón antes de borrar.
    expect(bucle.indexOf("insert into public.cuenta_eventos")).toBeLessThan(bucle.indexOf("app_purge_user_refs"));
    expect(bucle).toMatch(/app_encolar_buzon/);
  });

  it("la purga automática respeta las cuentas que se conservan (Jhon)", () => {
    expect(sql).toMatch(/create table if not exists public\.papelera_conservar/);
    expect(sql).toMatch(/alter table public\.papelera_conservar enable row level security;/);
    expect(sql).toMatch(/and not exists \(select 1 from public\.papelera_conservar c where c\.user_id = p\.id\)/);
    expect(sql).toMatch(/c5b124cb-f272-458d-aa8e-1b11de0ff4d6/);
  });

  it("la fecha de nacimiento se revisa solo cuando se escribe", () => {
    expect(sql).toMatch(/alter table public\.creators drop constraint if exists creators_birth_date_plausible;/);
    expect(sql).toMatch(/before insert or update of birth_date on public\.creators/);
    expect(sql).toMatch(/tg_op = 'INSERT' or new\.birth_date is distinct from old\.birth_date/);
    expect(sql).toMatch(/date '1940-01-01'/);
    expect(sql).toMatch(/date '2015-12-31'/);
  });

  it("no toca datos: la purga la sigue haciendo el cron", () => {
    expect(sql).not.toMatch(/\bselect\s+public\.app_purgar_cuentas_vencidas\s*\(/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.creators\b/i);
  });

  it("ninguna migración nueva vuelve a poner un CHECK NOT VALID en creators", () => {
    const nuevas = Object.entries(migraciones).filter(([ruta]) => (ruta.split("/").pop() ?? "") > NOMBRE);
    for (const [ruta, texto] of nuevas) {
      const limpio = texto.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
      expect(limpio, ruta).not.toMatch(/alter table (public\.)?creators[\s\S]{0,200}check[\s\S]{0,300}not valid/i);
    }
  });
});
