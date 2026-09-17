import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// COMPARTIR UN DOCUMENTO: DONDE "VER" Y "EDITAR" NO PUEDEN CONFUNDIRSE.
//
// Si la política de UPDATE usara `me_compartieron_documento` en vez de
// `puedo_editar_compartido`, cualquiera con permiso de SOLO VER podría
// escribir el documento — y nadie lo notaría hasta que alguien pisara algo.
const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const sql = leer("supabase/migrations/20260917100000_oficina_compartir.sql");
const edge = leer("supabase/functions/oficina-doc/index.ts");

describe("RLS de documentos compartidos", () => {
  it("⚠️ las tres funciones que cruzan tablas son SECURITY DEFINER", () => {
    // Sin esto, la política de documentos y la de compartidos se llaman entre
    // sí y Postgres corta con "infinite recursion detected in policy".
    for (const fn of [
      "soy_dueno_del_documento",
      "me_compartieron_documento",
      "puedo_editar_compartido",
    ]) {
      const i = sql.indexOf(`FUNCTION public.${fn}`);
      expect(i, fn).toBeGreaterThan(-1);
      const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
      expect(cuerpo, fn).toContain("SECURITY DEFINER");
      expect(cuerpo, fn).toContain("SET search_path");
    }
  });

  it("ver un documento compartido: alcanza con que me lo hayan compartido", () => {
    const i = sql.indexOf("FOR SELECT TO authenticated");
    const politica = sql.slice(i, i + 400);
    expect(politica).toContain("me_compartieron_documento(id)");
  });

  it("⚠️ EDITAR exige el permiso de editar, no solo que me lo hayan compartido", () => {
    const i = sql.indexOf("FOR UPDATE TO authenticated");
    expect(i).toBeGreaterThan(-1);
    const politica = sql.slice(i, i + 500);
    expect(politica).toContain("puedo_editar_compartido(id)");
    // La trampa: si acá apareciera `me_compartieron_documento`, quien solo
    // puede VER podría escribir.
    expect(politica).not.toContain("me_compartieron_documento");
  });

  it("compartir, cambiar el permiso y dejar de compartir es solo del dueño", () => {
    for (const nombre of [
      '"Compartir mi documento"',
      '"Cambiar el permiso de mi documento"',
      '"Dejar de compartir mi documento"',
    ]) {
      const i = sql.indexOf(nombre);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(sql.slice(i, i + 250), nombre).toContain("soy_dueno_del_documento(document_id)");
    }
  });

  it("un trigger congela las llaves de la fila compartida", () => {
    const i = sql.indexOf("FUNCTION public.tocar_compartido");
    const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
    expect(cuerpo).toContain("NEW.document_id = OLD.document_id");
    expect(cuerpo).toContain("NEW.user_id = OLD.user_id");
  });
});

describe("el permiso compartido llega hasta ONLYOFFICE", () => {
  it("⚠️ la edge consulta document_shares para decidir si se puede editar", () => {
    // Sin esto, alguien con permiso de editar abriría en SOLO LECTURA, y no
    // habría forma de darse cuenta desde la UI: el editor simplemente no deja
    // escribir y parece un problema de ONLYOFFICE.
    // `let` y no `const`: el permiso se resuelve en dos pasos.
    const i = edge.search(/(let|const) puedeEditar/);
    expect(i).toBeGreaterThan(-1);
    const bloque = edge.slice(i, i + 900);
    expect(bloque).toContain("document_shares");
    expect(bloque).toContain("puede_editar");
  });
});
