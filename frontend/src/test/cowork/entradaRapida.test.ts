import { describe, it, expect } from "vitest";

// Alvaro, 17/11/2026: «el cowork se tarda mucho en entrar, ya sea en la
// aplicación o en la página». Tres esperas que no hacían falta:
//  1) las 7 consultas de la sesión iban una detrás de otra;
//  2) al unirse, la relectura prendía la ruedita y desmontaba la vista;
//  3) el chatter esperaba a buscar su última sala antes de entrar (el servidor
//     ya la elige).

const hook = Object.values(import.meta.glob("../../hooks/useCoworkSession.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const vista = Object.values(import.meta.glob("../../pages/cowork/CoworkParticipantView.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const pagina = Object.values(import.meta.glob("../../pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("entrar a Cowork rápido", () => {
  it("las consultas de la sesión van a la vez, no una detrás de otra", () => {
    const carga = hook.slice(hook.indexOf("const fetchData = useCallback"), hook.indexOf("} finally {", hook.indexOf("const fetchData = useCallback")));
    expect(carga).toMatch(/await Promise\.all\(\[/);
    // Ninguna consulta de las tablas de la sesión queda suelta con su propio await.
    expect(carga).not.toMatch(/await supabase\.from\("cowork_(sessions|rooms|memberships|room_assignments|host_requests|screenshare_requests)"\)/);
    expect(carga).toMatch(/supabase\.auth\.getSession\(\)/);
  });

  it("después de unirse, la relectura es silenciosa (sin ruedita)", () => {
    expect(vista).toMatch(/\.then\(\(\) => cowork\.refetch\(true\)\)/);
    expect(pagina).not.toMatch(/joinSession\([^)]*\);\s*cowork\.refetch\(\);/);
  });

  it("el chatter no espera a buscar su última sala para entrar", () => {
    expect(vista).not.toMatch(/myAssignment \|\| lastRoomId === undefined \|\| autoEntro/);
  });
});
