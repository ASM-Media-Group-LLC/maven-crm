import { describe, it, expect } from "vitest";

// «QUE SEA EXACTAMENTE COMO GOOGLE» (Jhon, 02/10): editar el MISMO archivo del
// Drive desde la Oficina (con historial) y buscar en TODO el Drive. Lo que no
// se puede aflojar sin perder lo escrito, pisar un archivo o mostrar lo que no
// se debe: se lee el SQL y la edge y se comprueba.
//
// ⚠️ Cada bloque mira primero que su fuente se haya cargado: si un archivo se
// renombra, la guarda tiene que FALLAR, no pasar en verde sin mirar nada.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/supabase/migrations/20261002200000_drive_versiones.sql",
  "/supabase/migrations/20261002200100_drive_buscar.sql",
  "/supabase/migrations/20261002200200_drive_buscar_indice.sql",
  "/supabase/functions/oficina-doc/index.ts",
  "/supabase/functions/drive/index.ts",
  "/infra/nas-drive/server.mjs",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";
const versiones = leer("drive_versiones.sql");
const buscar = leer("drive_buscar.sql");
const indice = leer("drive_buscar_indice.sql");
const oficinaDoc = leer("oficina-doc/index.ts");
const driveEdge = leer("drive/index.ts");
const nas = leer("nas-drive/server.mjs");

/** El trozo entre dos marcas. ⚠️ Falla si alguna no está. */
function entre(texto: string, desde: string, hasta: string): string {
  const a = texto.indexOf(desde);
  const b = texto.indexOf(hasta, a + 1);
  expect(a, `no está «${desde}»`).toBeGreaterThan(-1);
  expect(b, `no está «${hasta}»`).toBeGreaterThan(a);
  return texto.slice(a, b);
}

describe("las fuentes se cargaron (si no, todo lo de abajo pasaría en vacío)", () => {
  it("migraciones, edges y NAS", () => {
    for (const [nombre, f] of Object.entries({ versiones, buscar, indice, oficinaDoc, driveEdge, nas })) {
      expect(f.length, nombre).toBeGreaterThan(100);
    }
  });
});

describe("⚠️ buscar en todo el Drive (drive_buscar)", () => {
  const funcion = () => entre(buscar, "CREATE FUNCTION public.drive_buscar(", "$function$;");

  it("salta la RLS (SECURITY DEFINER) y por eso exige la agencia y la sesión ADENTRO", () => {
    const f = funcion();
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toMatch(/SET search_path = public/);
    expect(f).toMatch(/agencia uuid := public\.current_tenant_id\(\)/);
    expect(f).toMatch(/IF agencia IS NULL OR auth\.uid\(\) IS NULL/);
    expect(f).toMatch(/WHERE i\.tenant_id = agencia\s+AND i\.trashed_at IS NULL/);
  });

  it("primero a lo sumo 400 candidatos por nombre; RECIÉN DESPUÉS la visibilidad (drive_mi_rol)", () => {
    const f = funcion();
    const tope = f.indexOf("LIMIT 400");
    const visible = f.indexOf("CONTINUE WHEN public.drive_mi_rol(r.id) IS NULL;");
    expect(tope).toBeGreaterThan(-1);
    expect(visible).toBeGreaterThan(tope);
    // Y lo que está dentro de una carpeta en la papelera tampoco sale.
    expect(f.indexOf("CONTINUE WHEN en_papelera;")).toBeGreaterThan(visible);
  });

  it("no se le abre a anon, y no reemplaza nada que ya exista", () => {
    expect(buscar).toMatch(/REVOKE ALL ON FUNCTION public\.drive_buscar\(text, text\[\], integer\) FROM PUBLIC, anon;/);
    expect(buscar).toMatch(/GRANT EXECUTE ON FUNCTION public\.drive_buscar\(text, text\[\], integer\) TO authenticated;/);
    expect(buscar).not.toMatch(/CREATE OR REPLACE/);
  });

  it("la envoltura es IMMUTABLE con el diccionario fijo, y el índice y la búsqueda usan LA MISMA", () => {
    const envoltura = entre(buscar, "CREATE FUNCTION public.drive_nombre_buscable(", "$function$;");
    expect(envoltura).toMatch(/IMMUTABLE/);
    expect(envoltura).toMatch(/extensions\.unaccent\('extensions\.unaccent'::regdictionary, p\)/);
    expect(funcion()).toMatch(/public\.drive_nombre_buscable\(i\.nombre\) LIKE mas_largo/);
    expect(indice).toMatch(/USING gin \(public\.drive_nombre_buscable\(nombre\) public\.gin_trgm_ops\)/);
    expect(indice).toMatch(/WHERE trashed_at IS NULL;/);
  });

  it("el índice se arma CONCURRENTLY (430.000 fichas: sin eso bloquea subidas y renombres)", () => {
    expect(indice).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS drive_items_nombre_trgm_idx/);
  });
});

