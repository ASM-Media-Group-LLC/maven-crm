import { describe, it, expect } from "vitest";

// MAVEN ABRE LIVIANA (simulacro v2, 19/11/2026): con mil personas abriendo a la
// vez, «cargar la app» salía bien solo el 37–77 % aunque Postgres estaba ocioso.
// El cuello eran las ~10 peticiones sueltas de cada navegador para saber quién
// es (rol, grupo, permisos, examinador, perfil tres veces, reloj). Ahora van en
// UNA (`mi_arranque`). Esta guarda evita que alguien vuelva a sembrar lecturas
// sueltas en el arranque o que un fallo de la petición única se lea como «sin
// permisos».
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";

const arranque = uno((import.meta as unknown as Glob).glob("/frontend/src/lib/arranque.ts", { query: "?raw", import: "default", eager: true }));
const rol = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useUserRole.ts", { query: "?raw", import: "default", eager: true }));
const permisos = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/usePermissions.ts", { query: "?raw", import: "default", eager: true }));
const nivel = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useRoleTier.ts", { query: "?raw", import: "default", eager: true }));
const perfil = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useUserProfile.ts", { query: "?raw", import: "default", eager: true }));
const skin = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useSkin.ts", { query: "?raw", import: "default", eager: true }));
const presencia = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useOnlinePresence.ts", { query: "?raw", import: "default", eager: true }));
const reloj = uno((import.meta as unknown as Glob).glob("/frontend/src/components/ajustes/TarjetaHoraEmpresa.tsx", { query: "?raw", import: "default", eager: true }));
const migracion = uno((import.meta as unknown as Glob).glob("/supabase/migrations/20261119200000_mi_arranque.sql", { query: "?raw", import: "default", eager: true }));

const delArranque: Record<string, string> = { rol, permisos, nivel, perfil, skin, presencia, reloj };

describe("el arranque va en una sola petición", () => {
  it("las fuentes se cargaron", () => {
    expect(arranque.length).toBeGreaterThan(500);
    expect(migracion.length).toBeGreaterThan(500);
    for (const [n, src] of Object.entries(delArranque)) expect(src.length, n).toBeGreaterThan(500);
  });

  it("lib/arranque pide mi_arranque y comparte la petición por react-query", () => {
    expect(arranque).toMatch(/\.rpc\("mi_arranque"\)/);
    expect(arranque).toMatch(/const enVuelo = new Map/);
  });

  it("cada lectura del arranque pasa por leerArranque", () => {
    for (const [n, src] of Object.entries(delArranque)) {
      expect(src, n).toMatch(/import \{[^}]*leerArranque[^}]*\} from "@\/lib\/arranque"/);
      expect(src, n).toMatch(/leerArranque\(/);
      // Sin QueryClient: las pruebas que mockean react-query no se rompen.
      expect(src, n).not.toMatch(/leerArranque\(qc/);
    }
  });

  it("nada del arranque lee profiles con select=*", () => {
    for (const [n, src] of Object.entries(delArranque)) {
      expect(src, n).not.toMatch(/from\("profiles"\)\s*\.select\(\s*("\*")?\s*\)/);
    }
  });

  it("un fallo de la petición única NO es «sin permisos»: devuelve null y se sigue por el camino viejo", () => {
    expect(arranque).toMatch(/catch \{\s*return null;\s*\}/);
    expect(arranque).toMatch(/if \(error \|\| !data \|\| typeof data !== "object"\) return null;/);
    // El camino viejo sigue ahí y sigue lanzando si falla.
    expect(permisos).toMatch(/if \(rcError\) throw rcError;/);
    expect(permisos).toMatch(/if \(a && a\.rol === role && a\.permisos\) return a\.permisos/);
    expect(rol).toMatch(/if \(rgError\) throw rgError;/);
  });

  it("solo en la primera carga: los refetch van directo a la tabla", () => {
    expect(arranque).toMatch(/export function esPrimeraCarga/);
    for (const src of [rol, permisos, nivel, perfil]) expect(src).toMatch(/esPrimeraCarga\(client, /);
  });

  it("la función corre con la RLS de quien llama y solo para autenticados", () => {
    expect(migracion).toMatch(/create or replace function public\.mi_arranque\(\)/);
    expect(migracion).toMatch(/security invoker/);
    expect(migracion).toMatch(/set search_path = public, pg_temp/);
    expect(migracion).toMatch(/\(select auth\.uid\(\)\)/);
    expect(migracion).toMatch(/grant execute on function public\.mi_arranque\(\) to authenticated;/);
    expect(migracion).toMatch(/revoke all on function public\.mi_arranque\(\) from public, anon;/);
  });
});
