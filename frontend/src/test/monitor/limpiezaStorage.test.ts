import { describe, it, expect } from "vitest";
import { esRegla, limpiar, LOTE_MAX, REGLAS, type Pasos, type Regla } from "../../../../supabase/functions/limpieza-storage/logica";

// LAS LIMPIEZAS DE FOTOS Y VIDEOS VAN POR LA API DE STORAGE (13/11/2026).
//
// Tres crons (monitor_limpiar_capturas, monitor-capturas-limpieza y
// argos-clips-purga) hacían `delete from storage.objects` y Supabase lo
// rechaza (storage.protect_delete): fallaban TODOS los días y no se borraba
// nada. Ahora los despierta la edge limpieza-storage, que borra de a lotes de
// hasta 1000 con storage.remove(); la base solo dice QUÉ venció (la retención
// queda escrita en SQL) y ordena las filas después.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const migraciones = (import.meta as unknown as Glob).glob("/supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const edge = Object.values((import.meta as unknown as Glob).glob("/supabase/functions/limpieza-storage/index.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const config = Object.values((import.meta as unknown as Glob).glob("/supabase/config.toml", { query: "?raw", import: "default", eager: true }))[0] ?? "";

const NOMBRE = "20261114040000_limpiezas_por_la_api_de_storage.sql";
const migracion = Object.entries(migraciones).find(([ruta]) => ruta.endsWith(NOMBRE))?.[1] ?? "";
const sinComentarios = (sql: string) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

/** Un Storage y una base de mentira: `pendientes` son los archivos vencidos. */
function falso(pendientes: string[], opciones: { fallaBorrar?: boolean; fallaVencidos?: boolean; noBorra?: boolean } = {}) {
  const lotes: number[] = [];
  const pedidos: number[] = [];
  const filas: Regla[] = [];
  let quedan = [...pendientes];
  let reloj = 0;
  const pasos: Pasos = {
    vencidos: async (_r, limite) => {
      pedidos.push(limite);
      if (opciones.fallaVencidos) return { rutas: null, error: "statement timeout" };
      return { rutas: quedan.slice(0, limite), error: null };
    },
    borrar: async (_bucket, rutas) => {
      lotes.push(rutas.length);
      if (opciones.fallaBorrar) return { borrados: 0, error: "Storage caído" };
      if (opciones.noBorra) return { borrados: 0, error: null };
      quedan = quedan.filter((r) => !rutas.includes(r));
      return { borrados: rutas.length, error: null };
    },
    filas: async (r) => { filas.push(r); return { resumen: { listo: true }, error: null }; },
    ahora: () => (reloj += 10),
  };
  return { pasos, lotes, pedidos, filas, quedan: () => quedan };
}
const rutas = (n: number) => Array.from({ length: n }, (_, i) => `u/2026-11-01/camara/${i}.jpg`);

describe("limpieza-storage: la lógica", () => {
  it("borra de a lotes de hasta 1000 y recién después ordena las filas", async () => {
    const f = falso(rutas(2500));
    const r = await limpiar("monitor_faltas_7d", f.pasos);
    expect(f.lotes).toEqual([1000, 1000, 500]);
    expect(r).toMatchObject({ archivos: 2500, vueltas: 3, completa: true, errores: [], filas: { listo: true } });
    expect(f.filas).toEqual(["monitor_faltas_7d"]);
    expect(f.quedan()).toEqual([]);
  });

  it("nunca pide más de 1000 por lote, aunque se lo pidan", async () => {
    const f = falso(rutas(10));
    await limpiar("argos_clips_30d", f.pasos, { lote: 5000 });
    expect(Math.max(...f.pedidos)).toBe(LOTE_MAX);
    expect(LOTE_MAX).toBe(1000);
  });

  it("si Storage falla, lo dice y NO toca las filas (como la limpieza vieja, todo o nada)", async () => {
    const f = falso(rutas(5), { fallaBorrar: true });
    const r = await limpiar("monitor_capturas_30d", f.pasos);
    expect(r.errores[0]).toMatch(/Storage no borró el lote: Storage caído/);
    expect(f.filas).toEqual([]);
    expect(r.completa).toBe(false);
  });

  it("si la base no dice qué venció, es un fallo y no «no había nada»", async () => {
    const f = falso(rutas(5), { fallaVencidos: true });
    const r = await limpiar("monitor_faltas_7d", f.pasos);
    expect(r.errores[0]).toMatch(/no se pudo saber qué venció: statement timeout/);
    expect(r.completa).toBe(false);
    expect(f.lotes).toEqual([]);
    expect(f.filas).toEqual([]);
  });

  it("un lote que Storage no borra no da vueltas en falso", async () => {
    const f = falso(rutas(3000), { noBorra: true });
    const r = await limpiar("monitor_faltas_7d", f.pasos);
    expect(f.lotes).toEqual([1000]);
    expect(r.errores[0]).toMatch(/no borró ninguno de 1000/);
    expect(f.filas).toEqual([]);
  });

  it("sin nada vencido, ordena las filas igual (los latidos del rondín se podan aunque no haya fotos)", async () => {
    const f = falso([]);
    const r = await limpiar("monitor_faltas_7d", f.pasos);
    expect(r).toMatchObject({ archivos: 0, vueltas: 0, completa: true, errores: [] });
    expect(f.filas).toEqual(["monitor_faltas_7d"]);
  });

  it("respeta el tope de vueltas: lo que sobra sale mañana", async () => {
    const f = falso(rutas(5000));
    const r = await limpiar("monitor_capturas_30d", f.pasos, { maxVueltas: 2 });
    expect(f.lotes).toEqual([1000, 1000]);
    expect(r.completa).toBe(false);
    expect(r.errores).toEqual([]);
  });

  it("solo acepta las tres reglas, cada una con su bucket", () => {
    expect(Object.keys(REGLAS).sort()).toEqual(["argos_clips_30d", "monitor_capturas_30d", "monitor_faltas_7d"]);
    expect(REGLAS.monitor_faltas_7d.bucket).toBe("monitor-capturas");
    expect(REGLAS.monitor_capturas_30d.bucket).toBe("monitor-capturas");
    expect(REGLAS.argos_clips_30d.bucket).toBe("argos-clips");
    for (const x of ["todo", "", "__proto__", "toString", null, 7]) expect(esRegla(x)).toBe(false);
  });
});

