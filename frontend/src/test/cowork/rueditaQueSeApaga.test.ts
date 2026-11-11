// La ruedita de Cowork que no se apagaba nunca (Isabel Tuiran, 11/11/2026).
//
// Al unirse a la sala, el refetch normal prendía la ruedita y el realtime de su
// propia asignación lanzaba, 1,2 s después, una relectura silenciosa. La normal
// quedaba "vieja" y no apagaba la ruedita; la silenciosa no la toca. Quedaba
// girando para siempre con los datos ya cargados.
import { describe, it, expect } from "vitest";

type Glob = { glob: (p: string, o?: Record<string, unknown>) => Record<string, unknown> };
const uno = (r: Record<string, unknown>) => String(Object.values(r)[0] ?? "");
const HOOK = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useCoworkSession.ts", { query: "?raw", import: "default", eager: true }));
const PAGINA = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }));
const LATIDO = uno((import.meta as unknown as Glob).glob("/frontend/src/lib/coworkLatido.ts", { query: "?raw", import: "default", eager: true }));
const VISTA = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/cowork/CoworkParticipantView.tsx", { query: "?raw", import: "default", eager: true }));

describe("la ruedita de Cowork se apaga", () => {
  it("se cargaron las fuentes", () => {
    for (const f of [HOOK, PAGINA, LATIDO, VISTA]) expect(f.length).toBeGreaterThan(1000);
  });

  it("la corrida que termina última apaga la ruedita, sea silenciosa o no", () => {
    expect(HOOK).toContain("if (vigente()) setLoading(false);");
    expect(HOOK).not.toContain("if (!silent && vigente()) setLoading(false);");
  });

  it("el vigilante cuenta mientras la ruedita está en pantalla", () => {
    expect(PAGINA).toContain("return <RuedaVigilada alAtascarse={alAtascarse} />;");
    expect(PAGINA).toMatch(/function RuedaVigilada[\s\S]*setTimeout[\s\S]*ATASCO_MS/);
  });

  it("si el servidor dice «sin sala», la pantalla relee", () => {
    expect(LATIDO).toContain("avisarSinSala()");
    expect(VISTA).toContain("alQuedarSinSala(");
  });
});
