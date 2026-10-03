import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Faltaba la mitad que importa: se podían PONER etiquetas pero no navegar por
// ellas. Keila pidió etiquetas, y una etiqueta que no se puede abrir es un
// punto de color.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const pagina = leer("frontend/src/pages/correo/CorreoPage.tsx");
const hook = leer("frontend/src/hooks/useEtiquetasCorreo.ts");
const columna = leer("frontend/src/components/correo/etiquetas/EtiquetasColumna.tsx");

describe("⚠️ una etiqueta NO es una carpeta: cruza todas", () => {
  it("la consulta no filtra por carpeta", () => {
    // Un correo etiquetado «Pagos» y después archivado sigue estando en
    // «Pagos». Si filtrara por carpeta, desaparecería de su etiqueta al
    // archivarlo — justo lo que uno NO espera de una etiqueta.
    const i = hook.indexOf("export function useCorreosDeEtiqueta");
    expect(i, "no está la consulta").toBeGreaterThan(-1);
    const fn = hook.slice(i);
    expect(fn).toMatch(/\.in\("message_id", ids\)/);
    expect(fn).not.toMatch(/\.eq\("folder"/);
  });

  it("no repite el mismo correo que está en dos buzones", () => {
    expect(hook).toMatch(/const vistos = new Set<string>\(\)/);
  });
});

describe("⚠️ los UID son POR CARPETA", () => {
  it("cada correo de la vista por etiqueta trae SU carpeta", () => {
    expect(pagina).toMatch(/folder: m\.folder as string/);
  });

  it("abrir uno lo busca en SU carpeta, no en la seleccionada", () => {
    expect(pagina).toMatch(/const carpetaDelAbierto = sel\?\.folder \?\? carpeta;/);
    expect(pagina).toMatch(/useMailMessage\(carpetaDelAbierto, sel\)/);
  });

  it("⚠️ las acciones masivas se agrupan POR CARPETA", () => {
    // El uid 5 de Recibidos y el uid 5 de Archivados son correos DISTINTOS.
    // Mandarlos todos como si fueran de una sola no falla: MUEVE OTROS
    // mensajes. Es la clase de error que no se nota hasta que falta un correo.
    // El agrupado vive en lib/correo/accionesDelMensaje.ts (lo usan también el
    // ⋮ de cada mensaje y el arrastrar): ahí está probado con correos de varias
    // carpetas (test/correo/accionesDelMensaje.test.ts).
    // Una llamada por grupo (con `mutateAsync`: la respuesta de cada uno hace
    // falta para «Deshacer»).
    expect(pagina).toMatch(/\[\.\.\.agruparPorCarpeta\(elegidos, carpeta\)\]/);
    expect(pagina).toMatch(/porCarpeta\.map\(\(\[f, delGrupo\]\) =>/);
    expect(pagina).toMatch(/\{ folder: f, op, items: delGrupo/);
  });

  it("y los adjuntos se bajan de la carpeta del correo abierto", () => {
    expect(pagina).toMatch(/folder: carpetaDelAbierto, uid, index: i/);
    expect(pagina).not.toMatch(/folder: carpeta, uid, index: i/);
  });
});

describe("la sección en la columna", () => {
  it("vive en EtiquetasColumna, debajo de las carpetas", () => {
    const i = pagina.indexOf("── Etiquetas ─");
    expect(i, "no está la sección").toBeGreaterThan(-1);
    expect(pagina.slice(i, i + 1200)).toMatch(/<EtiquetasColumna/);
  });

  it("tiene su encabezado y el + para crear (sin el «Más» al pie)", () => {
    expect(columna).toMatch(/t\("mail\.labels"\)/);
    expect(columna).toMatch(/setDialogo\(\{ tipo: "nueva", madre: null \}\)/);
    expect(columna).not.toMatch(/mail\.labels\.more/);
  });

  it("volver a tocar la etiqueta activa la apaga", () => {
    // Si no, quedarse dentro de una etiqueta sin forma de salir.
    expect(columna).toMatch(/onAbrir\(etiquetaVista === n\.etiqueta\.id \? null : n\.etiqueta\.id\)/);
  });
});
