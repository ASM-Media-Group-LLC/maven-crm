import { describe, expect, it } from "vitest";

// 19/11/2026: Cowork llamaba a su función con `fetch` a mano y se saltaba la
// renovación de la sesión. Con el token vencido: «Unauthorized» en el Hub, el
// latido no llegaba y Argos daba por fuera a gente que estaba adentro.

const fuentes = import.meta.glob(["../../hooks/useCoworkSession.ts", "../../integrations/supabase/client.ts"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const cowork = Object.entries(fuentes).find(([k]) => k.endsWith("useCoworkSession.ts"))?.[1] ?? "";
const cliente = Object.entries(fuentes).find(([k]) => k.endsWith("client.ts"))?.[1] ?? "";

describe("Cowork con la sesión vencida", () => {
  it("la llamada a la función pasa por la renovación de la sesión", () => {
    expect(cliente).toContain("export const fetchConSesion: typeof fetch = conSesionRenovada(");
    expect(cowork).toMatch(/async function invokeCowork[\s\S]*await fetchConSesion\(/);
    expect(cowork).not.toMatch(/async function invokeCowork[^}]*\bawait fetch\(/);
  });

  it("si ni así entra, se le dice a la persona que vuelva a entrar", () => {
    expect(cowork).toContain("if (res.status === 401) avisarSesionVencida();");
  });
});
