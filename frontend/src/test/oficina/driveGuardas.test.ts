import { describe, it, expect } from "vitest";

// Las reglas del Drive que NO se pueden aflojar sin abrir un agujero. La base
// se probó contra prod el 28/09 (18 casos, en una transacción deshecha); esto
// cuida que nadie las saque después.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/supabase/migrations/20260928200000_oficina_drive.sql",
  "/supabase/functions/drive/index.ts",
  "/infra/nas-drive/server.mjs",
  "/frontend/src/hooks/useDrive.ts",
  "/supabase/migrations/20261002130000_drive_unidades.sql",
  "/supabase/migrations/20261002160000_drive_compartido_agencia.sql",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";
const mig = leer("oficina_drive.sql");
const edge = leer("drive/index.ts");
const nas = leer("nas-drive/server.mjs");
const hook = leer("hooks/useDrive.ts");
const unidades = leer("drive_unidades.sql");
const agencia = leer("drive_compartido_agencia.sql");

describe("⚠️ multi-agencia", () => {
  it("toda política de drive_items exige la agencia", () => {
    for (const nombre of ["drive_items_ver", "drive_items_crear_carpeta", "drive_items_editar"]) {
      const i = mig.indexOf(`CREATE POLICY ${nombre}`);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(mig.slice(i, mig.indexOf(";", i)), nombre).toMatch(/tenant_id = \(SELECT public\.current_tenant_id\(\)\)/);
    }
  });
  it("drive_mi_rol también mira la agencia, adentro", () => {
    expect(mig).toMatch(/WHEN NOT EXISTS \(SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public\.current_tenant_id\(\)\) THEN NULL/);
  });
  it("compartir solo dentro de la agencia", () => {
    expect(mig).toMatch(/Solo se puede compartir con alguien de la misma agencia/);
  });
  it("la agencia va en la RUTA física del NAS", () => {
    expect(edge).toMatch(/const storageKey = `\$\{tenant\}\/\$\{id\}`;/);
  });
});