describe("limpieza-storage: la base y los crons", () => {
  it("la migración se cargó", () => {
    expect(migracion.length).toBeGreaterThan(1000);
  });

  it("ninguna migración nueva vuelve a borrar directo en storage.objects", () => {
    const nuevas = Object.entries(migraciones).filter(([ruta]) => (ruta.split("/").pop() ?? "") >= NOMBRE);
    expect(nuevas.length).toBeGreaterThan(0);
    for (const [ruta, sql] of nuevas) {
      expect(sinComentarios(sql), ruta).not.toMatch(/delete\s+from\s+storage\.objects/i);
    }
  });

  it("la retención queda escrita en SQL y es la misma de antes (7 y 30 días; latidos a los 2)", () => {
    const sql = sinComentarios(migracion);
    const tramo = (desde: string, hasta: string) => sql.slice(sql.indexOf(desde), sql.indexOf(hasta, sql.indexOf(desde) + 1));
    const vencidos = tramo("function public.limpieza_storage_vencidos", "function public.limpieza_storage_filas");
    expect(tramo("'monitor_faltas_7d'", "'monitor_capturas_30d'")).toMatch(/bucket_id = 'monitor-capturas'[\s\S]*interval '7 days'/);
    expect(vencidos).toMatch(/'monitor_capturas_30d' then[\s\S]*bucket_id = 'monitor-capturas'[\s\S]*interval '30 days'/);
    expect(vencidos).toMatch(/'argos_clips_30d' then[\s\S]*bucket_id = 'argos-clips'[\s\S]*interval '30 days'/);
    expect(vencidos).toMatch(/least\(greatest\(coalesce\(_limite, 1000\), 1\), 1000\)/);
    expect(sql).toMatch(/delete from public\.monitor_rondas where last_at < now\(\) - interval '2 days'/);
  });

  it("no le quita al NAS lo que todavía necesita", () => {
    const sql = sinComentarios(migracion);
    // A los 7 días no entra un pantallazo de Argos que aún no se mudó al NAS.
    expect(sql).toMatch(/not exists \(select 1 from public\.monitor_capturas c where c\.path = o\.name and not c\.en_nas\)/);
    // A los 30 días no se borra la fila de algo que vive en el NAS (la borra argos-al-nas, con su copia).
    expect(sql).toMatch(/delete from public\.monitor_capturas c[\s\S]*?c\.nas_path is null/);
    expect(sql).toMatch(/delete from public\.argos_clips k[\s\S]*?k\.nas_path is null/);
  });

  it("las dos funciones son solo para service_role", () => {
    expect(migracion).toMatch(/revoke all on function public\.limpieza_storage_vencidos\(text, integer\) from public, anon, authenticated/);
    expect(migracion).toMatch(/revoke all on function public\.limpieza_storage_filas\(text\) from public, anon, authenticated/);
    expect(migracion).toMatch(/grant execute on function public\.limpieza_storage_vencidos\(text, integer\) to service_role/);
  });

  it("los tres crons conservan nombre y horario, y llaman a la edge con X-Cron-Token de Vault", () => {
    const esperados: Array<[string, string, string]> = [
      ["monitor-capturas-limpieza", "0 4 \\* \\* \\*", "monitor_capturas_30d"],
      ["monitor_limpiar_capturas", "17 4 \\* \\* \\*", "monitor_faltas_7d"],
      ["argos-clips-purga", "0 9 \\* \\* \\*", "argos_clips_30d"],
    ];
    for (const [job, horario, regla] of esperados) {
      expect(migracion).toMatch(new RegExp(
        `cron\\.schedule\\('${job}', '${horario}', \\$cron\\$[\\s\\S]*?functions/v1/limpieza-storage[\\s\\S]*?` +
        `name = 'cron_internal_token'[\\s\\S]*?"regla":"${regla}"[\\s\\S]*?\\$cron\\$\\)`));
    }
    // Ninguna llave escrita a mano.
    expect(migracion).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("la edge exige el token del cron y borra por la API de Storage", () => {
    expect(edge).toMatch(/tokenDeCronValido\(req\.headers\.get\("X-Cron-Token"\), esperado\)/);
    expect(edge).toMatch(/admin\.storage\.from\(bucket\)\.remove\(rutas\)/);
    expect(edge).toMatch(/admin\.rpc\("limpieza_storage_vencidos"/);
    expect(edge).toMatch(/admin\.rpc\("limpieza_storage_filas"/);
  });

  it("config.toml declara la función (sin su bloque, la guarda frena TODOS los deploy de edge)", () => {
    expect(config).toMatch(/\[functions\.limpieza-storage\]\s*\nverify_jwt = false/);
  });
});
