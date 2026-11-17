import { describe, it, expect } from "vitest";
// La edge es Deno; la lógica pura sí se puede probar desde aquí (mismo patrón
// que correo/bodystructure.test.ts).
import {
  carpetaDelMes, conQuienCompartir, limpiarNombre, nombreDelArchivo, partesDe, rangoDeParte, TAMANO_PARTE, usuarioDeIdentidad,
} from "../../../../supabase/functions/_shared/grabacion-al-drive";

const migracion = Object.values(import.meta.glob("../../../../supabase/migrations/20261117230000_grabaciones_al_drive.sql", { query: "?raw", import: "default", eager: true }))[0] as string;
const edge = Object.values(import.meta.glob("../../../../supabase/functions/grabaciones-al-drive/index.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const recordings = Object.values(import.meta.glob("../../../../supabase/functions/recordings/index.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const webhook = Object.values(import.meta.glob("../../../../supabase/functions/livekit-webhook/index.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const config = Object.values(import.meta.glob("../../../../supabase/config.toml", { query: "?raw", import: "default", eager: true }))[0] as string;

const U = "0f3c2a4e-1b2c-4d5e-8f90-123456789abc";

describe("nombres de la copia en el Drive", () => {
  it("la carpeta del mes y el archivo van en hora de Colombia", () => {
    // 2026-12-01 03:30 UTC = 30/11 22:30 en Bogotá.
    expect(carpetaDelMes("2026-12-01T03:30:00Z")).toBe("2026-11");
    expect(nombreDelArchivo("PLUS 3", "cowork_a6bae2d8_2", "2026-12-01T03:30:00Z")).toBe("PLUS 3 2026-11-30 22.30.mp4");
  });
  it("sin título usa la sala; nunca deja «/», «\\» ni «:» (el Drive y Windows los rechazan)", () => {
    const n = nombreDelArchivo(null, "meet_687f/2d47", "2026-11-17T21:14:00Z");
    expect(n).toBe("meet_687f 2d47 2026-11-17 16.14.mp4");
    expect(nombreDelArchivo("  a\\b/c\n ", "x", "2026-11-17T21:14:00Z")).not.toMatch(/[\\/:\n]/);
    expect(limpiarNombre("   ")).toBe("");
    expect(nombreDelArchivo("   ", "", "2026-11-17T21:14:00Z")).toMatch(/^Reunión /);
  });
  it("el nombre nunca pasa los 255 caracteres del CHECK de drive_items", () => {
    expect(nombreDelArchivo("x".repeat(600), "s", "2026-11-17T21:14:00Z").length).toBeLessThanOrEqual(255);
  });
});

describe("quién es de Maven en la sala", () => {
  it("lee las identidades de livekit-token y de cowork-session", () => {
    expect(usuarioDeIdentidad(U)).toBe(U);
    expect(usuarioDeIdentidad(`${U}_ab12`)).toBe(U);
    expect(usuarioDeIdentidad(`${U}__pantalla`)).toBe(U);
    expect(usuarioDeIdentidad(U.toUpperCase())).toBe(U);
  });
  it("el grabador, los invitados y lo raro no cuentan", () => {
    expect(usuarioDeIdentidad("EG_abc123")).toBeNull();
    expect(usuarioDeIdentidad("invitado-maria")).toBeNull();
    expect(usuarioDeIdentidad(`${U}x`)).toBeNull();
    expect(usuarioDeIdentidad(undefined)).toBeNull();
  });
  it("se comparte con participantes y destinatarios, sin repetir y sin el dueño", () => {
    const otro = "11111111-2222-4333-8444-555555555555";
    expect(conQuienCompartir(U, [U, otro], [otro.toUpperCase(), U])).toEqual([otro]);
  });
});

describe("partes de 32 MB", () => {
  it("chico va de un PUT; grande en partes con el último rango justo", () => {
    expect(partesDe(TAMANO_PARTE)).toBe(0);
    expect(partesDe(TAMANO_PARTE + 1)).toBe(2);
    expect(rangoDeParte(1, TAMANO_PARTE + 10)).toEqual({ desde: TAMANO_PARTE, hasta: TAMANO_PARTE + 9 });
    expect(() => partesDe(0)).toThrow();
  });
});

describe("guarda: el circuito de la copia al Drive sigue entero", () => {
  it("toda grabación lista entra a la fila, por trigger (venga de Detener, webhook o barrido)", () => {
    expect(migracion).toMatch(/after insert or update of status on public\.meeting_recordings/);
    expect(migracion).toMatch(/new\.status = 'ready'/);
  });
  it("las tablas nuevas no se leen desde el navegador", () => {
    expect(migracion).toMatch(/revoke all on public\.grabaciones_al_drive from anon, authenticated/);
    expect(migracion).toMatch(/revoke all on public\.meeting_recording_participantes from anon, authenticated/);
    expect(migracion).toMatch(/grabaciones_al_drive_tick[\s\S]*cron\.schedule/);
  });
  it("una sola ronda a la vez (si no, dos carpetas «Grabaciones» para la misma persona)", () => {
    expect(migracion).toMatch(/pg_advisory_xact_lock/);
    expect(edge).toMatch(/grabaciones_al_drive_tomar/);
  });
  it("la edge solo la despierta el cron y está en config.toml", () => {
    expect(edge).toMatch(/tokenDeCronValido\(req\.headers\.get\("x-cron-token"\), Deno\.env\.get\("CRON_INTERNAL_TOKEN"\)\)/);
    expect(config).toMatch(/\[functions\.grabaciones-al-drive\]/);
  });
  it("se da por lista solo con el recibo firmado del NAS o el archivo entero allí", () => {
    expect(edge).toMatch(/rec\.op === "recibo" && rec\.k === k/);
    expect(edge).toMatch(/yaEstaEnNas\(k, size\)/);
  });
  it("se comparte solo con gente de la agencia de la grabación", () => {
    expect(edge).toMatch(/deLaAgencia\(admin, g\.tenant_id, candidatos\)/);
  });
  it("los participantes se anotan al grabar, al parar, en el barrido y desde el webhook", () => {
    expect(recordings.match(/await anotarParticipantes\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(webhook).toMatch(/participant_joined[\s\S]*grabacion_anotar_participantes/);
  });
});
