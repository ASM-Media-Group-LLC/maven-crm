import { describe, it, expect } from "vitest";

// LA PURGA DE LA PAPELERA NO SE TRABA NI SE LLEVA LO DE LOS DEMÁS (13/11/2026).
//
// app_purgar_cuentas_vencidas fallaba cada día: 9 FK a profiles(id) sin acción
// al borrar frenaban el borrado del perfil (la primera, whatsapp_bot_rules).
// Y destrabarla sin más habría sido peor: app_purge_user_refs BORRA las filas
// cuya columna hacia auth.users es NOT NULL, y una de las cuentas vencidas creó
// el Cowork activo del equipo (con las horas de 61 personas colgando en cascada).
// Las columnas de autoría pasan a quedar en NULL; la fila de negocio queda.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const migraciones = (import.meta as unknown as Glob).glob("/supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const NOMBRE = "20261114050000_purga_sin_borrar_lo_de_otros.sql";
const migracion = Object.entries(migraciones).find(([ruta]) => ruta.endsWith(NOMBRE))?.[1] ?? "";
const sinComentarios = (sql: string) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

/** [tabla, columna, constraint, ¿era NOT NULL?] */
const A_PROFILES: Array<[string, string, string, boolean]> = [
  ["whatsapp_bot_rules", "created_by_user_id", "whatsapp_bot_rules_created_by_user_id_fkey", true],
  ["whatsapp_bot_rules", "deactivated_by_user_id", "whatsapp_bot_rules_deactivated_by_user_id_fkey", false],
  ["creator_manager_history", "manager_profile_id", "creator_manager_history_manager_profile_id_fkey", true],
  ["whatsapp_person_facts", "created_by", "whatsapp_person_facts_created_by_fkey", false],
  ["employees", "profile_id", "employees_profile_id_fkey", false],
  ["custom_content_requests", "assigned_chatter_id", "custom_content_requests_assigned_chatter_id_fkey", false],
  ["custom_content_requests", "requested_by", "custom_content_requests_requested_by_fkey", false],
  ["promolog_scan_notes", "set_by", "promolog_scan_notes_set_by_fkey", false],
  ["content_grids", "feedback_by", "content_grids_feedback_by_fkey", false],
];
const AUTORIA_A_USERS: Array<[string, string, string]> = [
  ["cowork_sessions", "created_by", "cowork_sessions_created_by_fkey"],
  ["meet_rooms", "created_by", "meet_rooms_created_by_fkey"],
  ["chatter_sessions", "examiner_user_id", "chatter_sessions_examiner_user_id_fkey"],
  ["closer_lead_files", "uploaded_by", "closer_lead_files_uploaded_by_fkey"],
  ["calls", "caller_id", "calls_caller_id_fkey"],
];

describe("purga de la papelera", () => {
  const sql = sinComentarios(migracion);

  it("la migración se cargó", () => {
    expect(migracion.length).toBeGreaterThan(1000);
  });

  it("las 9 FK a profiles pasan a ON DELETE SET NULL (nada en cascada)", () => {
    for (const [tabla, col, fk, eraNotNull] of A_PROFILES) {
      expect(sql, fk).toMatch(new RegExp(
        `alter table public\\.${tabla}\\s+drop constraint if exists ${fk},\\s+add constraint ${fk}\\s+` +
        `foreign key \\(${col}\\) references public\\.profiles \\(id\\) on delete set null;`));
      if (eraNotNull) expect(sql, `${tabla}.${col}`).toMatch(new RegExp(`alter table public\\.${tabla} alter column ${col} drop not null;`));
    }
  });

  it("la autoría de cosas compartidas queda en NULL en vez de borrar la fila", () => {
    for (const [tabla, col, fk] of AUTORIA_A_USERS) {
      expect(sql, `${tabla}.${col}`).toMatch(new RegExp(`alter table public\\.${tabla} alter column ${col} drop not null;`));
      expect(sql, fk).toMatch(new RegExp(
        `add constraint ${fk}\\s+foreign key \\(${col}\\) references auth\\.users \\(id\\) on delete set null;`));
    }
    // Ya era ON DELETE SET NULL; con NOT NULL la acción no se podía cumplir.
    expect(sql).toMatch(/alter table public\.meeting_recordings alter column started_by drop not null;/);
    expect(sql).not.toMatch(/on delete cascade/i);
  });

  it("el candado de Meet deja pasar a NULL a quien creó la reunión, y a nadie más", () => {
    expect(sql).toMatch(/or \(new\.created_by is distinct from old\.created_by and new\.created_by is not null\)/);
    expect(sql).not.toMatch(/or new\.created_by is distinct from old\.created_by\s*\n/);
  });

  it("no toca datos: solo constraints y el candado", () => {
    expect(sql).not.toMatch(/\b(delete\s+from|insert\s+into|truncate)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
  });

  it("ninguna migración nueva agrega una FK a profiles sin decir qué pasa al borrar", () => {
    const nuevas = Object.entries(migraciones).filter(([ruta]) => (ruta.split("/").pop() ?? "") > NOMBRE);
    for (const [ruta, texto] of nuevas) {
      for (const m of sinComentarios(texto).matchAll(/references\s+(?:public\.)?profiles\s*\(\s*id\s*\)([^,;]*)/gi)) {
        expect(m[1], `${ruta}: «${m[0].trim()}»`).toMatch(/on\s+delete\s+(set\s+null|cascade|restrict)/i);
      }
    }
  });
});
