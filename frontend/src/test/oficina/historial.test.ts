import { describe, it, expect } from "vitest";
import {
  archivoDeLaVersion, armarHistorial,
  type DocumentoParaHistorial, type FilaDeVersion,
} from "../../../../supabase/functions/oficina-doc/historial";

const ANA = "ana-1111";
const BRUNO = "bruno-2222";
const JHON = "jhon-3333";

/** El documento real de prod: "Prueba OnlyOffice", v3, creado 05:51. */
const doc: DocumentoParaHistorial = {
  id: "b21a2b84",
  owner_id: JHON,
  extension: "docx",
  version: 3,
  storage_key: "documentos/b21a2b84/v3.docx",
  created_at: "2026-09-17T05:51:37.131Z",
};

/** Ojo con estas filas: la de `version: 1` lleva el ARCHIVO de la v1 pero la
 *  FECHA y el AUTOR de la v2. Es lo que escribe el guardado. */
const filas: FilaDeVersion[] = [
  { version: 1, storage_key: "documentos/b21a2b84/v1.docx", saved_by: ANA, created_at: "2026-09-17T05:57:43.470Z" },
  { version: 2, storage_key: "documentos/b21a2b84/v2.docx", saved_by: BRUNO, created_at: "2026-09-17T07:08:48.828Z" },
];

describe("armarHistorial", () => {
  it("devuelve una entrada por versión, incluida la vigente", () => {
    expect(armarHistorial(doc, filas).map((e) => e.version)).toEqual([1, 2, 3]);
  });

  it("la v1 es de quien creó el documento, no de quien guardó después", () => {
    const [v1] = armarHistorial(doc, filas);
    expect(v1.autorId).toBe(JHON);
    expect(v1.created).toBe("2026-09-17T05:51:37.131Z");
  });

  it("⚠️ NO corre el autor un lugar: quien firma la fila N hizo la versión N+1", () => {
    const [, v2, v3] = armarHistorial(doc, filas);
    // Ana firmó la fila de la v1 ⇒ Ana hizo la v2. Si esto dijera ANA en v1 y
    // BRUNO en v2, el historial le atribuiría a cada uno el trabajo del otro.
    expect(v2.autorId).toBe(ANA);
    expect(v3.autorId).toBe(BRUNO);
  });

  it("la fecha de cada versión es cuándo NACIÓ, no cuándo fue reemplazada", () => {
    const [, v2, v3] = armarHistorial(doc, filas);
    expect(v2.created).toBe("2026-09-17T05:57:43.470Z"); // el guardado que la creó
    expect(v3.created).toBe("2026-09-17T07:08:48.828Z");
  });

  it("no usa `updated_at` del documento, que se mueve sin subir la versión", () => {
    // En prod este documento tiene updated_at 07:50 (un cambio de visibilidad)
    // y sigue en v3. Ninguna entrada puede tener esa hora.
    const horas = armarHistorial(doc, filas).map((e) => e.created);
    expect(horas).not.toContain("2026-09-17T07:50:33.593Z");
  });

  it("la key coincide con la que usa el editor en vivo", () => {
    expect(armarHistorial(doc, filas).map((e) => e.key))
      .toEqual(["b21a2b84-v1", "b21a2b84-v2", "b21a2b84-v3"]);
  });

  it("un documento recién creado tiene una sola versión, del dueño", () => {
    const nuevo = { ...doc, version: 1, storage_key: "documentos/x/v1.docx" };
    expect(armarHistorial(nuevo, [])).toEqual([{
      version: 1, key: "b21a2b84-v1", created: nuevo.created_at, autorId: JHON,
    }]);
  });

  it("si falta la fila intermedia no inventa un autor", () => {
    // Puede pasar con un documento cuyo primer guardado ocurrió antes de que
    // se escribiera `storage_key`: esa fila nunca se insertó.
    const [, v2] = armarHistorial(doc, [filas[1]]);
    expect(v2.autorId).toBeNull();
  });

  it("queda ordenado de la más vieja a la más nueva", () => {
    const fechas = armarHistorial(doc, filas).map((e) => Date.parse(e.created));
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
  });
});

describe("archivoDeLaVersion", () => {
  it("la vigente sale del documento, que no tiene fila propia", () => {
    expect(archivoDeLaVersion(doc, filas, 3)).toBe("documentos/b21a2b84/v3.docx");
  });

  it("las viejas salen de su fila", () => {
    expect(archivoDeLaVersion(doc, filas, 1)).toBe("documentos/b21a2b84/v1.docx");
    expect(archivoDeLaVersion(doc, filas, 2)).toBe("documentos/b21a2b84/v2.docx");
  });

  it("una versión que no existe no devuelve el archivo de otra", () => {
    expect(archivoDeLaVersion(doc, filas, 9)).toBeNull();
    expect(archivoDeLaVersion(doc, filas, 0)).toBeNull();
  });
});