describe("⚠️ abierto a toda la agencia (02/10)", () => {
  it("la migración se cargó (si no, todo lo de abajo pasaría en vacío)", () => {
    expect(agencia).toMatch(/CREATE TABLE public\.drive_compartido_agencia/);
  });
  it("la agencia de la fila la pone la base, desde la ficha: nadie abre algo a OTRA agencia", () => {
    expect(agencia).toMatch(/SELECT i\.tenant_id INTO NEW\.tenant_id FROM public\.drive_items i WHERE i\.id = NEW\.item_id;/);
    expect(agencia).toMatch(/BEFORE INSERT OR UPDATE ON public\.drive_compartido_agencia/);
  });
  it("drive_mi_rol nuevo sigue cortando por agencia ANTES de mirar lo abierto", () => {
    const i = agencia.indexOf("CREATE OR REPLACE FUNCTION public.drive_mi_rol");
    const cuerpo = agencia.slice(i, agencia.indexOf("$function$;", i));
    const corte = cuerpo.indexOf("WHEN NOT EXISTS (SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public.current_tenant_id()) THEN NULL");
    expect(corte).toBeGreaterThan(-1);
    expect(corte).toBeLessThan(cuerpo.indexOf("drive_compartido_agencia"));
  });
  it("abrir o cerrar a la agencia pide dueño o editor, como compartir con una persona", () => {
    for (const nombre of ["drive_compartido_agencia_dar", "drive_compartido_agencia_cambiar", "drive_compartido_agencia_quitar"]) {
      const i = agencia.indexOf(`CREATE POLICY ${nombre}`);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(agencia.slice(i, agencia.indexOf(";", i)), nombre).toMatch(/drive_mi_rol\(item_id\) IN \('dueno', 'editor'\)/);
    }
  });
  it("«Compartido conmigo» también pide lo abierto a la agencia", () => {
    expect(hook).toMatch(/supabase\.rpc\("drive_de_toda_la_agencia"/);
  });
});

describe("⚠️ lo que el navegador no puede hacer", () => {
  it("crear archivos (solo carpetas): el storage_key lo pone la edge", () => {
    const i = mig.indexOf("CREATE POLICY drive_items_crear_carpeta");
    expect(mig.slice(i, mig.indexOf(";", i))).toMatch(/tipo = 'carpeta'/);
  });
  it("tocar storage_key, tamaño, huella o estado", () => {
    expect(mig).toMatch(/NEW\.storage_key IS DISTINCT FROM OLD\.storage_key/);
    expect(mig).toMatch(/NEW\.estado IS DISTINCT FROM OLD\.estado/);
  });
  it("borrar para siempre (no hay política DELETE: lo hace la edge, NAS primero)", () => {
    expect(mig).not.toMatch(/CREATE POLICY [a-z_]+ ON public\.drive_items\s+FOR DELETE/);
    expect(edge.indexOf('{ op: "borrar", k }')).toBeLessThan(edge.indexOf('admin.from("drive_items").delete()'));
  });
});

describe("⚠️ la subida solo se confirma con el recibo firmado del NAS", () => {
  it("y el recibo tiene que ser de ESA ruta", () => {
    expect(edge).toMatch(/rec\.op !== "recibo" \|\| rec\.k !== fila\.storage_key/);
  });
  it("abrir pasa por la RLS de la persona, no por el admin", () => {
    const i = edge.indexOf('if (accion === "abrir")');
    expect(edge.slice(i, i + 400)).toMatch(/await comoLaPersona\.from\("drive_items"\)/);
  });
});

describe("⚠️ el NAS", () => {
  it("escucha solo en 127.0.0.1 (la puerta es el túnel)", () => {
    expect(nas).toMatch(/host: env\.HOST \?\? "127\.0\.0\.1"/);
  });
  it("HTML/SVG/JS nunca se sirven como página", () => {
    expect(nas).toMatch(/const PELIGROSOS = \/html\|svg\|xml\|javascript\|ecmascript\/i;/);
    expect(nas).toMatch(/Content-Security-Policy", "default-src 'none'; sandbox"/);
  });
});

describe("⚠️ carpetas grandes", () => {
  it("el contenido de una carpeta se pide paginado (PostgREST corta en 1000 sin avisar)", () => {
    expect(hook.length).toBeGreaterThan(0);
    const i = hook.indexOf('.eq("parent_id", carpeta)');
    expect(i).toBeGreaterThan(-1);
    const tramo = hook.slice(hook.lastIndexOf("fetchAllRows", i), i + 200);
    expect(tramo).toMatch(/fetchAllRows\(/);
    expect(tramo).toMatch(/\.order\("id"\)\.range\(desde, hasta\)/);
  });
});

describe("⚠️ unidades compartidas (como en Google)", () => {
  it("lo de adentro de una unidad no gasta el cupo personal", () => {
    expect(unidades.length).toBeGreaterThan(0);
    const uso = unidades.slice(unidades.indexOf("FUNCTION public.drive_uso("), unidades.indexOf("FUNCTION public.drive_usos_de_mi_agencia"));
    expect(uso).toMatch(/i\.owner_id = quien AND i\.tipo = 'archivo' AND i\.unidad_id IS NULL/);
  });
  it("unidad_id no cuenta como modificación (no pisa la fecha de Google)", () => {
    expect(unidades).toMatch(/- 'updated_at' - 'last_opened_at' - 'unidad_id'\) IS DISTINCT FROM/);
  });
  it("solo un admin crea unidades, y la edge revisa con la sesión de la persona", () => {
    const i = edge.indexOf('accion === "crear_unidad"');
    expect(i).toBeGreaterThan(-1);
    expect(edge.slice(i, i + 700)).toMatch(/comoLaPersona\.rpc\("drive_soy_admin"\)/);
  });
  it("subir dentro de una unidad revisa el espacio de la AGENCIA", () => {
    expect(edge).toMatch(/rpc\("drive_unidad_de"/);
    expect(edge).toMatch(/chequearEspacioDeLaAgencia\(/);
  });
});

