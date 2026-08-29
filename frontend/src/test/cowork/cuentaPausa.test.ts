import { describe, it, expect } from "vitest";
import { cuentaPausa, clasesPausa, nombreYApellido } from "@/lib/pausaCowork";

// La cuenta regresiva de las pausas. Lo que se fija acá es lo que el
// coordinador y el empleado tienen que ver IGUAL: si cada lado calculara por su
// cuenta, tarde o temprano dirían cosas distintas sobre el mismo minuto — y ahí
// se acaba la conversación sobre si alguien se pasó.
describe("cuenta regresiva de la pausa", () => {
  it("cuenta hacia atrás, no hacia adelante", () => {
    // Baño de 10 min, lleva 3 → le quedan 7.
    expect(cuentaPausa(180, 10).texto).toBe("7:00");
  });

  it("verde mientras sobra tiempo", () => {
    expect(cuentaPausa(60, 10).estado).toBe("ok");
    expect(clasesPausa("ok")).toContain("emerald");
  });

  it("amarillo cuando queda poco", () => {
    // Baño de 10 min: el aviso entra en los últimos 2:30 (un cuarto).
    expect(cuentaPausa(9 * 60, 10).estado).toBe("poco");
    expect(clasesPausa("poco")).toContain("amber");
  });

  it("rojo, parpadeando y en NEGATIVO cuando se pasó", () => {
    const c = cuentaPausa(11 * 60 + 5, 10);
    expect(c.excedida).toBe(true);
    expect(c.estado).toBe("excedida");
    expect(c.texto).toBe("−1:05");        // el signo importa: es tiempo de más
    expect(clasesPausa("excedida")).toContain("animate-pulse");
  });

  it("el amarillo tiene techo: un break de 30 min no pasa un tercio en amarillo", () => {
    // Sin techo serían 7:30; con techo son 5:00.
    expect(cuentaPausa(24 * 60, 30).estado).toBe("ok");     // faltan 6 min
    expect(cuentaPausa(26 * 60, 30).estado).toBe("poco");   // faltan 4 min
  });

  it("sin límite configurado no se inventa uno: muestra lo transcurrido, en neutro", () => {
    const c = cuentaPausa(125, null);
    expect(c.texto).toBe("2:05");
    expect(c.excedida).toBe(false);
    expect(c.estado).toBe("ok");
  });
});

// El nombre en los avisos de supervisión. En el equipo hay dos Álvaro Mejía y
// hubo dos Manuela Zapata: un aviso que dice solo el nombre de pila no
// identifica a nadie, que es justo lo que el aviso tiene que hacer.
describe("nombre y apellido en los avisos", () => {
  it("da nombre y apellido", () => {
    expect(nombreYApellido("Alexandra Giraldo")).toBe("Alexandra Giraldo");
  });

  it("con nombres largos toma el apellido, no la particula", () => {
    // Las DOS PRIMERAS palabras darian "Maria De", que no es un apellido.
    expect(nombreYApellido("Maria De Los Angeles Suarez")).toBe("Maria Suarez");
    expect(nombreYApellido("Jhon J Lopez")).toBe("Jhon Lopez");
  });

  it("aguanta lo que venga de la base", () => {
    expect(nombreYApellido("Madonna")).toBe("Madonna");
    expect(nombreYApellido("  Ana   Perez  ")).toBe("Ana Perez");
    expect(nombreYApellido(null)).toBe("Alguien");
    expect(nombreYApellido("")).toBe("Alguien");
  });
});
