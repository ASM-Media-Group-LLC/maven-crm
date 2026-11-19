import { describe, expect, it } from "vitest";
import { calcularEnTurno } from "@/lib/turnoActivo";

// «Maven sigue viendo las pantallas cuando ya no están trabajando… ya no se
// puede hacer» (Alvaro, 19/11/2026). Fuera del turno nadie mira: ni fotos, ni
// videos, ni la pantalla en vivo de Cowork.

const migracion = Object.values(import.meta.glob("../../../../supabase/migrations/20261119180000_nadie_mira_fuera_de_turno.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>)[0] ?? "";
const fuentes = import.meta.glob(["../../pages/messenger/videocall/LiveKitCallView.tsx", "../../pages/cowork/CoworkParticipantView.tsx"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const llamada = Object.entries(fuentes).find(([k]) => k.endsWith("LiveKitCallView.tsx"))?.[1] ?? "";
const cowork = Object.entries(fuentes).find(([k]) => k.endsWith("CoworkParticipantView.tsx"))?.[1] ?? "";

const base = { aplica: true, obligatorio: false, abierta: false, turno_inicio: "2026-11-19T13:00:00Z", turno_fin: "2026-11-19T21:00:00Z" };

describe("la misma regla que el servidor", () => {
  it("antes del corte: solo dentro de su horario", () => {
    expect(calcularEnTurno(base, Date.parse("2026-11-19T15:00:00Z"))).toBe(true);
    expect(calcularEnTurno(base, Date.parse("2026-11-19T22:00:00Z"))).toBe(false);
    expect(calcularEnTurno(base, Date.parse("2026-11-19T12:59:00Z"))).toBe(false);
    expect(calcularEnTurno({ ...base, turno_inicio: null, turno_fin: null }, Date.now())).toBe(false);
  });

  it("desde el corte: solo con la entrada marcada", () => {
    expect(calcularEnTurno({ ...base, obligatorio: true, abierta: false }, Date.parse("2026-11-19T15:00:00Z"))).toBe(false);
    expect(calcularEnTurno({ ...base, obligatorio: true, abierta: true }, Date.parse("2026-11-19T23:00:00Z"))).toBe(true);
  });

  it("a quien no marca turno (dueño, admins, exentos) no se le toca", () => {
    expect(calcularEnTurno({ ...base, aplica: false }, Date.parse("2026-11-19T23:00:00Z"))).toBe(true);
  });
});

describe("el servidor", () => {
  it("en_turno: horario antes del corte, entrada marcada después", () => {
    expect(migracion).toContain("else exists (select 1 from public.turno_en_curso(_uid, now()))");
    expect(migracion).toContain("then exists (select 1 from public.turno_marcas m where m.user_id = _uid and m.fin is null)");
  });

  it("los buzones de fotos y videos no aceptan archivos fuera del turno", () => {
    expect(migracion).toMatch(/alter policy monitor_capturas_upload_propio[\s\S]*public\.en_turno\(\(select auth\.uid\(\)\)\)/);
    expect(migracion).toMatch(/alter policy argos_clips_obj_ins[\s\S]*public\.en_turno\(\(select auth\.uid\(\)\)\)/);
  });
});

describe("Cowork", () => {
  it("fuera del turno no comparte la pantalla sola y deja de compartirla", () => {
    expect(llamada).toMatch(/const pantallaSola = [^;]*&& enTurno &&/);
    expect(llamada).toContain("if (enTurno || !supervisorEncuadre) return;");
  });

  it("al marcar salida se sale de la sala", () => {
    expect(cowork).toContain("void salirDeLaSalaRef.current?.();");
    expect(cowork).toContain("salirDeLaSalaRef.current = handleLeaveRoom;");
  });
});
