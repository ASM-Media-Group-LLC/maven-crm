import { describe, it, expect } from "vitest";

// LA PESTAÑA CONTENIDO DE LA FICHA, COMO EL DRIVE (Jhon, 06/10: «opción para
// descargar sin tener que abrir el contenido, como en Drive… y selección
// múltiple… un poco más parecido a lo que tenemos en Drive»). Con las piezas
// del Drive, no con copias.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/creadores/ContenidoTabContent.tsx"], { query: "?raw", import: "default", eager: true });
const contenido = Object.values(fuentes)[0] ?? "";

describe("pestaña Contenido", () => {
  it("cargó", () => expect(contenido.length).toBeGreaterThan(1000));

  it("usa la cuadrícula/galería, el selector de vista y la barra de selección del Drive", () => {
    expect(contenido).toMatch(/<CuadriculaDrive /);
    expect(contenido).toMatch(/<SelectorDeVista [\s\S]{0,200}?modos=\{\["cuadricula", "galeria"\]\}/);
    expect(contenido).toMatch(/<BarraDeSeleccion [\s\S]{0,120}?acciones=\{\{ descargar:/);
    expect(contenido).toMatch(/clicDeSeleccion\(/);
    expect(contenido).toMatch(/alternarTodas\(/);
  });

  it("descarga sin abrir: el ⋮ de cada uno y lo elegido (uno tal cual, varios en .zip)", () => {
    expect(contenido).toMatch(/abrirArchivo\(de\[0\]\.id, true\)/);
    expect(contenido).toMatch(/bajarZip\(/);
    expect(contenido).toMatch(/<DropdownMenuItem onSelect=\{\(\) => void bajar\(\[i\]\)\}>/);
    expect(contenido).toMatch(/<PanelDeDescargas /);
  });

  it("solo ver y bajar: no se arrastra, no se mueve ni se borra", () => {
    expect(contenido).toMatch(/arrastrable: \(\) => false/);
    expect(contenido).not.toMatch(/papelera|borrarParaSiempre|mover/i);
  });
});
