import { describe, expect, it } from "vitest";
import { chipsDelCaso, tonoAviso } from "@/lib/casosArgos";

// Argos vigila más (19/11/2026): alerta grave a los 10 min sin actividad o a la
// hora fuera del trabajo; primero la persona, a los 2 min el dueño, su jefe y
// RR. HH.; ráfaga de fotos cuando algo se ve raro; apps ajenas por puesto.

const migraciones = import.meta.glob("../../../../supabase/migrations/20261119160000_argos_graves_rafaga.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const sql = Object.values(migraciones)[0] ?? "";

const fuentes = import.meta.glob(["../../hooks/useMonitorCamara.ts", "../../components/dashboard/AppShell.tsx"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const capturador = Object.entries(fuentes).find(([k]) => k.endsWith("useMonitorCamara.ts"))?.[1] ?? "";
const cascaron = Object.entries(fuentes).find(([k]) => k.endsWith("AppShell.tsx"))?.[1] ?? "";

describe("alerta grave", () => {
  it("10 minutos sin tocar nada (o bloqueado) en los últimos 11", () => {
    expect(sql).toContain("m.inac11 >= 540");
    expect(sql).toContain("coalesce(m.ultimo_inac, 0) >= 0.8");
  });

  it("una hora fuera del trabajo solo para los puestos con la función", () => {
    expect(sql).toContain("m.aj60 >= 3000");
    expect(sql).toMatch(/tiene_funcion\(m\.user_id, 'N:argos\.apps_ajenas'\)/);
  });

  it("primero la persona; a los 2 minutos sube a dueño, jefe directo y RR. HH.", () => {
    expect(sql).toContain("'argos_grave_persona'");
    expect(sql).toContain("g.abierta_at <= now() - interval '2 minutes'");
    expect(sql).toContain("public.jefes_directos(r.user_id)");
    expect(sql).toContain("public.tenant_owners o");
    expect(sql).toContain("con_funcion('N:argos.casos.juzgar', true)");
  });

  it("solo en turno, nunca en pausa ni al dueño", () => {
    expect(sql).toContain("public.en_turno(x.user_id)");
    expect(sql).toContain("public.turno_en_curso(x.user_id, now())");
    expect(sql).toContain("b.ended_at is null");
    expect(sql).toContain("not public.es_dueno(x.user_id)");
  });

  it("corre cada 2 minutos", () => {
    expect(sql).toContain("cron.schedule('argos-graves', '*/2 * * * *'");
  });

  it("la persona ve el cartel con la voz de Argos en cualquier página", () => {
    expect(cascaron).toContain("<AvisoAlertaGrave />");
  });

  it("el caso del día lo cuenta primero y en rojo", () => {
    const chips = chipsDelCaso({ graves: { sin_actividad: 2 }, alertas: { celular: { n: 1, min: 3 } } });
    expect(chips[0]).toMatchObject({ clave: "grave_sin_actividad", tono: "grave" });
    expect(tonoAviso("argos_grave")).toBe("cometio");
  });
});

describe("ráfaga", () => {
  it("una foto cada 10 s mientras dure, consultada cada 20 s", () => {
    expect(capturador).toContain("const RAFAGA_MS = 10_000;");
    expect(capturador).toContain('rpc("mi_rafaga")');
    expect(sql).toContain("now() + interval '2 minutes'");
  });

  it("la disparan las alertas de Argos y las fotos fuera de lugar", () => {
    expect(sql).toContain("create trigger argos_rafaga_alerta after insert on public.argos_alertas");
    expect(sql).toContain("after update of fuera_de_lugar on public.monitor_capturas");
  });
});

const resumenes = import.meta.glob("../../../../supabase/migrations/20261119170000_argos_resumenes_jefes.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const sqlResumen = Object.values(resumenes)[0] ?? "";

describe("resúmenes para jefes", () => {
  it("11:55 pm a cada jefe directo con su equipo; lunes 7 am la tendencia", () => {
    expect(sqlResumen).toContain("cron.schedule('argos-resumen-dia', '55 4 * * *'");
    expect(sqlResumen).toContain("cron.schedule('argos-tendencia-semana', '0 12 * * 1'");
    expect(sqlResumen).toContain("public.jefes_directos(a.user_id)");
  });

  it("cada quien ve solo a quien puede vigilar", () => {
    expect(sqlResumen).toMatch(/argos_resumen_de\(coalesce\(array_agg\(v\.user_id\), '\{\}'\), _dia\)\s+from public\.argos_vigilables\(\) v/);
  });

  it("la tendencia compara minutos marcados por hora trabajada con 5 h mínimas", () => {
    expect(sqlResumen).toContain("a.medido_min >= 300 and b.medido_min >= 300");
  });
});
