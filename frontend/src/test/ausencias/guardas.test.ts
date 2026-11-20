import { describe, expect, it } from "vitest";
import translations from "@/lib/i18n";
import { TODAS_LAS_CLAVES } from "@/lib/posiciones/catalogo";
import { CATALOGO_DE_EVENTOS } from "@/lib/catalogoDeEventos";

// GUARDAS DE AUSENCIAS (20/11/2026). Lo que no puede volver atrás:
//   1. El motivo y el adjunto los ven solo la persona y RR. HH. (tabla, bandeja,
//      calendario y buzón de archivos).
//   2. Todo lo que exige horario consulta el ayudante único (dia_libre /
//      ausente_ahora): turno, en_turno, Cowork obligatorio, Argos, tardanzas.
//   3. Permisos por puesto + permisos especiales (tiene_funcion los mira).
//   4. Reglas de la casa: (select auth.uid()), nunca DROP POLICY.

const MIG = Object.values(import.meta.glob("../../../../supabase/migrations/20261120150000_ausencias.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>)[0] ?? "";
const EDGES = import.meta.glob(["../../../../supabase/functions/detectar-tardanzas/index.ts", "../../../../supabase/functions/argos-vigia/index.ts"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const FRONT = import.meta.glob([
  "../../hooks/useMonitorCamara.ts", "../../hooks/useMiTurno.ts", "../../components/dashboard/DashboardSidebar.tsx", "../../App.tsx",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fuente = (fin: string, mapa: Record<string, string>) => Object.entries(mapa).find(([k]) => k.endsWith(fin))?.[1] ?? "";

/** El cuerpo de una función de la migración (hasta el cierre $$). */
function cuerpo(nombre: string): string {
  const i = MIG.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) return "";
  const desde = MIG.indexOf("$$", i);
  const hasta = MIG.indexOf("$$;", desde + 2);
  return MIG.slice(i, hasta);
}

describe("la migración se cargó", () => {
  it("el glob trae el archivo (un glob vacío pasaría todo en verde)", () => {
    expect(MIG.length).toBeGreaterThan(10_000);
  });
});

describe("motivo y adjunto: solo la persona y RR. HH.", () => {
  it("la tabla solo la leen la persona y quien da la aprobación final", () => {
    expect(MIG).toMatch(/create policy ausencias_ver_propia_o_rrhh on public\.ausencias for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) or public\.ausencias_aprueba_final\(\(select auth\.uid\(\)\), user_id\)\)/);
    // Sin políticas de escritura: se escribe solo por RPC.
    expect(MIG).not.toMatch(/on public\.ausencias for (insert|update|delete|all)/);
  });
  it("la bandeja manda el motivo y el adjunto solo con la aprobación final", () => {
    const b = cuerpo("ausencias_bandeja");
    expect(b).toContain("case when public.ausencias_aprueba_final(yo.uid, a.user_id) then a.motivo end");
    expect(b).toContain("case when public.ausencias_aprueba_final(yo.uid, a.user_id) then a.adjunto_path end");
  });
  it("el calendario, la asistencia y lo que ven los compañeros no traen motivo ni adjunto", () => {
    for (const f of ["ausencias_calendario", "asistencia_dias", "ausentes_hoy_empresa"]) {
      const c = cuerpo(f);
      expect(c.length, f).toBeGreaterThan(100);
      expect(c, f).not.toMatch(/\bmotivo\b/);
      expect(c, f).not.toMatch(/adjunto_path/);
    }
  });
  it("el buzón de adjuntos es privado y solo lo leen la persona y RR. HH.", () => {
    expect(MIG).toMatch(/values \('ausencias-adjuntos', 'ausencias-adjuntos', false/);
    expect(MIG).toMatch(/create policy ausencias_adjuntos_ver on storage\.objects for select to authenticated[\s\S]*?\(storage\.foldername\(name\)\)\[1\] = \(\(select auth\.uid\(\)\)\)::text[\s\S]*?public\.ausencias_aprueba_final/);
  });
});

describe("todo lo que exige horario consulta el ayudante", () => {
  it("turno_del_dia no da turno el día libre (festivo o ausencia de día completo)", () => {
    expect(cuerpo("turno_del_dia")).toContain("if public.dia_libre(_uid, _dia) then return; end if;");
    expect(cuerpo("dia_libre")).toContain("public.ausencias_festivos");
    expect(cuerpo("dia_libre")).toContain("a.estado = 'aprobada' and a.hora_desde is null");
  });
  it("horario_de, en_turno, Cowork obligatorio y Argos miran la ausencia", () => {
    expect(cuerpo("horario_de")).toContain("public.dia_libre(_uid");
    expect(cuerpo("en_turno")).toContain("not public.ausente_ahora(_uid, now())");
    expect(cuerpo("debe_estar_en_cowork")).toContain("not public.ausente_ahora(_uid, now())");
    expect(cuerpo("argos_vigila_a")).toContain("not public.ausente_ahora(_uid, now())");
  });
  it("las tardanzas y las alertas de Argos se saltan a quien tiene el día libre", () => {
    expect(fuente("detectar-tardanzas/index.ts", EDGES)).toMatch(/rpc\("ausentes_del_dia"[\s\S]*conDiaLibre\.has\(p\.id\)\) continue/);
    expect(fuente("argos-vigia/index.ts", EDGES)).toMatch(/rpc\("ausentes_del_dia"[\s\S]*!conDiaLibre\.has\(d\.user_id\)/);
  });
  it("en el cliente: las capturas no salen y el turno sabe de la ausencia", () => {
    expect(fuente("useMonitorCamara.ts", FRONT)).toContain("if (!estaEnTurno()) return;");
    expect(fuente("useMiTurno.ts", FRONT)).toContain("calcularEnTurno({ ...t, ausente }");
  });
});

describe("permisos por puesto y permisos especiales", () => {
  it("las funciones están en el catálogo de Posiciones", () => {
    for (const k of ["N:ausencias.aprobar_equipo", "N:ausencias.aprobar_final", "N:permisos.extra"]) expect(TODAS_LAS_CLAVES).toContain(k);
  });
  it("tiene_funcion y alcance_fila suman los permisos especiales vivos", () => {
    expect(cuerpo("tiene_funcion")).toMatch(/permisos_extra pe[\s\S]*pe\.clave = _clave and pe\.revocado_at is null/);
    expect(cuerpo("alcance_fila")).toMatch(/permisos_extra pe[\s\S]*pe\.revocado_at is null and pe\.fila = _fila/);
  });
  it("aprobar es función del puesto + alcance; nunca a sí mismo", () => {
    expect(cuerpo("ausencias_aprueba_equipo")).toContain("_viewer <> _target");
    expect(cuerpo("ausencias_aprueba_equipo")).toContain("'N:ausencias.aprobar_equipo'");
    expect(cuerpo("ausencias_aprueba_final")).toContain("_viewer <> _target");
    expect(cuerpo("ausencias_aprueba_final")).toContain("'N:ausencias.aprobar_final'");
  });
});

describe("reglas de la casa", () => {
  it("auth.uid() siempre envuelto y nunca DROP POLICY", () => {
    const sinEnvolver = MIG.replace(/\(select auth\.uid\(\)\)/g, "").match(/auth\.uid\(\)/g) ?? [];
    expect(sinEnvolver).toEqual([]);
    expect(MIG).not.toMatch(/drop policy/i);
  });
  it("los avisos respetan las preferencias y no hay avisos de prueba", () => {
    expect(cuerpo("ausencias_avisar")).toContain("notif_canal_activo(_uid, _tipo, 'in_app')");
    expect(MIG).not.toMatch(/insert into public\.notifications[^;]*values/i);
  });
  it("cada tipo de aviso está en el catálogo de Ajustes → Notificaciones", () => {
    const tipos = CATALOGO_DE_EVENTOS.flatMap((m) => m.eventos.map((e) => e.type));
    const enLaBase = [...MIG.matchAll(/ausencias_avisar\([^,]+,\s*'([a-z_0-9]+)'/g)].map((m) => m[1]);
    expect(enLaBase.length).toBeGreaterThan(5);
    for (const t of new Set(enLaBase)) expect(tipos, t).toContain(t);
  });
});

describe("menú y rutas", () => {
  it("Asistencia va al lado de Cowork y Mis días es de todos", () => {
    const s = fuente("DashboardSidebar.tsx", FRONT);
    expect(s).toMatch(/url: "\/cowork"[^\n]*\n\s*\{ title: t\("aus\.nav\.equipo"\), url: "\/asistencia"/);
    expect(s).toContain('url: "/mis-dias"');
    expect(s).not.toContain('url: "/hr/vacaciones"');
    expect(s).not.toContain('url: "/hr/asistencia"');
  });
  it("las rutas viejas de RR. HH. redirigen a la pestaña nueva", () => {
    const a = fuente("App.tsx", FRONT);
    for (const r of ["/hr/asistencia", "/hr/vacaciones", "/hr/permisos", "/hr/horarios", "/hr/horarios-personal", "/hr/horarios-chatters", "/hr/ausencias"]) {
      expect(a, r).toMatch(new RegExp(`path="${r}" element=\\{<Navigate to="/asistencia\\?tab=`));
    }
  });
});

describe("textos", () => {
  it("toda clave aus.* tiene español e inglés", () => {
    const dic = translations as unknown as Record<string, { es?: string; en?: string }>;
    const claves = Object.keys(dic).filter((k) => k.startsWith("aus."));
    expect(claves.length).toBeGreaterThan(100);
    expect(claves.filter((k) => !dic[k].es || !dic[k].en)).toEqual([]);
  });
});
