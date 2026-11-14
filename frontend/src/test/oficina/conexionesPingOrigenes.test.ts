import { describe, it, expect } from "vitest";

// «SERVICIOS EXTERNOS» DECÍA «NO SE PUDO CARGAR ESTA PARTE» (13/11/2026).
//
// conexiones-ping tenía su propia lista corta de orígenes. Desde un origen que
// el resto de Maven sí acepta (el preview local :4173, www, los dominios
// históricos) el preflight devolvía OTRO origen permitido, el navegador no
// mandaba el POST y la tarjeta caía en el error sin que la función se enterara:
// los logs solo tenían OPTIONS 204. Ahora usa la lista de toda la app.
//
// Se lee con import.meta.glob (ruta y opciones literales): el tsconfig de la app
// no trae los tipos de Node.

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const edge = Object.values((import.meta as unknown as Glob).glob("/supabase/functions/conexiones-ping/index.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const cors = Object.values((import.meta as unknown as Glob).glob("/supabase/functions/_shared/cors.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";

describe("conexiones-ping: orígenes", () => {
  it("las fuentes se cargaron", () => {
    expect(edge.length).toBeGreaterThan(1000);
    expect(cors.length).toBeGreaterThan(500);
  });

  it("usa la lista de orígenes de toda la app, no una propia", () => {
    expect(edge).toMatch(/import \{ pickAllowedOrigin \} from "\.\.\/_shared\/cors\.ts";/);
    expect(edge).toMatch(/"Access-Control-Allow-Origin": pickAllowedOrigin\(req\)/);
    expect(edge).not.toMatch(/const ORIGENES\s*=/);
  });

  it("esa lista trae la app y el preview local desde donde se vio el error", () => {
    for (const o of ["https://app.maven-ai.me", "https://www.maven-ai.me", "http://localhost:8080", "http://localhost:4173"]) {
      expect(cors).toContain(`"${o}"`);
    }
  });

  it("un Zoho colgado no deja esperando a toda la tarjeta", () => {
    expect(edge).toMatch(/conTope\(\s*licenciasDeZoho\(\)/);
  });
});
