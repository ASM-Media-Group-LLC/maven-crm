import { beforeEach, describe, expect, it } from "vitest";
import { anotarVoz, olvidarVoz, segundosDeVozEntre } from "@/lib/vozPropia";
import { filasDeUso } from "@/lib/escritorio";
import { CATALOGO_POSICIONES } from "@/lib/posiciones/catalogo";

// Pausas por modalidad, quién cambia a quién e inactividad (Alvaro, 19/11/2026).
// Escalable para muchas empresas: todo va por el puesto y por la empresa.

const sql = Object.values(import.meta.glob("../../../../supabase/migrations/20261119200000_pausas_por_modalidad_e_inactividad.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>)[0] ?? "";
const soloPuesto = Object.values(import.meta.glob("../../../../supabase/migrations/20261119210000_pausas_solo_por_puesto.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>)[0] ?? "";
const fuentes = import.meta.glob(["../../../../supabase/functions/cowork-session/index.ts", "../../pages/cowork/CoworkParticipantView.tsx"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const cowork = Object.entries(fuentes).find(([k]) => k.endsWith("index.ts"))?.[1] ?? "";
const sala = Object.entries(fuentes).find(([k]) => k.endsWith("CoworkParticipantView.tsx"))?.[1] ?? "";

describe("modalidades por empresa", () => {
  it("cada empresa tiene las suyas", () => {
    expect(sql).toContain("tenant_id uuid not null");
    expect(sql).toContain("unique (tenant_id, nombre)");
  });

  it("nada a mano: la pausa sale solo del puesto (sin pausa por persona)", () => {
    expect(soloPuesto).toContain("drop table if exists public.pausas_persona;");
    expect(soloPuesto).toContain("drop function if exists public.pausas_asignar(uuid, uuid);");
    expect(soloPuesto).toMatch(/function public\.argos_pausas_de[\s\S]*'puesto'::text as origen, 1 as prioridad[\s\S]*'base', 2/);
  });

  it("lo de toda la empresa se configura con la función del puesto", () => {
    expect(soloPuesto).toContain("tiene_funcion((select auth.uid()), 'N:empresa.configurar')");
    expect(soloPuesto).toMatch(/pausas_modalidad_guardar[\s\S]*puedo_configurar_empresa\(\)/);
  });

  it("la de esta empresa: 30 + 10 para chatters, supervisores y editores; 1 hora el resto; freelance sin pausa", () => {
    expect(sql).toContain("('1 hora', 60, 10, 1), ('30 minutos', 30, 10, 2), ('Sin pausa', 0, 0, 3)");
    expect(sql).toContain("when nombre in ('Chatter', 'Chatter Supervisor', 'Editores de contenido exclusivo') then m30");
    expect(sql).toContain("when nombre = 'Freelance' then m0");
  });
});

describe("quién cambia a quién", () => {
  it("nadie se cambia a sí mismo, al dueño nadie, RR. HH. no toca admins", () => {
    expect(sql).toContain("_viewer <> _target");
    expect(sql).toContain("and not public.es_dueno(_target)");
    expect(sql).toContain("(public.tiene_funcion(_viewer, 'N:horarios.gestionar') and not public.es_admin_o_dueno(_target))");
    expect(sql).toContain("(public.es_admin_o_dueno(_viewer) and not public.es_admin_o_dueno(_target))");
  });

  it("los horarios siguen la misma regla; supervisores solo su equipo y nunca el propio", () => {
    expect(sql).toMatch(/function public\.puede_editar_horario[\s\S]*puede_gestionar_a\(\(select auth\.uid\(\)\), _target\)[\s\S]*_target <> \(select auth\.uid\(\)\)/);
  });

  it("las dos funciones están en Ajustes → Posiciones", () => {
    const claves = CATALOGO_POSICIONES.flatMap((s) => s.grupos.flatMap((g) => g.filas.flatMap((f) => f.funciones.map((x) => x.clave))));
    expect(claves).toContain("N:horarios.gestionar");
    expect(claves).toContain("N:empresa.configurar");
    expect(claves).not.toContain("N:pausas.modalidades");
  });
});

describe("el pago", () => {
  it("baño hasta su cupo total y almuerzo/break hasta el suyo", () => {
    expect(sql).toContain("least(v_bano, coalesce(v_bano_min, 10) * 60) + least(v_otra, coalesce(v_comida_min, 30) * 60)");
  });

  it("10 min o más sin actividad: no se paga todo ese rato", () => {
    expect(sql).toContain("g.abierta_at - interval '10 minutes'");
    expect(sql).toContain("v_trab := v_trab - v_inact;");
  });

  it("a los 20 min se marca salida, solo con el corte", () => {
    expect(sql).toMatch(/r\.tipo = 'sin_actividad' and v_obl and g\.abierta_at <= now\(\) - interval '10 minutes'[\s\S]*cierre = 'sistema'/);
  });
});

describe("Cowork", () => {
  it("el tope de cada pausa sale de la modalidad de la persona", () => {
    expect(cowork).toContain('admin.rpc("pausa_restante_min"');
    expect(cowork).toContain("limiteMinutos: dePersona ?? topeSesion");
  });

  it("si el turno se cierra solo, sale de la sala", () => {
    expect(sala).toContain("if (antes && !enTurnoAhora) void salirDeLaSalaRef.current?.();");
  });
});

describe("hablar cuenta como actividad", () => {
  beforeEach(() => olvidarVoz());

  it("cuenta los segundos de voz de un tramo", () => {
    const t0 = Date.parse("2026-11-20T15:00:00Z");
    for (let i = 0; i < 30; i++) anotarVoz(t0 + i * 1000);
    expect(segundosDeVozEntre(t0, t0 + 60_000)).toBe(30);
    expect(segundosDeVozEntre(t0 + 60_000, t0 + 120_000)).toBe(0);
  });

  it("se le restan a lo inactivo del tramo", () => {
    const t0 = Date.parse("2026-11-20T15:00:00Z");
    for (let i = 0; i < 40; i++) anotarVoz(t0 + i * 1000);
    const [fila] = filasDeUso([{ app: "Maven", titulo: "Cowork", url: null, desde: new Date(t0).toISOString(), hasta: new Date(t0 + 50_000).toISOString(), segundos: 50, inactivos: 50 }] as never, "windows");
    expect(fila.segundos_inactivo).toBe(10);
  });
});
