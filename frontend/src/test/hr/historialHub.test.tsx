// GUARDA del Historial del Hub en Argos (Alvaro, 19/11/2026: «quiero saber si
// los supervisores lo apagan a propósito o si falla el sistema»).
//   · La base anota SOLO los cambios (pantalla, cámara, entrar/salir del Hub).
//   · El vigía anota «salió» de quien se cortó sin señal.
//   · hub_historial solo para quien ve Argos (42501), del tenant actual.
//   · La pestaña muestra la línea de tiempo, el error con «Reintentar» y el día vacío.
//   · Al supervisor, un aviso discreto cuando ÉL quita algo.
// El banco con la base de verdad: supabase/tests/hub_historial.ts (PGlite).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let respuesta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const rpc = vi.fn(async () => respuesta);
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import { HistorialHubPanel } from "@/components/hr/HistorialHubPanel";
import { claveDeCausaDeEvento, claveDeEvento, diaBogota, leerHistorialHub, quienFue } from "@/lib/historialHub";
import { AVISO_ANOTADO_MS, cambiosAnotados } from "@/lib/senalDelHub";
import { hr } from "@/lib/i18n/hr";
import { cowork } from "@/lib/i18n/cowork";

type Glob = (p: string, o: Record<string, unknown>) => Record<string, string>;
const migracion = Object.values((import.meta as unknown as { glob: Glob }).glob("../../../../supabase/migrations/20261119014500_hub_historial_supervisores.sql", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const migracionVieja = Object.values((import.meta as unknown as { glob: Glob }).glob("../../../../supabase/migrations/20261119012000_hub_supervisores_senal_y_avisos.sql", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const hook = Object.values((import.meta as unknown as { glob: Glob }).glob("../../hooks/useHubDelSupervisor.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const argos = Object.values((import.meta as unknown as { glob: Glob }).glob("../../pages/hr/HRMonitorIA.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const turnoTabla = Object.values((import.meta as unknown as { glob: Glob }).glob("../../components/hr/TurnoTabla.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";

const funcion = (sql: string, nombre: string) => {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) return "";
  const j = sql.indexOf("$$;", sql.indexOf("$$", i) + 2);
  return sql.slice(i, j + 3);
};

describe("la base anota solo los cambios", () => {
  const reportar = funcion(migracion, "hub_reportar_senal");
  it("la tabla existe, con RLS y sin acceso directo, 30 días", () => {
    expect(migracion).toMatch(/create table if not exists public\.hub_eventos/);
    expect(migracion).toMatch(/check \(tipo in \('pantalla', 'camara', 'hub'\)\)/);
    expect(migracion).toMatch(/alter table public\.hub_eventos enable row level security/);
    expect(migracion).toMatch(/revoke all on public\.hub_eventos from anon, authenticated/);
    expect(migracion).toMatch(/hub_eventos \(user_id, creado desc\)/);
    expect(migracion).toMatch(/delete from public\.hub_eventos where creado < v_ahora - interval '30 days'/);
  });
  it("hub_reportar_senal conserva la misma firma y el mismo upsert de la señal", () => {
    expect(reportar).toContain("_session_id uuid,\n  _en_hub boolean,\n  _cam_on boolean,\n  _pantalla text,\n  _conexion text,\n  _en_pausa boolean,\n  _salida text default null");
    const upsertViejo = funcion(migracionVieja, "hub_reportar_senal").match(/on conflict \(user_id\) do update set[\s\S]*?actualizado {4}= now\(\);/)?.[0];
    expect(upsertViejo).toBeTruthy();
    expect(reportar).toContain(upsertViejo!);
  });
  it("cámara y pantalla se anotan solo si cambian contra la señal anterior", () => {
    expect(reportar).toMatch(/if v_cam is distinct from v_cam_ant then\s+insert into public\.hub_eventos/);
    expect(reportar).toMatch(/if v_pant is distinct from v_pant_ant then\s+insert into public\.hub_eventos/);
    // Entrar solo si lo último no fue «entró»; salir solo si lo último fue «entró».
    expect(reportar).toMatch(/if v_dentro and v_ult is distinct from 'entro' then/);
    expect(reportar).toMatch(/elsif not v_dentro and v_ult = 'entro' then/);
    expect(reportar).toMatch(/when _salida = 'cerro' then 'salio'/);
  });
});

describe("el vigía anota la salida de quien se cortó", () => {
  const vigia = funcion(migracion, "vigilar_supervisores_hub");
  it("todo lo de antes sigue igual (episodios y avisos)", () => {
    const viejo = funcion(migracionVieja, "vigilar_supervisores_hub");
    const pasos = viejo.slice(viejo.indexOf("-- 1) Abrir"), viejo.indexOf("-- Lo viejo no sirve"));
    expect(pasos.length).toBeGreaterThan(500);
    expect(vigia).toContain(pasos);
    expect(vigia).toContain("delete from public.hub_alertas where hasta < v_ahora - interval '30 days';");
  });
  it("sin señal hace más de 90 s y lo último fue «entró» → «salió» con la mejor causa", () => {
    expect(vigia).toMatch(/insert into public\.hub_eventos[\s\S]*'hub', 'salio',\s+public\.hub_causa_salida\(s\.user_id, s\.salida, s\.conexion, v_ahora\)/);
    expect(vigia).toMatch(/on u\.valor = 'entro'/);
    expect(vigia).toMatch(/s\.actualizado <= v_ahora - interval '90 seconds'/);
  });
  it("la causa sigue la misma regla que el aviso (salió, app, internet, dormido, sin señal)", () => {
    const causa = funcion(migracion, "hub_causa_salida");
    for (const c of ["'salio'", "'app_caida'", "'conexion'", "'equipo_dormido'", "'sin_senal'"]) expect(causa).toContain(c);
    expect(causa.indexOf("'salio'")).toBeLessThan(causa.indexOf("'app_caida'"));
    expect(causa.indexOf("'app_caida'")).toBeLessThan(causa.indexOf("'conexion'"));
  });
});

describe("hub_historial: solo quien ve Argos", () => {
  const h = funcion(migracion, "hub_historial");
  it("sin ve_argos lanza 42501 (nunca «sin movimientos»)", () => {
    expect(h).toMatch(/if v_uid is null or not coalesce\(public\.ve_argos\(\), false\) then\s+raise exception '[^']+' using errcode = '42501'/);
  });
  it("del tenant actual; el supervisor solo ve lo suyo; día de Bogotá", () => {
    expect(h).toContain("public.current_tenant_id()");
    expect(h).toMatch(/v_solo := case when v_todo then _user else v_uid end/);
    expect(h).toContain("America/Bogota");
    expect(h).toContain("security definer");
    expect(migracion).toMatch(/revoke all on function public\.hub_historial\(date, uuid\) from public, anon;/);
    expect(migracion).toMatch(/grant execute on function public\.hub_historial\(date, uuid\) to authenticated;/);
  });
});

describe("la lógica de la pestaña", () => {
  it("un fallo no es «vacío»: lo que no tiene forma lanza", () => {
    expect(() => leerHistorialHub(null)).toThrow();
    expect(() => leerHistorialHub({ eventos: null, resumen: [] })).toThrow();
    expect(leerHistorialHub({ eventos: [], resumen: [] })).toEqual({ eventos: [], resumen: [] });
  });
  it("a propósito, falla del sistema o sin saber", () => {
    expect(quienFue({ tipo: "pantalla", valor: "sin_pantalla", causa: "apagada" })).toBe("proposito");
    expect(quienFue({ tipo: "pantalla", valor: "sin_pantalla", causa: "negra" })).toBe("falla");
    expect(quienFue({ tipo: "pantalla", valor: "sin_pantalla", causa: "permiso" })).toBe("falla");
    expect(quienFue({ tipo: "camara", valor: "apagada", causa: "apagada" })).toBe("proposito");
    expect(quienFue({ tipo: "hub", valor: "salio", causa: "salio" })).toBe("proposito");
    expect(quienFue({ tipo: "hub", valor: "salio", causa: "conexion" })).toBe("falla");
    expect(quienFue({ tipo: "hub", valor: "salio", causa: "app_caida" })).toBe("falla");
    expect(quienFue({ tipo: "hub", valor: "salio", causa: "sin_senal" })).toBe("dudoso");
    expect(quienFue({ tipo: "hub", valor: "entro", causa: null })).toBe("bien");
  });
  it("cada texto existe en español y en inglés", () => {
    const tipos = [["pantalla", "compartiendo"], ["pantalla", "sin_pantalla"], ["camara", "prendida"], ["camara", "apagada"], ["hub", "entro"], ["hub", "salio"]] as const;
    for (const [tipo, valor] of tipos) expect(hr[claveDeEvento({ tipo, valor }) as keyof typeof hr]).toBeTruthy();
    const causas = [["pantalla", "apagada"], ["pantalla", "negra"], ["pantalla", "permiso"], ["pantalla", "falla"], ["pantalla", "sin_pedir"],
      ["camara", "apagada"], ["camara", "pausa"], ["hub", "salio"], ["hub", "app_caida"], ["hub", "conexion"], ["hub", "equipo_dormido"], ["hub", "sin_senal"]] as const;
    for (const [tipo, causa] of causas) {
      const k = claveDeCausaDeEvento({ tipo, causa });
      expect(k, `${tipo}:${causa}`).toBeTruthy();
      expect(hr[k as keyof typeof hr]).toBeTruthy();
    }
  });
  it("el día va en hora de Bogotá", () => {
    // 03:00 UTC del 20/11 = 22:00 del 19/11 en Bogotá.
    expect(diaBogota(new Date("2026-11-20T03:00:00Z"))).toBe("2026-11-19");
    expect(diaBogota(new Date("2026-11-20T03:00:00Z"), 1)).toBe("2026-11-18");
  });
  // 27/11/2026 (Alvaro): la pestaña se quitó; lo del Hub vive en Shift (fila «Hub»
  // del supervisor y sus movimientos en «Lo que pasó») y los enlaces viejos abren Shift.
  it("Argos ya no tiene la pestaña: lo del Hub está en Shift", () => {
    expect(argos).not.toContain('{ k: "hub", label: t("hr.monia.tab.hub") }');
    expect(argos).toContain('hub: "turno"');
    expect(turnoTabla).toContain('rpc("hub_historial"');
    expect(turnoTabla).toContain("celdaHub(t, hub)");
  });
});

describe("la pestaña en pantalla", () => {
  beforeEach(() => { rpc.mockClear(); });

  it("muestra el resumen y, al abrir, la línea de tiempo con la causa", async () => {
    respuesta = {
      data: {
        dia: "2026-11-19",
        eventos: [
          { id: 2, user_id: "u1", nombre: "Vanessa Ruiz", tipo: "pantalla", valor: "sin_pantalla", causa: "apagada", creado: "2026-11-19T15:10:00Z" },
          { id: 1, user_id: "u1", nombre: "Vanessa Ruiz", tipo: "hub", valor: "entro", causa: null, creado: "2026-11-19T14:00:00Z" },
        ],
        resumen: [{ user_id: "u1", nombre: "Vanessa Ruiz", movimientos: 2, pantalla_quitada: 1, pantalla_falla: 0, camara_apagada: 0,
          salidas: 0, salidas_propias: 0, salidas_falla: 0, min_sin_pantalla: 4, min_sin_camara: 0, min_fuera: 0 }],
      },
      error: null,
    };
    render(<HistorialHubPanel />);
    const fila = await screen.findByRole("button", { expanded: false });
    expect(fila.textContent).toContain("Vanessa Ruiz");
    expect(fila.textContent).toContain("hr.hubHist.res.pantallaQuitada");
    expect(rpc).toHaveBeenCalledWith("hub_historial", { _desde: diaBogota() });
    fireEvent.click(fila);
    expect(screen.getByText("hr.hubHist.ev.pantallaOff")).toBeTruthy();
    expect(screen.getByText("hr.hubHist.causa.pantalla_apagada")).toBeTruthy();
    expect(screen.getByText("hr.hubHist.quien.proposito")).toBeTruthy();
    expect(screen.getByText("hr.hubHist.ev.entro")).toBeTruthy();
  });

  it("un fallo se dice como fallo y se puede reintentar", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    render(<HistorialHubPanel />);
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("hr.hubHist.error");
    expect(screen.queryByText("hr.hubHist.vacio")).toBeNull();
    respuesta = { data: { eventos: [], resumen: [] }, error: null };
    fireEvent.click(screen.getByText("hr.hubHist.reintentar"));
    await waitFor(() => expect(screen.getByText("hr.hubHist.vacio")).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("ayer pide el día anterior", async () => {
    respuesta = { data: { eventos: [], resumen: [] }, error: null };
    render(<HistorialHubPanel />);
    await screen.findByText("hr.hubHist.vacio");
    fireEvent.click(screen.getByText("hr.hubHist.ayer"));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("hub_historial", { _desde: diaBogota(new Date(), 1) }));
  });
});

describe("al supervisor: un aviso discreto cuando él quita algo", () => {
  it("quitar la pantalla o apagar la cámara avisa; una falla, el negro o la pausa no", () => {
    const bien = { camOn: true, pantalla: "compartiendo" as const };
    expect(cambiosAnotados(bien, { camOn: true, pantalla: "apagada", enPausa: false })).toEqual(["pantalla"]);
    expect(cambiosAnotados(bien, { camOn: false, pantalla: "compartiendo", enPausa: false })).toEqual(["camara"]);
    expect(cambiosAnotados(bien, { camOn: true, pantalla: "falla", enPausa: false })).toEqual([]);
    expect(cambiosAnotados(bien, { camOn: true, pantalla: "negra", enPausa: false })).toEqual([]);
    expect(cambiosAnotados(bien, { camOn: false, pantalla: "compartiendo", enPausa: true })).toEqual([]);
    // La señal repetida no vuelve a avisar.
    expect(cambiosAnotados({ camOn: true, pantalla: "apagada" }, { camOn: true, pantalla: "apagada", enPausa: false })).toEqual([]);
    // La primera señal no avisa.
    expect(cambiosAnotados(null, { camOn: false, pantalla: "apagada", enPausa: false })).toEqual([]);
  });
  it("discreto: en una esquina, sin sonido, se va solo a los ~6 s", () => {
    expect(AVISO_ANOTADO_MS).toBe(6_000);
    expect(hook).toMatch(/toast\(texto, \{ id: `hub-anotado-\$\{cual\}`, duration: AVISO_ANOTADO_MS, position: "bottom-right" \}\)/);
    expect(hook).not.toMatch(/toast\.(error|warning)|new Audio|anunciarVoz|playSound/);
    // Al salir del Hub también.
    expect(hook).toContain('avisarAnotado(tRef.current(TEXTO_ANOTADO.salida), "salida")');
  });
  it("el texto es informativo, en español y en inglés", () => {
    for (const k of ["cowork.hubAnotado.pantalla", "cowork.hubAnotado.camara", "cowork.hubAnotado.salida"] as const) {
      expect(cowork[k].es).toContain("Queda anotado en el historial del Hub.");
      expect(cowork[k].en).toBeTruthy();
    }
  });
});