describe("⚠️ el historial (drive_versiones)", () => {
  it("se ve si se puede ver el archivo; escribe SOLO la edge", () => {
    expect(versiones).toMatch(/ALTER TABLE public\.drive_versiones ENABLE ROW LEVEL SECURITY;/);
    expect(versiones).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.drive_mi_rol\(item_id\) IS NOT NULL\);/);
    expect(versiones).toMatch(/REVOKE ALL ON public\.drive_versiones FROM anon, authenticated;/);
    expect(versiones).toMatch(/GRANT SELECT ON public\.drive_versiones TO authenticated;/);
    expect(versiones).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
    expect(versiones).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
  it("borrar para siempre borra también los archivos de las versiones, ANTES de la ficha", () => {
    const rama = entre(driveEdge, 'if (accion === "borrar_para_siempre")', 'if (accion === "crear_unidad")');
    const versionesAntes = rama.indexOf("await versionesGuardadas(admin, fichas)");
    expect(versionesAntes).toBeGreaterThan(-1);
    expect(versionesAntes).toBeLessThan(rama.indexOf('admin.from("drive_items").delete()'));
  });
});

describe("⚠️ guardar lo editado (oficina-doc ?guardar_drive)", () => {
  const rama = () => entre(oficinaDoc, 'url.searchParams.get("guardar_drive")', "// ── De acá para abajo, todo lleva sesión de Maven");

  it("solo con la firma de ONLYOFFICE y el permiso de ESE archivo", () => {
    const r = rama();
    expect(r).toMatch(/await verificar\(jwt, secretoOO\)/);
    expect(r).toMatch(/permiso\.op !== "oo-guardar"/);
  });

  it("⚠️ NUNCA pisa: el archivo editado va a una clave NUEVA en el NAS", () => {
    const r = rama();
    expect(r).toMatch(/const llave = `\$\{fila\.tenant_id\}\/\$\{crypto\.randomUUID\(\)\}`;/);
    expect(r).toMatch(/await guardarEnElNas\(llave, bytes\)/);
    expect(r).not.toMatch(/guardarEnElNas\(fila\.storage_key/);
    // Y el NAS, por su lado, no deja subir sobre lo importado de Google.
    // Lo importado solo se LEE (get, y la miniatura desde #2006) o se borra: nunca put/parte/completar.
    expect(nas).toMatch(/if \(importada && d\.op !== "get" && d\.op !== "mini" && d\.op !== "borrar"\)/);
  });

  it("el historial se anota ANTES de mover el puntero, y el puntero solo se mueve si nadie lo movió", () => {
    const r = rama();
    const historial = r.indexOf('admin.from("drive_versiones").insert(');
    const puntero = r.indexOf('admin.from("drive_items")\n          .update({ storage_key: llave');
    expect(historial).toBeGreaterThan(-1);
    expect(puntero).toBeGreaterThan(historial);
    expect(r).toMatch(/\.eq\("id", fila\.id\)\.eq\("storage_key", fila\.storage_key\)/);
  });
});

describe("⚠️ abrir para editar (oficina-doc editar_drive)", () => {
  const rama = () => entre(oficinaDoc, 'if (accion === "editar_drive")', 'if (accion === "ver_drive" || accion === "desde_drive")');

  it("la ficha y el rol se piden COMO LA PERSONA: edita solo dueño o editor", () => {
    const r = rama();
    expect(r).toMatch(/await fichaDelDrive\(comoLaPersona,/);
    expect(r).toMatch(/await comoLaPersona\.rpc\("drive_mi_rol", \{ p_item: fila\.id \}\)/);
    expect(r).toMatch(/if \(rol !== "dueno" && rol !== "editor"\) motivo = "permiso";/);
  });
  it("el permiso para guardar es de ESE archivo", () => {
    expect(rama()).toMatch(/op: "oo-guardar", k: fila\.id, u: user\.id/);
  });
  it("abrir, ver y copiar anotan la apertura (Recientes); la copia, después de guardarla", () => {
    expect(rama()).toMatch(/await anotarApertura\(admin, fila, user\);/);
    const copia = entre(oficinaDoc, "// ── desde_drive: la copia editable", "return responder({ id: docId");
    const subida = copia.indexOf("await subir(llave");
    expect(subida).toBeGreaterThan(-1);
    expect(copia.indexOf("await anotarApertura(admin, fila, user);")).toBeGreaterThan(subida);
  });
});
