import { describe, expect, it } from "vitest";
import { estaEnTurno, marcarEnTurno } from "@/lib/turnoActivo";
import { escucharPedidos, pedirACowork, type PedidoACowork } from "@/lib/pedidoACowork";
import { duracion, reloj } from "@/components/turno/PiezasTurno";

// MARCAR ENTRADA / PAUSA / SALIDA (Alvaro, 19/11/2026): «vemos la pantalla cuando
// están trabajando y ya». Obligatorio desde el 20/11/2026 00:00 Bogotá.

const fuentes = (import.meta as unknown as {
  glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/hooks/useFaceNudge.ts",
  "/frontend/src/hooks/useArgosEscritorio.ts",
  "/frontend/src/components/dashboard/DashboardSidebar.tsx",
  "/frontend/src/components/dashboard/AppShell.tsx",
  "/supabase/functions/monitor-vision/index.ts",
  "/supabase/migrations/20261119080000_turno_marcar_entrada.sql",
], { query: "?raw", import: "default", eager: true });
const de = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";

describe("la bandera «en turno»", () => {
  it("arranca en true (si la base no responde, Maven sigue como hoy) y cambia", () => {
    expect(estaEnTurno()).toBe(true);
    marcarEnTurno(false);
    expect(estaEnTurno()).toBe(false);
    marcarEnTurno(true);
    expect(estaEnTurno()).toBe(true);
  });
});

describe("pedidos de la tarjeta a Cowork", () => {
  it("si Cowork no está abierto, el pedido espera y se atiende al abrirlo", () => {
    expect(pedirACowork({ tipo: "pausar", kind: "bano" })).toBe(false);
    const vistos: PedidoACowork[] = [];
    const quitar = escucharPedidos((p) => { vistos.push(p); return true; });
    expect(vistos).toEqual([{ tipo: "pausar", kind: "bano" }]);
    expect(pedirACowork({ tipo: "volver" })).toBe(true);
    expect(vistos).toHaveLength(2);
    quitar();
  });
  it("una salida sin Cowork abierto no queda guardada", () => {
    expect(pedirACowork({ tipo: "salida" })).toBe(false);
    const vistos: PedidoACowork[] = [];
    const quitar = escucharPedidos((p) => { vistos.push(p); return true; });
    expect(vistos).toHaveLength(0);
    quitar();
  });
});

describe("relojes de la tarjeta", () => {
  it("formatea el reloj y la duración", () => {
    expect(reloj(2 * 3600 + 14 * 60 + 5)).toBe("2:14:05");
    expect(duracion(14 * 60)).toBe("14 min");
    expect(duracion(2 * 3600 + 14 * 60)).toBe("2 h 14 min");
  });
});

describe("fuera de turno no se mira nada (candados)", () => {
  it("las fotos y el clip de Argos en la llamada solo corren en turno", () => {
    const c = de("LiveKitCallView.tsx");
    expect(c).toContain("const enTurno = useEnTurno();");
    expect(c.match(/argosConCamara && enTurno,/g)?.length).toBe(3);
  });
  it("los llamados de Argos y el vigía de apps se saltan fuera de turno", () => {
    expect(de("useFaceNudge.ts").match(/!estaEnTurno\(\)/g)?.length).toBe(2);
    expect(de("useArgosEscritorio.ts")).toContain("if (!estaEnTurno()) return;");
  });
  it("monitor-vision no gasta IA fuera de turno", () => {
    expect(de("monitor-vision/index.ts")).toContain('admin.rpc("en_turno", { _uid: user.id })');
  });
  it("la base: las fotos piden en_turno y Cowork obliga solo en turno", () => {
    const m = de("20261119080000_turno_marcar_entrada.sql");
    expect(m).toMatch(/alter policy monitor_capturas_ins_propio[\s\S]*public\.en_turno\(user_id\)/);
    expect(m).toMatch(/public\.debe_estar_en_cowork\(\(select auth\.uid\(\)\)\) and public\.en_turno\(\(select auth\.uid\(\)\)\)/);
    expect(m).toContain("'2026-11-20 05:00:00+00'");
  });
  it("la tarjeta está en el menú y el aviso para todos en la app", () => {
    expect(de("DashboardSidebar.tsx")).toContain("<TurnoEnMenu compacto={collapsed} />");
    expect(de("AppShell.tsx")).toContain("<AvisoNovedadTurno />");
  });
});
