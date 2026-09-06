// Quién sale cuando tecleás "@" en un grupo.
//
// Reportado el 06/09/2026: "un usuario normal no puede mencionar a un admin".
// No había ninguna regla por rol — la lista se cortaba en los primeros 6
// participantes SIN ordenar, así que en "Coordinadores PLUS" (28 personas) el
// admin sencillamente no aparecía. Estos casos existen para que la lista no
// vuelva a esconder a nadie.

import { describe, it, expect } from "vitest";
import {
  candidatosParaMencion,
  detectarTokenDeMencion,
  LETRAS_MINIMAS_A_CIEGAS,
} from "@/pages/messenger/components/MentionAutocomplete";
import { puedeVerLaListaDeMiembros } from "@/pages/messenger/utils";

const persona = (id: string, full_name: string) => ({ user_id: id, profile: { id, full_name } as never });

const grupoGrande = Array.from({ length: 28 }, (_, i) => persona(`u${i}`, `Persona ${i}`))
  .concat(persona("admin", "Grace Gelves M."));

describe("candidatosParaMencion", () => {
  it("no esconde a nadie en un grupo grande", () => {
    const todos = candidatosParaMencion(grupoGrande, "yo", "");
    expect(todos).toHaveLength(29);
    expect(todos.some(p => p.user_id === "admin")).toBe(true);
  });

  it("encuentra al admin por el apellido aunque esté al final de la lista", () => {
    const r = candidatosParaMencion(grupoGrande, "yo", "gelves");
    expect(r.map(p => p.user_id)).toEqual(["admin"]);
  });

  it("no filtra por rol: el mismo grupo trata igual a todos", () => {
    const r = candidatosParaMencion(grupoGrande, "yo", "").map(p => p.user_id);
    expect(r).toContain("admin");
    expect(r).toContain("u0");
  });

  it("deja afuera al que escribe y al que no tiene nombre", () => {
    const gente = [persona("yo", "Yo Mismo"), persona("otro", "Otro"), { user_id: "sinPerfil" }];
    expect(candidatosParaMencion(gente, "yo", "").map(p => p.user_id)).toEqual(["otro"]);
  });

  it("pone primero al que EMPIEZA por lo tecleado", () => {
    const gente = [persona("a", "Alejandra Ruiz"), persona("j", "Jackeline Mejía")];
    expect(candidatosParaMencion(gente, "yo", "ja").map(p => p.user_id)).toEqual(["j", "a"]);
  });

  it("después del nombre entero va el apellido, y al final lo de adentro", () => {
    const gente = [
      persona("dentro", "Ana Bermejo"),
      persona("apellido", "Luis Mejía"),
      persona("nombre", "Mejicano Perez"),
    ];
    expect(candidatosParaMencion(gente, "yo", "mej").map(p => p.user_id)).toEqual([
      "nombre",
      "apellido",
      "dentro",
    ]);
  });
});

describe("detectarTokenDeMencion", () => {
  it("agarra el @ al principio y después de un espacio", () => {
    expect(detectarTokenDeMencion("@Gra", 4)).toMatchObject({ query: "gra", startIndex: 0 });
    expect(detectarTokenDeMencion("hola @Gra", 9)).toMatchObject({ query: "gra", startIndex: 5 });
  });

  it("no se corta con las tildes ni con la ñ", () => {
    expect(detectarTokenDeMencion("hola @Durán", 11)?.query).toBe("durán");
    expect(detectarTokenDeMencion("hola @Muñoz", 11)?.query).toBe("muñoz");
  });

  it("un correo NO abre el buscador de personas", () => {
    expect(detectarTokenDeMencion("jhon@maven", 10)).toBeNull();
  });

  it("sin arroba antes del cursor, nada", () => {
    expect(detectarTokenDeMencion("hola que tal", 12)).toBeNull();
    expect(detectarTokenDeMencion("hola @Gra ", 10)).toBeNull();
  });
});

// Grupo con "Ver miembros: solo admins". Se puede mencionar, pero no pasear la
// lista: hasta que no hay 2 letras, el buscador no contesta nada.
describe("buscador a ciegas (lista de miembros oculta)", () => {
  const gente = [persona("a", "Grace Gelves M."), persona("b", "Katherin Ferrer")];

  it("con el @ solo, no enseña a nadie", () => {
    expect(candidatosParaMencion(gente, "yo", "", true)).toEqual([]);
  });

  it("con una sola letra, tampoco", () => {
    expect(candidatosParaMencion(gente, "yo", "g", true)).toEqual([]);
    expect(LETRAS_MINIMAS_A_CIEGAS).toBe(2);
  });

  it("con dos letras ya busca, y sigue ordenando igual", () => {
    expect(candidatosParaMencion(gente, "yo", "gr", true).map(p => p.user_id)).toEqual(["a"]);
    expect(candidatosParaMencion(gente, "yo", "fe", true).map(p => p.user_id)).toEqual(["b"]);
  });

  it("sin el candado, el @ solo sigue mostrando a todos", () => {
    expect(candidatosParaMencion(gente, "yo", "", false)).toHaveLength(2);
  });
});

describe("puedeVerLaListaDeMiembros", () => {
  const grupo = (visibilidad: "all" | "admins" | undefined, rolMio: string) => ({
    type: "group" as const,
    members_visibility: visibilidad,
    participants: [{ user_id: "yo", role: rolMio }, { user_id: "otro", role: "member" }],
  });

  it("un DM nunca tiene candado", () => {
    expect(puedeVerLaListaDeMiembros({ type: "direct", participants: [] }, "yo")).toBe(true);
  });

  it("sin el candado, cualquiera ve la lista", () => {
    expect(puedeVerLaListaDeMiembros(grupo("all", "member"), "yo")).toBe(true);
    expect(puedeVerLaListaDeMiembros(grupo(undefined, "member"), "yo")).toBe(true);
  });

  it("con el candado, solo el admin del grupo", () => {
    expect(puedeVerLaListaDeMiembros(grupo("admins", "member"), "yo")).toBe(false);
    expect(puedeVerLaListaDeMiembros(grupo("admins", "admin"), "yo")).toBe(true);
  });

  it("sin sesión, no ve la lista", () => {
    expect(puedeVerLaListaDeMiembros(grupo("admins", "admin"), undefined)).toBe(false);
  });
});
