// Parseo de direcciones para "responder a todos". Cada caso decide a QUIÉN le
// llega la respuesta — un error acá manda el correo a quien no era, o se salta
// gente. Por eso se testea aparte de la pantalla.
import { describe, expect, it } from "vitest";
import {
  correoDe,
  destinatariosRespuesta,
  direccionesDe,
  nombreDe,
  tieneVariosInvolucrados,
} from "@/lib/mailAddr";

describe("direccionesDe", () => {
  it("saca una sola dirección con nombre", () => {
    expect(direccionesDe("Juan Pérez <juan@x.com>")).toEqual(["juan@x.com"]);
  });

  it("saca varias separadas por coma", () => {
    expect(
      direccionesDe("Juan <juan@x.com>, ana@y.com, Bob <bob@z.com>"),
    ).toEqual(["juan@x.com", "ana@y.com", "bob@z.com"]);
  });

  it("NO parte una coma que va dentro del nombre entre comillas", () => {
    // "Pérez, Juan" es UN nombre; la coma de adentro no separa direcciones.
    // Partir a lo bruto por "," metería `"Pérez` y `Juan" <…>` como dos.
    const r = direccionesDe('"Pérez, Juan" <juan@x.com>, ana@y.com');
    expect(r).toEqual(["juan@x.com", "ana@y.com"]);
  });

  it("normaliza a minúscula para poder deduplicar", () => {
    expect(direccionesDe("Ana <ANA@Y.COM>")).toEqual(["ana@y.com"]);
  });

  it("descarta trozos que no son una dirección", () => {
    // Un nombre suelto sin <> no es dirección; no debe colarse en el Para.
    expect(direccionesDe("Solo Un Nombre, ana@y.com")).toEqual(["ana@y.com"]);
  });

  it("un encabezado vacío no da direcciones", () => {
    expect(direccionesDe("")).toEqual([]);
    expect(direccionesDe("   ")).toEqual([]);
  });

  it("mezcla direcciones con y sin nombre", () => {
    expect(direccionesDe("pelada@x.com, Con Nombre <nombre@y.com>")).toEqual([
      "pelada@x.com",
      "nombre@y.com",
    ]);
  });
});

describe("correoDe / nombreDe", () => {
  it("correoDe saca solo la dirección", () => {
    expect(correoDe("Juan Pérez <juan@x.com>")).toBe("juan@x.com");
    expect(correoDe("pelada@x.com")).toBe("pelada@x.com");
  });

  it("nombreDe saca el nombre y cae al correo si no hay", () => {
    expect(nombreDe("Juan Pérez <juan@x.com>")).toBe("Juan Pérez");
    expect(nombreDe("pelada@x.com")).toBe("pelada@x.com");
  });
});

describe("destinatariosRespuesta", () => {
  const original = {
    from: "Ana <ana@x.com>",
    to: "Yo <yo@maven.me>, Bob <bob@y.com>",
    cc: "Carla <carla@z.com>",
    yo: "yo@maven.me",
  };

  it('"Responder" (no a todos) va solo al remitente', () => {
    const r = destinatariosRespuesta(original, false);
    expect(r.to).toBe("ana@x.com");
    expect(r.cc).toBe("");
  });

  it('"Responder a todos" incluye remitente + resto del Para, y el Cc', () => {
    const r = destinatariosRespuesta(original, true);
    // Remitente y el otro del Para; yo NO aparezco.
    expect(r.to.split(", ").sort()).toEqual(["ana@x.com", "bob@y.com"]);
    expect(r.cc).toBe("carla@z.com");
  });

  it("nunca me incluye a mí mismo, ni en Para ni en Cc", () => {
    const r = destinatariosRespuesta(
      { from: "Ana <ana@x.com>", to: "yo@maven.me, bob@y.com", cc: "yo@maven.me", yo: "YO@maven.me" },
      true,
    );
    expect(r.to).not.toContain("yo@maven.me");
    expect(r.cc).not.toContain("yo@maven.me");
  });

  it("no repite en Cc a alguien que ya está en Para", () => {
    const r = destinatariosRespuesta(
      { from: "Ana <ana@x.com>", to: "bob@y.com", cc: "bob@y.com, carla@z.com", yo: "yo@maven.me" },
      true,
    );
    expect(r.to.split(", ").sort()).toEqual(["ana@x.com", "bob@y.com"]);
    expect(r.cc).toBe("carla@z.com"); // bob no se duplica
  });

  it("si el correo era mío y quedo fuera, al menos vuelve el remitente", () => {
    // Respondo a un correo cuyo único 'otro' soy yo: no dejar el Para vacío.
    const r = destinatariosRespuesta(
      { from: "yo@maven.me", to: "yo@maven.me", cc: "", yo: "yo@maven.me" },
      true,
    );
    expect(r.to).toBe("yo@maven.me");
  });

  it("deduplica direcciones repetidas con distinta mayúscula", () => {
    const r = destinatariosRespuesta(
      { from: "Ana <ana@x.com>", to: "ANA@x.com, bob@y.com", cc: "", yo: "yo@maven.me" },
      true,
    );
    expect(r.to.split(", ").sort()).toEqual(["ana@x.com", "bob@y.com"]);
  });
});

describe("tieneVariosInvolucrados", () => {
  it("es false cuando solo está el remitente además de mí", () => {
    expect(
      tieneVariosInvolucrados({ from: "ana@x.com", to: "yo@maven.me", cc: "", yo: "yo@maven.me" }),
    ).toBe(false);
  });

  it("es true cuando hay remitente + otra persona", () => {
    expect(
      tieneVariosInvolucrados({
        from: "ana@x.com",
        to: "yo@maven.me, bob@y.com",
        cc: "",
        yo: "yo@maven.me",
      }),
    ).toBe(true);
  });

  it("me descuenta a mí: un correo solo para mí desde una persona no cuenta como varios", () => {
    expect(
      tieneVariosInvolucrados({ from: "ana@x.com", to: "yo@maven.me", cc: "yo@maven.me", yo: "yo@maven.me" }),
    ).toBe(false);
  });
});
