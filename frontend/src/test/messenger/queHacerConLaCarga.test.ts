// POR QUÉ A GRACE SE LE QUEDÓ MESSENGER EN BLANCO (10/09).
//
// Un fallo de red devolvía data: null, y null se leía como "cero chats": la
// lista se borraba entera. Estos casos fijan la diferencia entre "no hay nada"
// (vaciar) y "no pude averiguarlo" (abortar y dejar lo que había).

import { describe, it, expect } from "vitest";
import { queHacerConLaCarga } from "@/hooks/queHacerConLaCarga";

describe("queHacerConLaCarga", () => {
  it("un error es abortar, aunque venga data vacía al lado", () => {
    expect(queHacerConLaCarga({ error: { message: "red caída" }, data: [] })).toBe("abortar");
  });

  it("data null SIN error también es abortar — este es el bug de Grace", () => {
    // PostgREST nunca devuelve null cuando la consulta funciona.
    expect(queHacerConLaCarga({ error: null, data: null })).toBe("abortar");
    expect(queHacerConLaCarga({ error: null, data: undefined })).toBe("abortar");
  });

  it("cero filas de verdad es vaciar", () => {
    expect(queHacerConLaCarga({ error: null, data: [] })).toBe("vaciar");
  });

  it("con filas, seguir", () => {
    expect(queHacerConLaCarga({ error: null, data: [{ id: 1 }] })).toBe("seguir");
  });
});
