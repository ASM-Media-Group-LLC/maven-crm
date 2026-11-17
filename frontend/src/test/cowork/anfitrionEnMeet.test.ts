import { describe, it, expect } from "vitest";
import { enMeetDeMaven, esSalaDeMeet, estadoDeTiempo, cuentaComoTrabajo, LATIDO_VENCIDO_MS } from "../../../../supabase/functions/_shared/cowork-tiempo";

// GUARDA (Alvaro, 17/11/2026): Luis (anfitrión) dio un Meet de Maven de 14:42 a
// 16:15 UTC y Cowork lo marcó «fuera» desde las 15:00: el vigía abrió el episodio
// con el último tramo del reloj (el Hub, 14:42) y la reunión no contaba en nada.
// Para quien es ANFITRIÓN, estar en un Meet de Maven cuenta como estar en el Hub:
// no suma «fuera», Argos no lo llama por eso y el tiempo entra al reloj como 'meet'.

const sql = import.meta.glob("../../../../supabase/migrations/20261117200000_anfitrion_en_meet_cuenta_como_cowork.sql", { query: "?raw", import: "default", eager: true });
const edge = import.meta.glob("../../../../supabase/functions/cowork-session/index.ts", { query: "?raw", import: "default", eager: true });
const vista = import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

const T = 1_700_000_000_000;

describe("el anfitrión en un Meet de Maven está trabajando", () => {
  it("solo las salas de Meet (meet_…) cuentan; Cowork y el chat no", () => {
    expect(esSalaDeMeet("meet_687f2d47559f")).toBe(true);
    expect(esSalaDeMeet("cowork_hub_ea690a40")).toBe(false);
    expect(esSalaDeMeet("call-abc")).toBe(false);
    expect(esSalaDeMeet(null)).toBe(false);
  });

  it("el latido del Meet vale 90 s, como el del reloj", () => {
    const fila = { sala: "meet_x", last_seen_at: new Date(T - 30_000).toISOString() };
    expect(enMeetDeMaven(fila, T)).toBe(true);
    expect(enMeetDeMaven({ ...fila, last_seen_at: new Date(T - LATIDO_VENCIDO_MS - 1).toISOString() }, T)).toBe(false);
    expect(enMeetDeMaven({ ...fila, sala: "call-x" }, T)).toBe(false);
    expect(enMeetDeMaven(null, T)).toBe(false);
  });

  it("en reunión el reloj marca 'meet' aunque la cámara y la pantalla se fueron al Meet, y cuenta", () => {
    const v = estadoDeTiempo({ camOn: false, screenShareOn: false, enMeet: true }, T);
    expect(v.estado).toBe("meet");
    expect(cuentaComoTrabajo(v.estado)).toBe(true);
  });

  it("la edge lo mira solo para anfitriones y lo suma al meet del latido", () => {
    const e = fuente(edge);
    expect(e).toMatch(/if \(esAnfitrion\) \{\s*const \{ data: llamada \} = await admin\.from\("llamada_maven_latido"\)/);
    expect(e).toMatch(/enMeet: !!enMeet \|\| enMeetMaven/);
  });

  it("la base deja un tramo 'meet' del anfitrión al latir un Meet, sin pisar otro reloj vivo", () => {
    const s = fuente(sql);
    expect(s).toMatch(/create or replace function public\.latir_llamada_maven\(_sala text\)/);
    expect(s).toMatch(/left\(_sala, 5\) <> 'meet_'/);
    expect(s).toMatch(/v_sesion := public\.cowork_sesion_de_anfitrion\(v_uid\)/);
    expect(s).toMatch(/if public\.es_admin_o_dueno\(v_uid\) then return; end if;/);
    expect(s).toMatch(/values \(v_sesion, null, v_uid, 'meet', 'meet_maven'/);
    // Un tramo vivo que no es de reunión (Hub con todo prendido, pausa) manda.
    expect(s).toMatch(/if v_abierto\.estado = 'meet' and v_abierto\.room_id is null then/);
    // Anfitrión = membresía host, cowork_anfitriones o anfitrión en todas.
    expect(s).toMatch(/m\.role = 'host'/);
    expect(s).toMatch(/from public\.cowork_anfitriones x/);
    expect(s).toMatch(/from public\.cowork_anfitriones_en_todas e/);
  });

  it("salir de una llamada solo borra SU latido (no el del Meet de otra pestaña)", () => {
    const s = fuente(sql);
    expect(s).toMatch(/salir_llamada_maven\(_sala text default null\)/);
    expect(s).toMatch(/\(_sala is null or sala = left\(_sala, 200\)\)/);
    const v = fuente(vista);
    expect(v).toMatch(/salirLlamadaEnServidor\(supabase, roomName\)/);
  });

  it("el latido del Meet corre con el reloj del Worker (la pestaña de atrás no lo duerme)", () => {
    const v = fuente(vista);
    expect(v).toMatch(/CriticalTimers\.setInterval\(\(\) => latirLlamadaEnServidor\(supabase, roomName\), LATIDO_SERVIDOR_MS\)/);
    expect(v).toMatch(/CriticalTimers\.clearInterval\(idServidor\)/);
  });
});
