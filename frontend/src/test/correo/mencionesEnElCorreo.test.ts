import { describe, it, expect } from "vitest";
import { detectarTokenDeMencion } from "@/pages/messenger/components/MentionAutocomplete";
import {
  candidatosDelDirectorio,
  type PersonaDelDirectorio,
} from "@/hooks/useDirectorioCorreo";

// EL RIESGO DE ESTA FUNCIÓN, PUESTO POR ESCRITO.
//
// Mencionar con @ dentro de un COMPOSITOR DE CORREO tiene un peligro que el
// Messenger no tiene: la gente escribe direcciones de correo todo el tiempo, y
// una dirección lleva una arroba en el medio. Si el buscador de personas se
// abriera al teclear "jhon@maven-ai.me", aparecería a mitad de cada dirección
// que alguien escriba — y peor, un Enter para seguir escribiendo insertaría a
// una persona al azar en el texto y la sumaría al correo.
//
// Por eso el detector se REUSA del Messenger en vez de escribir otro: allá ya
// está resuelto que la arroba tiene que ir al principio o después de un espacio.
// Este test existe para que ese detalle no se pierda si alguien "simplifica" la
// expresión regular.

const persona = (
  user_id: string, nombre: string, email_address: string,
): PersonaDelDirectorio => ({ user_id, nombre, email_address, avatar_seed: null, avatar_url: null });

const DIRECTORIO = [
  persona("1", "Fabiana Durán", "fabiana.duran@unlok.me"),
  persona("2", "Daniel Ospina", "daniel.ospina@unlok.me"),
  persona("3", "Ana Mejía", "ana.mejia@maven-ai.me"),
  persona("4", "Mariana Soto", "mariana.soto@maven-ai.me"),
  persona("5", "Alexandra Giraldo", "alexandra.giraldo@maven-ai.me"),
];

describe("el @ del compositor no se confunde con una dirección de correo", () => {
  it("NO abre el buscador en medio de una dirección", () => {
    for (const texto of [
      "escribime a jhon@mav",
      "mandalo a soporte@maven-ai.me",
      "fabiana.duran@unlok",
      "ver cuenta@dominio",
    ]) {
      expect(detectarTokenDeMencion(texto, texto.length), texto).toBeNull();
    }
  });

  it("SÍ abre cuando la arroba arranca palabra", () => {
    for (const texto of ["@dur", "hola @dur", "sumo a @ale", "(@ana"]) {
      expect(detectarTokenDeMencion(texto, texto.length), texto).not.toBeNull();
    }
  });

  it("la arroba sola ofrece a todos", () => {
    const t = detectarTokenDeMencion("sumo a @", 8);
    expect(t?.query).toBe("");
  });
});

describe("a quién ofrece el buscador", () => {
  const nombres = (q: string, excluir?: string) =>
    candidatosDelDirectorio(DIRECTORIO, q, excluir).map((p) => p.nombre);

  it("encuentra por apellido, no solo por nombre", () => {
    expect(nombres("dur")).toContain("Fabiana Durán");
    expect(nombres("ospina")).toContain("Daniel Ospina");
  });

  it("encuentra sin tildes: quien escribe 'duran' busca a 'Durán'", () => {
    expect(nombres("duran")).toContain("Fabiana Durán");
    expect(nombres("mejia")).toContain("Ana Mejía");
  });

  it("prioriza a quien EMPIEZA con lo escrito", () => {
    // "ana" está dentro de "Mariana", pero Ana va primero.
    expect(nombres("ana")[0]).toBe("Ana Mejía");
  });

  it("también busca por la dirección", () => {
    expect(nombres("alexandra.gir")).toContain("Alexandra Giraldo");
  });

  it("no se ofrece a uno mismo", () => {
    expect(nombres("dur", "1")).not.toContain("Fabiana Durán");
  });
});
