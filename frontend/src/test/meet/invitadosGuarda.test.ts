import { describe, it, expect } from "vitest";

// Guardas de fuente: las reglas de Alvaro (17/11/2026) para Meet con gente de
// afuera, leídas del código de las edges y de la migración.

const leer = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const MEET_GUEST = leer(import.meta.glob("../../../../supabase/functions/meet-guest/index.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const MEET_ROOM = leer(import.meta.glob("../../../../supabase/functions/meet-room/index.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const MIGRACION = leer(import.meta.glob("../../../../supabase/migrations/20261117210000_meet_links_invitado.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const VIDEOCALL = leer(import.meta.glob("../../pages/VideoCallPage.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const APP = leer(import.meta.glob("../../App.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>);

function bloque(fuente: string, desde: string, hasta: string): string {
  const i = fuente.indexOf(desde);
  const j = fuente.indexOf(hasta, i + desde.length);
  return i < 0 ? "" : fuente.slice(i, j < 0 ? undefined : j);
}

describe("invitado de afuera: el token es solo de LiveKit y de esa sala", () => {
  const joinLink = bloque(MEET_GUEST, 'action === "linkInfo" || action === "joinLink"', 'if (action === "leave")');

  it("joinLink existe y valida la firma, el vencimiento y el anulado", () => {
    expect(joinLink).toContain("verificarLink(body.link");
    expect(joinLink).toContain("revoked_at");
    expect(joinLink).toContain("expires_at");
  });

  it("la sala del token sale de la fila del link, nunca del pedido", () => {
    expect(joinLink).toMatch(/createGuestToken\([^)]*link\.livekit_room_name\)/);
    expect(joinLink).not.toMatch(/body\.(room|livekitRoom)/);
  });

  it("el invitado nunca modera y solo publica mic, cámara y pantalla", () => {
    expect(MEET_GUEST).toContain("roomAdmin: false");
    expect(MEET_GUEST).toContain('canPublishSources: ["microphone", "camera", "screen_share", "screen_share_audio"]');
  });

  it("el link se apaga si quien lo repartió ya no es supervisor o cambió de agencia", () => {
    expect(joinLink).toContain('_group: "supervisor_or_above"');
    expect(joinLink).toContain("agenciaDeSala(admin, link.livekit_room_name)");
  });

  it("nunca se crea sesión de Supabase para el invitado", () => {
    expect(MEET_GUEST).not.toMatch(/auth\.admin\.(createUser|generateLink)|signIn/);
  });
});

describe("quién invita: supervisores y arriba", () => {
  it("crear, agendar, repartir links y admitir exigen supervisor_or_above", () => {
    for (const accion of ['action === "create"', 'action === "inviteLink"', 'action === "schedule"', 'action === "decideGuest"']) {
      const b = bloque(MEET_ROOM, accion, "// ═══════");
      expect(b, accion).toContain("esSupervisorOMas(admin, userId)");
    }
    expect(MEET_ROOM).not.toContain('_fallback_group: "member"');
  });

  it("el correo del Meet agendado lo arma el servidor (no acepta HTML del cliente)", () => {
    const b = bloque(MEET_ROOM, 'action === "schedule"', 'action === "end"');
    expect(b).not.toMatch(/body\.html|body\.subject/);
    expect(b).toContain("escapar(name)");
    expect(b).toContain("correosDeInvitacion(body.emails)");
  });

  it("en la llamada, el botón y la sala de espera solo para supervisores y arriba", () => {
    expect(VIDEOCALL).toMatch(/isSupervisorOrAbove && salaAdmiteInvitados\(roomName\)/);
    expect(VIDEOCALL).toMatch(/roomName\.startsWith\("meet_"\) && isSupervisorOrAbove && <MeetGuestGate/);
  });
});

describe("migración y ruta pública", () => {
  it("la tabla de links no guarda el link en claro y solo la escriben las edges", () => {
    expect(MIGRACION).toContain("create table if not exists public.meet_invite_links");
    expect(MIGRACION).not.toMatch(/\b(token|secret|link_text)\s+text/i);
    expect(MIGRACION).not.toMatch(/for (insert|update|delete)/i);
    expect(MIGRACION).toContain("(select auth.uid())");
  });

  it("/unirse/:link es pública (fuera de ProtectedRoute)", () => {
    expect(APP).toContain('<Route path="/unirse/:link" element={<MeetLinkPage />} />');
  });
});
