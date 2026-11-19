import { describe, it, expect } from "vitest";

// GUARDA DEL TREN DE AGENCIAS (vagón 1, 19/11/2026): lo del edificio
// (maven-agencias, ezeigddgkaemxpshghmu) nunca puede apuntar a Kash
// (lsagslbkliprespbyhts), que no se toca bajo ninguna situación.

const KASH = "lsagslbkliprespbyhts";
const EDIFICIO = "ezeigddgkaemxpshghmu";

const leer = (m: Record<string, unknown>) => Object.values(m)[0] as string;

const flujos: Record<string, string> = {
  alDia: leer(import.meta.glob("../../../../.github/workflows/edificio-al-dia.yml", { query: "?raw", import: "default", eager: true })),
  funciones: leer(import.meta.glob("../../../../.github/workflows/edificio-funciones.yml", { query: "?raw", import: "default", eager: true })),
  secretos: leer(import.meta.glob("../../../../.github/workflows/edificio-secretos.yml", { query: "?raw", import: "default", eager: true })),
  auth: leer(import.meta.glob("../../../../.github/workflows/edificio-auth.yml", { query: "?raw", import: "default", eager: true })),
};
const guarda = leer(import.meta.glob("../../../../infra/casas/guarda-kash.sh", { query: "?raw", import: "default", eager: true }));
const alDia = leer(import.meta.glob("../../../../infra/casas/al-dia.sh", { query: "?raw", import: "default", eager: true }));
const relojes = leer(import.meta.glob("../../../../infra/casas/edificio-migraciones/20261119230000_edificio_crons.sql", { query: "?raw", import: "default", eager: true }));
const listaFunciones = leer(import.meta.glob("../../../../infra/casas/funciones-edificio.txt", { query: "?raw", import: "default", eager: true }));
const migracionesDeKash = import.meta.glob("../../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const soloEdificio = leer(import.meta.glob("../../../../infra/casas/funciones-solo-edificio.txt", { query: "?raw", import: "default", eager: true }));
const deployDeKash = leer(import.meta.glob("../../../../.github/workflows/deploy-edge-functions.yml", { query: "?raw", import: "default", eager: true }));
const configToml = leer(import.meta.glob("../../../../supabase/config.toml", { query: "?raw", import: "default", eager: true }));
const migracionCobros = leer(import.meta.glob("../../../../infra/edificio/migraciones/20261120090000_cobros.sql", { query: "?raw", import: "default", eager: true }));
const lista = (txt: string) => txt.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);

describe("el edificio nunca toca Kash", () => {
  it.each(Object.entries(flujos))("el workflow %s apunta solo al edificio y pasa por el candado", (_n, yml) => {
    expect(yml).toBeTruthy();
    expect(yml).toContain(`EDIFICIO_REF: ${EDIFICIO}`);
    expect(yml).toContain("solo_edificio \"$EDIFICIO_REF\"");
    // Kash solo puede aparecer en comentarios o en una revisión que la rechaza.
    const usos = yml
      .split("\n")
      .filter((l) => l.includes(KASH))
      .filter((l) => !l.trim().startsWith("#") && !/grep|ALTO/.test(l));
    expect(usos).toEqual([]);
    // Ningún paso usa otra base que no sea la del edificio.
    expect(yml).not.toMatch(/--project-ref\s+"?\$\{?PROJECT_REF/);
  });

  it("el candado común rechaza Kash y exige el edificio", () => {
    expect(guarda).toContain(`KASH_REF="${KASH}"`);
    expect(guarda).toContain(`EDIFICIO_REF="${EDIFICIO}"`);
    expect(guarda).toMatch(/no_es_kash\(\)/);
    expect(guarda).toMatch(/solo_edificio\(\)/);
  });

  it("al-dia.sh se niega con Kash y revisa que no quede nada de Kash", () => {
    expect(alDia).toContain("no_es_kash \"$REF\"");
    expect(alDia).toMatch(/ALTO: quedó algo apuntando a Kash/);
  });

  it("los relojes del edificio no traen la dirección de Kash ni llaves escritas", () => {
    expect(relojes).not.toContain(KASH);
    expect(relojes).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    expect(relojes).toContain("vault.decrypted_secrets");
  });

  it("los relojes del edificio no viven en supabase/migrations (no se aplican a Kash)", () => {
    for (const [ruta, sql] of Object.entries(migracionesDeKash)) {
      expect(ruta).not.toMatch(/edificio_crons/);
      expect(sql as string).not.toContain("public.edificio_llamar(");
    }
  });

  // Vagón 7 (cobros, puerta): esas funciones viven SOLO en el edificio. Si el deploy de
  // Kash dejara de saltarlas, al fundir se publicarían en Kash.
  it("las funciones solo del edificio no se publican en Kash", () => {
    const solo = lista(soloEdificio);
    expect(solo).toEqual(expect.arrayContaining(["cobros-stripe", "directorio", "refrescar-externas"]));
    const delEdificio = lista(listaFunciones);
    for (const f of solo) {
      expect(delEdificio).toContain(f);
      expect(configToml).toMatch(new RegExp(`^\\[functions\\.${f}\\]\\nverify_jwt = false`, "m"));
    }
    expect(deployDeKash).toContain("infra/casas/funciones-solo-edificio.txt");
    expect(deployDeKash).toMatch(/skip \$fn \(solo del edificio: no va a Kash\)/);
    // kash-resumen es la de Kash (solo lectura): no va al edificio.
    expect(delEdificio).not.toContain("kash-resumen");
    expect(solo).not.toContain("kash-resumen");
    expect(configToml).toMatch(/^\[functions\.kash-resumen\]\nverify_jwt = false/m);
  });

  it("la migración de cobros es del edificio y trae su candado", () => {
    expect(migracionCobros).toContain("30869615-f579-4981-8a1f-dbebc61eae2d");
    expect(migracionCobros).not.toContain(KASH);
    for (const [ruta, sql] of Object.entries(migracionesDeKash)) {
      expect(ruta).not.toMatch(/20261120090000_cobros\.sql$/);
      expect(sql as string).not.toMatch(/create table public\.(stripe_eventos|precios_plataforma|puerta_intentos)/);
    }
  });

  it("la lista de funciones del edificio no trae integraciones de Kash", () => {
    const funciones = listaFunciones
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim())
      .filter(Boolean);
    expect(funciones.length).toBeGreaterThan(20);
    for (const f of funciones) {
      expect(f).not.toMatch(/^(blu-|chatter-|closers?-|promolog-|scouter-|whatsapp-|wa-|tg-|telegram-|zoho-|mail-|creator|creadora|portal-|parrilla-|qa-|fb-scan|x-scan|buzones-|role-email)/);
    }
  });
});
