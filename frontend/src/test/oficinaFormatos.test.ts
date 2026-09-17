import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// LOS TRES FORMATOS DE LA OFICINA TIENEN QUE ESTAR DE ACUERDO EN TRES LADOS.
//
// El 17/09/2026 se habilitaron hojas de cálculo y presentaciones mirando las
// CONSTANTES de la edge (`EXTENSIONES`, el mapeo de editores, los MIME), que
// ya las aceptaban. Pero más abajo sobrevivía un `if (extension !== "docx")`
// de cuando existía una sola plantilla, y en producción crear una hoja daba
// «Por ahora solo documentos de texto (.docx)».
//
// La lección: que las constantes acepten un formato NO significa que el código
// lo deje pasar. Esto lee el fuente y lo comprueba.
const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const edge = leer("supabase/functions/oficina-doc/index.ts");
const plantillas = leer("supabase/functions/oficina-doc/plantillas.ts");

const lista = (texto: string, patron: RegExp): string[] => {
  const m = texto.match(patron);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort() : [];
};

describe("los formatos de la Oficina", () => {
  const extensiones = lista(edge, /const EXTENSIONES = new Set\(\[([^\]]*)\]/);

  it("la edge acepta los tres", () => {
    expect(extensiones).toEqual(["docx", "pptx", "xlsx"]);
  });

  it("cada formato aceptado tiene su archivo en blanco", () => {
    // Sin plantilla, crear ese formato revienta al subir a R2.
    const conPlantilla = [
      ...plantillas.matchAll(/^\s{2}(\w+): (\w+_EN_BLANCO),$/gm),
    ].map((m) => m[1]).sort();
    expect(conPlantilla).toEqual(extensiones);
  });

  it("cada formato tiene su editor de ONLYOFFICE", () => {
    const m = edge.match(/const TIPO_DE_EDITOR[^=]*= \{([^}]*)\}/);
    expect(m).not.toBeNull();
    const declarados = [...m![1].matchAll(/(\w+):/g)].map((x) => x[1]).sort();
    expect(declarados).toEqual(extensiones);
  });

  it("⚠️ no queda ningún bloqueo que contradiga a EXTENSIONES", () => {
    // El bug exacto del 17/09: un `if` suelto que rechazaba todo lo que no
    // fuera .docx, invisible desde las constantes.
    expect(edge).not.toMatch(/extension\s*!==\s*"docx"/);
    expect(edge).not.toContain("solo documentos de texto");
  });

  it("las plantillas no están vacías", () => {
    // Un base64 truncado da un ZIP corrupto que ONLYOFFICE rechaza sin decir
    // por qué. No valida el contenido, pero sí que haya algo con qué trabajar.
    for (const nombre of ["DOCX_EN_BLANCO", "XLSX_EN_BLANCO", "PPTX_EN_BLANCO"]) {
      const m = plantillas.match(new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`));
      expect(m, nombre).not.toBeNull();
      const b64 = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join("");
      expect(b64.length, nombre).toBeGreaterThan(1000);
      // Todo archivo de Office es un ZIP, y todo ZIP empieza con "PK".
      expect(atob(b64.slice(0, 8)).slice(0, 2), nombre).toBe("PK");
    }
  });
});
