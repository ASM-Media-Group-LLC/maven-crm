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

// El reintento del chat abierto: cinco esperas crecientes (~67 s en total) y
// después se rinde — el evento `online` del navegador cubre lo que sea más largo.
import { esperaDeReintento, ESPERAS_DE_REINTENTO_MS } from "@/hooks/queHacerConLaCarga";

describe("esperaDeReintento", () => {
  it("crece y suma alrededor de un minuto, que es lo que dura un corte típico", () => {
    expect([0, 1, 2, 3, 4].map(esperaDeReintento)).toEqual([2_000, 5_000, 10_000, 20_000, 30_000]);
    expect(ESPERAS_DE_REINTENTO_MS.reduce((a, b) => a + b, 0)).toBe(67_000);
  });

  it("después del último intento se rinde", () => {
    expect(esperaDeReintento(5)).toBeNull();
    expect(esperaDeReintento(99)).toBeNull();
  });
});
