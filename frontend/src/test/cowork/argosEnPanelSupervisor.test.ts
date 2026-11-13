import { describe, it, expect } from "vitest";

// GUARDA (Alvaro, 13/11/2026): Daniel, Breyner, Vanessa y Luis trabajan desde el
// panel de supervisor de Cowork (el Hub). Ahí su tiempo cuenta como trabajo y
// Argos les pide cámara y pantalla y les toma fotos, como a todos — menos a los
// admins y al dueño. Antes salían «no ha entrado» todo el día.
const panel = import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const edge = import.meta.glob("../../../../supabase/functions/cowork-session/index.ts", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("Argos en el panel del supervisor", () => {
  const p = fuente(panel);
  const e = fuente(edge);

  it("el Hub prende a Argos (fotos, encuadre, pantalla) solo si no es admin", () => {
    expect(p).toMatch(/const vigilarAnfitrion = miRol !== null && !isAdmin;/);
    expect(p).toMatch(/supervisorEncuadre: vigilarAnfitrion,/);
    expect(p).toMatch(/onMediaStateChange: \(m\) =>\s*actualizarLatido/);
  });

  it("el panel late mientras el Hub está conectado y lo cierra al colgar", () => {
    expect(p).toMatch(/if \(!sesionDelHub \|\| !hubConnected \|\| !vigilarAnfitrion\) return;\s*iniciarLatido\(sesionDelHub/);
    expect(p).toMatch(/detenerLatido\(\);\s*void cowork\.leaveRoom\?\.\(\);/);
  });

  it("el servidor le cuenta el reloj al anfitrión sin sala y le exige cámara y pantalla", () => {
    expect(e).toMatch(/esAnfitrion = membresia\?\.role === "host";/);
    expect(e).toMatch(/const exige = esAnfitrion \? EXIGE_TODO : exigenciasDelReloj/);
    expect(e).toMatch(/room_id: salaId/);
  });
});
