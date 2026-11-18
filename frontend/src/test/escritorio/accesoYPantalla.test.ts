import { describe, expect, it } from "vitest";

// Guarda (18/11/2026), dos pedidos de Alvaro sobre la app de computador:
//  1. «que el app recuerde tu login y password»: la app guarda el correo y la
//     contraseña en el equipo, cifrados con el llavero del sistema, y la
//     pantalla de entrada los trae puestos. Solo se leen en /login.
//  2. «no se puede grabar pantalla» en Mac: con el permiso negado el primer
//     clic fallaba mudo; ahora la explicación sale en el mismo clic.
const leer = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const acceso = leer(import.meta.glob("../../../../desktop/src/acceso.js", { query: "?raw", import: "default", eager: true }));
const main = leer(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }));
const preload = leer(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }));
const login = leer(import.meta.glob("../../pages/Login.tsx", { query: "?raw", import: "default", eager: true }));

describe("la app recuerda el acceso", () => {
  it("se leyeron las fuentes", () => {
    for (const f of [acceso, main, preload, login]) expect(f?.length).toBeGreaterThan(500);
  });

  it("la contraseña se guarda cifrada con el llavero, en un archivo solo del usuario", () => {
    expect(acceso).toContain("safeStorage.encryptString(clave)");
    expect(acceso).toContain("safeStorage.decryptString(");
    expect(acceso).toContain("mode: 0o600");
    // Nunca la contraseña tal cual en el archivo.
    expect(acceso).not.toMatch(/clave:\s*clave\b/);
    expect(acceso).not.toMatch(/JSON\.stringify\(\{[^}]*\bclave\b[^:]/);
    // Sin cifrado de verdad (Linux sin llavero) no se guarda la contraseña.
    expect(acceso).toContain('"basic_text"');
  });

  it("solo la ventana de Maven la lee, y solo en la pantalla de entrada", () => {
    expect(main).toMatch(/pathname\.startsWith\("\/login"\)/);
    expect(main).toMatch(/"maven:acceso-leer", \(e\) => \(enLaEntradaDeMaven\(e\) \? leerAcceso\(\) : null\)/);
    expect(main).toMatch(/"maven:acceso-guardar"[\s\S]{0,120}deLaVentana\(e\)[\s\S]{0,40}esDeMaven/);
    expect(main).toContain("Olvidar mi contraseña en este equipo");
    expect(preload).toContain('ipcRenderer.invoke("maven:acceso-leer")');
    expect(preload).toContain('ipcRenderer.invoke("maven:acceso-guardar"');
  });

  it("la entrada de Maven la trae puesta y la guarda al entrar bien", () => {
    expect(login).toContain("escritorio()?.acceso");
    expect(login).toMatch(/accesoDeLaApp\.leer\(\)/);
    const exito = login.slice(login.indexOf("if (error)"), login.indexOf("navigate(destino);", login.indexOf("if (error)")));
    expect(exito).toMatch(/accesoDeLaApp\?\.guardar\(email\.trim\(\), password\)/);
  });
});

describe("compartir pantalla en Mac sin permiso", () => {
  it("la explicación sale en el mismo clic, no recién en el segundo", () => {
    const manejador = main.slice(main.indexOf("setDisplayMediaRequestHandler"));
    const bloque = manejador.slice(manejador.indexOf("if (!pantallaPermitida())"), manejador.indexOf("return responder({});"));
    expect(bloque).toContain("guiaPermisoPantalla(ventana)");
    expect(bloque).not.toMatch(/else\s*\{\s*guiaPermisoPantalla/);
  });
});
