import { describe, expect, it } from "vitest";

// LA LLAMADA NO SE ESCONDE (Alvaro, 18/11/2026: «se escondió la llamada y no
// encontraba dónde colgar»). En la app, la ventana de una llamada que pierde el
// foco se achica a una ventanita arriba a la derecha, siempre encima; al tocarla
// vuelve a su tamaño. «Volver a la llamada» (la barra de Maven) la trae al frente
// por maven:mostrar-esta-ventana, que solo una ventana de llamada puede pedir.
// Probado con una copia de la app el 18/11: 360×250 encima al pasar a Maven, y
// de vuelta a 800×600 con «Volver».
const leer = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const ventana = leer(import.meta.glob("../../../../desktop/src/ventanaDeLlamada.js", { query: "?raw", import: "default", eager: true }));
const main = leer(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }));
const preload = leer(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }));

describe("la ventana de la llamada", () => {
  it("se leyeron las fuentes", () => {
    for (const f of [ventana, main, preload]) expect(f?.length).toBeGreaterThan(500);
  });

  it("cada ventana de llamada de Maven se prepara al abrirse", () => {
    expect(main).toMatch(/webContents\.on\("did-create-window", \(hija, \{ url \}\) => \{\s*if \(esDeMaven\(url\) && esLlamada\(url\)\) prepararVentanaDeLlamada\(hija\);/);
  });

  it("al perder el foco se achica y queda encima; al volver, su tamaño", () => {
    expect(ventana).toMatch(/hija\.on\("blur"/);
    expect(ventana).toMatch(/hija\.setAlwaysOnTop\(true, "floating"\)/);
    expect(ventana).toMatch(/hija\.on\("focus", \(\) => \{ clearTimeout\(espera\); agrandar\(\); \}\)/);
    expect(ventana).toMatch(/hija\.setAlwaysOnTop\(false\)/);
    // En pantalla completa no se toca.
    expect(ventana).toMatch(/hija\.isFullScreen\(\)/);
  });

  it("es una llamada /call/ o un Meet /meet/", () => {
    expect(ventana).toMatch(/pathname\.startsWith\("\/call\/"\) \|\| pathname\.startsWith\("\/meet\/"\)/);
  });

  it("«Volver a la llamada» solo lo pide una ventana de llamada de Maven, para sí misma", () => {
    expect(main).toMatch(/ipcMain\.handle\("maven:mostrar-esta-ventana", \(e\) => \{\s*const url = e\.sender\.getURL\(\);\s*if \(!esDeMaven\(url\) \|\| !esLlamada\(url\)\) return false;\s*return mostrarVentana\(BrowserWindow\.fromWebContents\(e\.sender\)\);/);
    expect(preload).toMatch(/mostrarEstaVentana: \(\) => ipcRenderer\.invoke\("maven:mostrar-esta-ventana"\)/);
  });
});
