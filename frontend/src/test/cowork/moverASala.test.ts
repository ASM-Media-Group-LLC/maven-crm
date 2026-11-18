import { describe, it, expect } from "vitest";

// GUARDA (Alvaro, 17/11/2026): «Mover a otra sala». Antes cada participante
// elegía su sala y el anfitrión no podía moverlo. Ahora el anfitrión lo mueve
// desde su tablero; la edge valida que es anfitrión de la sesión y que la sala
// es de esa sesión; al participante le llega por Realtime y entra solo.

const edge = import.meta.glob("../../../../supabase/functions/cowork-session/index.ts", { query: "?raw", import: "default", eager: true });
const tablero = import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const participante = import.meta.glob("../../pages/cowork/CoworkParticipantView.tsx", { query: "?raw", import: "default", eager: true });
const hook = import.meta.glob("../../hooks/useCoworkSession.ts", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("mover a una persona a otra sala", () => {
  it("la edge exige anfitrión, sesión activa, sala de la sesión y miembro participante", () => {
    const e = fuente(edge);
    const bloque = e.slice(e.indexOf('if (action === "asignarSala")'), e.indexOf('if (action === "latido")'));
    expect(bloque.length).toBeGreaterThan(0);
    expect(bloque).toMatch(/if \(hostCheck\?\.role !== "host"\) return err\(req, "[^"]+", 403\)/);
    expect(bloque).toMatch(/\.eq\("status", "active"\)/);
    expect(bloque).toMatch(/from\("cowork_rooms"\)\s*\.select\("id, name"\)\.eq\("id", roomId\)\.eq\("session_id", sessionId\)/);
    expect(bloque).toMatch(/if \(miembro && miembro\.role === "host"\)/);
    // Apaga la vigente ANTES de crear la nueva (índice único de una activa por persona).
    expect(bloque.indexOf("update({ is_active: false })")).toBeLessThan(bloque.indexOf(".insert({"));
    expect(bloque).toMatch(/assigned_by: userId/);
  });

  it("el tablero ofrece «Mover a otra sala» con las salas de la sesión", () => {
    const p = fuente(tablero);
    expect(p).toMatch(/t\("cowork\.host\.moveToRoom"\)/);
    expect(p).toMatch(/cowork\.rooms\.map\(\(r\) => \(/);
    expect(p).toMatch(/onClick=\{\(\) => void moverASala\(f\.uid, r\.id\)\}/);
    expect(p).toMatch(/await cowork\.asignarSala\(uid, roomId\)/);
  });

  // SALA FIJA (18/11/2026): mover deja a la persona fija en esa sala, y con
  // quien no está conectado se guarda solo la fija.
  it("mover deja la sala fija, también a quien no está conectado", () => {
    const e = fuente(edge);
    const bloque = e.slice(e.indexOf('if (action === "asignarSala")'), e.indexOf('if (action === "latido")'));
    expect(bloque).toMatch(/soloFija: true/);
    expect(bloque).toMatch(/guardarSalaFija\(admin, \{ sessionId, userId: target, roomId, por: userId \}\)/);
    const p = fuente(tablero);
    expect(p).toMatch(/r\.soloFija \? "cowork\.host\.fixedRoomOffline" : "cowork\.host\.fixedRoom"/);
    expect(p).toMatch(/t\("cowork\.host\.notConnected"\)/);
  });

  it("el participante puede entrar con el código de su sala desde el menú", () => {
    const v = fuente(participante);
    expect(v).toMatch(/onClick=\{\(\) => setCodigoAbierto\(true\)\}/);
    expect(v).toMatch(/await cowork\.joinByCode\(code\)/);
    // La entrada sola no manda sala: el servidor elige la fija.
    expect(v).toMatch(/cowork\.joinSession\(sid, "participant"\)/);
    // Con varias salas y sin fija: pantalla del código, sin reintentar ni «volver a mi sala».
    expect(v).toMatch(/necesitaCodigo\) \{ setNecesitaCodigo\(true\); return; \}/);
    expect(v).toMatch(/\{lastRoomId && !necesitaCodigo && \(/);
  });

  it("el hook llama a la acción de la edge", () => {
    expect(fuente(hook)).toMatch(/invokeCowork\("asignarSala", \{ sessionId, targetUserId, roomId \}\)/);
  });

  it("el participante entra solo a la sala nueva (su asignación manda la llamada)", () => {
    const v = fuente(participante);
    // Cambia la sala asignada → se conecta a la sala nueva de LiveKit.
    expect(v).toMatch(/if \(myRoom\?\.livekit_room_name && myRoom\.livekit_room_name !== connectedLkRoom\) \{\s*setConnectedLkRoom\(myRoom\.livekit_room_name\);/);
    // Si lo movió otro, se le avisa y entra como tenía la anterior.
    expect(v).toMatch(/myAssignment\.assigned_by && myAssignment\.assigned_by !== userId/);
    expect(v).toMatch(/traducir\("cowork\.participant\.movedByHost"/);
  });
});
