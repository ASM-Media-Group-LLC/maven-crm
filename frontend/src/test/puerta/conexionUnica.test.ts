import { describe, it, expect } from "vitest";
import { destinoPorEnlaceDeAcceso, elegirConexion, inicioTrasEntrar } from "@/lib/puerta";
import { SUPABASE_URL, SUPABASE_URL_KASH, DESTINO_SUPABASE, urlDeFuncion } from "@/lib/conexionSupabase";

// PUERTA PRENDIDA SIN ROMPER KASH (19/11/2026).
//
//  1. UNA sola fuente de la base: nadie fuera de lib/conexionSupabase.ts lee
//     VITE_SUPABASE_* (antes ~18 archivos lo hacían: una sesión del edificio habría
//     llamado a las funciones de Kash con un token del edificio).
//  2. Con la puerta apagada (lo de hoy): Kash, igual que siempre — también ante un
//     enlace de invitación del edificio.
//  3. Lo que vive SOLO en Kash (instaladores, telemetría del dominio viejo) sigue en Kash.
//  4. Al entrar: Kash al tablero, el edificio a la casa de la plataforma.

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

const KASH = { url: "https://lsagslbkliprespbyhts.supabase.co", llave: "sb_publishable_kash" };
const EDIFICIO_URL = "https://ezeigddgkaemxpshghmu.supabase.co";
const PRENDIDA = { VITE_PUERTA_EDIFICIO: "1", VITE_EDIFICIO_URL: EDIFICIO_URL, VITE_EDIFICIO_ANON_KEY: "sb_publishable_edificio" };

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (iss: string) => `${b64({ alg: "HS256" })}.${b64({ iss, sub: "u" })}.firma`;
const hash = (iss: string, type = "invite") => `#access_token=${jwt(iss)}&refresh_token=r&type=${type}`;

describe("1. una sola fuente de la base", () => {
  it("se leyeron las fuentes", () => {
    expect(Object.keys(fuentes).length).toBeGreaterThan(500);
  });
  it("nadie fuera de lib/conexionSupabase.ts lee import.meta.env.VITE_SUPABASE_*", () => {
    const culpables = Object.entries(fuentes)
      .filter(([ruta]) => !ruta.startsWith("/frontend/src/test/") && ruta !== "/frontend/src/lib/conexionSupabase.ts")
      .filter(([, src]) => /import\.meta\.env\.VITE_SUPABASE_/.test(src))
      .map(([ruta]) => ruta);
    expect(culpables).toEqual([]);
  });
  it("client.ts usa la misma conexión (no arma la suya)", () => {
    const cliente = fuentes["/frontend/src/integrations/supabase/client.ts"];
    expect(cliente).toMatch(/from '@\/lib\/conexionSupabase'/);
    expect(cliente).not.toMatch(/elegirConexion\(/);
  });
  it("en las pruebas (sin puerta) la base es Kash y las funciones van a Kash", () => {
    expect(DESTINO_SUPABASE).toBe("kash");
    expect(SUPABASE_URL).toBe(SUPABASE_URL_KASH);
    expect(urlDeFuncion("meet-room")).toBe(`${SUPABASE_URL_KASH}/functions/v1/meet-room`);
  });
});

describe("2. puerta apagada → Kash, igual que siempre", () => {
  it("un enlace del edificio no cambia nada con la puerta apagada", () => {
    expect(destinoPorEnlaceDeAcceso(hash(`${EDIFICIO_URL}/auth/v1`), {})).toBeNull();
    expect(destinoPorEnlaceDeAcceso(hash(`${EDIFICIO_URL}/auth/v1`), { VITE_PUERTA_EDIFICIO: "0", VITE_EDIFICIO_URL: EDIFICIO_URL, VITE_EDIFICIO_ANON_KEY: "x" })).toBeNull();
    expect(elegirConexion({}, null, KASH)).toEqual({ destino: "kash", ...KASH });
  });
  it("prendida: solo un token emitido por el edificio manda al edificio", () => {
    expect(destinoPorEnlaceDeAcceso(hash(`${EDIFICIO_URL}/auth/v1`), PRENDIDA)).toBe("edificio");
    expect(destinoPorEnlaceDeAcceso(hash(`${EDIFICIO_URL}/auth/v1`, "recovery"), PRENDIDA)).toBe("edificio");
    expect(destinoPorEnlaceDeAcceso(hash(`${KASH.url}/auth/v1`), PRENDIDA)).toBeNull();
    expect(destinoPorEnlaceDeAcceso(hash("https://otro.test/auth/v1"), PRENDIDA)).toBeNull();
    expect(destinoPorEnlaceDeAcceso("#access_token=basura", PRENDIDA)).toBeNull();
    expect(destinoPorEnlaceDeAcceso("", PRENDIDA)).toBeNull();
  });
  it("conexionSupabase recuerda el edificio ANTES de crear el cliente (solo con puerta)", () => {
    const src = fuentes["/frontend/src/lib/conexionSupabase.ts"];
    expect(src.indexOf("destinoPorEnlaceDeAcceso(")).toBeGreaterThan(0);
    expect(src.indexOf("destinoPorEnlaceDeAcceso(")).toBeLessThan(src.indexOf("elegirConexion(envDeLaApp()"));
  });
});

describe("3. lo que vive solo en Kash sigue en Kash", () => {
  it("instaladores y telemetría del dominio viejo usan SUPABASE_URL_KASH", () => {
    expect(fuentes["/frontend/src/lib/guiaApp.ts"]).toMatch(/base: string \| undefined = SUPABASE_URL_KASH/);
    expect(fuentes["/frontend/src/pages/portada/Portada.tsx"]).toMatch(/const DESCARGAS = `\$\{SUPABASE_URL_KASH\}/);
    expect(fuentes["/frontend/src/lib/dominioCanonico.ts"]).toMatch(/\$\{SUPABASE_URL_KASH\}\/functions\/v1\/dominio-legacy-hit/);
  });
});

describe("4. a dónde va el login", () => {
  it("Kash al tablero de siempre; el edificio a la plataforma", () => {
    expect(inicioTrasEntrar("kash")).toBe("/dashboard");
    expect(inicioTrasEntrar("edificio")).toBe("/plataforma");
    expect(fuentes["/frontend/src/pages/Login.tsx"]).toMatch(/: inicioTrasEntrar\(destinoDeEstaPestana\(\)\);/);
  });
});
