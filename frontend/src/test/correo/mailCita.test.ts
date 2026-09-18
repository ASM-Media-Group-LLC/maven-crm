import { describe, it, expect } from "vitest";
import { partirCitado, partirCitadoTexto } from "@/lib/mailCita";

// Los dos cuerpos son los de VERDAD, copiados de la base el 18/09/2026 del
// hilo «Test» que Jhon usó para comparar Maven con Gmail. Importa que sean
// reales: las dos formas son distintas, y la segunda —la que manda Maven— es
// la que rompió la primera versión de esta función.

/** Lo que manda GMAIL: la cita es un hermano, al mismo nivel. */
const DE_GMAIL =
  '<div dir="ltr">Test</div><br />' +
  '<div class="gmail_quote gmail_quote_container">' +
  '<div dir="ltr" class="gmail_attr">El vie, 18 sept 2026 a la(s) 4:53 p.m., Jhon Lopez escribió:<br /></div>' +
  '<blockquote class="gmail_quote" style="margin:0px"><p>Bien gracias y tu</p></blockquote>' +
  "</div>";

/** ⚠️ Lo que manda MAVEN: la cita va ANIDADA dentro de un div envolvente que
 *  también contiene lo que uno escribió. */
const DE_MAVEN =
  '<div style="font-family:Arial;font-size:14px">' +
  '<p style="margin:0 0 10px">Bien gracias y tu </p>' +
  '<p style="margin:0 0 10px">&nbsp;</p>' +
  '<blockquote style="border-left:3px solid #d4d4d8">' +
  "<p>El 18 de septiembre de 2026, 16:02, Jhon Lopez escribió:</p><p>bien</p>" +
  "</blockquote></div>\n";

describe("partirCitado · lo que manda Gmail", () => {
  it("deja arriba lo escrito y pliega la cita", () => {
    const r = partirCitado(DE_GMAIL);
    expect(r.propio).toContain("Test");
    expect(r.propio).not.toContain("gmail_quote");
    expect(r.citado).toContain("Bien gracias y tu");
  });
});

describe("⚠️ partirCitado · lo que manda Maven (cita ANIDADA)", () => {
  // La primera versión subía hasta el hijo directo de la raíz antes de cortar.
  // Con esta forma, ese hijo es el div envolvente —que contiene TAMBIÉN lo que
  // uno escribió—, así que se llevaba todo, el resultado quedaba vacío y la
  // función devolvía el correo entero sin plegar. Andaba en el caso de Gmail y
  // no hacía nada en el caso propio, que es el 90% de lo que uno relee.
  it("pliega la cita SIN llevarse lo que uno escribió", () => {
    const r = partirCitado(DE_MAVEN);
    expect(r.propio).toContain("Bien gracias y tu");
    expect(r.propio).not.toContain("El 18 de septiembre");
    expect(r.citado).toContain("El 18 de septiembre");
    expect(r.citado).not.toContain("Bien gracias y tu");
  });

  it("no rompe el HTML: el envolvente sigue cerrado", () => {
    // Cortar la cadena de texto por un índice dejaría etiquetas sin cerrar.
    // Acá se parsea de verdad, así que el div envolvente sobrevive entero.
    const r = partirCitado(DE_MAVEN);
    const abre = (r.propio.match(/<div/g) ?? []).length;
    const cierra = (r.propio.match(/<\/div>/g) ?? []).length;
    expect(abre).toBe(cierra);
  });
});

describe("⚠️ cuándo NO hay que plegar", () => {
  it("un REENVÍO no se pliega: quedaría un correo que se ve vacío", () => {
    // Un reenvío es casi siempre una cita y nada más. Plegarlo dejaría un
    // «•••» donde debería estar todo el contenido, y un correo que parece
    // vacío se lee como correo perdido.
    const soloCita = '<blockquote><p>lo reenviado</p></blockquote>';
    const r = partirCitado(soloCita);
    expect(r.citado).toBeNull();
    expect(r.propio).toBe(soloCita);
  });

  it("un correo sin cita queda igual", () => {
    const r = partirCitado("<p>hola</p>");
    expect(r.citado).toBeNull();
    expect(r.propio).toBe("<p>hola</p>");
  });

  it("un blockquote VACÍO no cuenta como cita", () => {
    const r = partirCitado("<p>hola</p><blockquote>  </blockquote>");
    expect(r.citado).toBeNull();
  });

  it("sin cuerpo no explota", () => {
    expect(partirCitado(null).citado).toBeNull();
    expect(partirCitado("").citado).toBeNull();
  });
});

describe("partirCitadoTexto", () => {
  it("corta en la sangría con >, llevándose el «escribió:»", () => {
    const t = [
      "Bien gracias y tu",
      "",
      "El 18 de septiembre de 2026, Jhon Lopez escribió:",
      "> bien",
      "> esto es una prueba",
    ].join("\n");
    const r = partirCitadoTexto(t);
    expect(r.propio).toBe("Bien gracias y tu");
    expect(r.citado).toContain("escribió:");
    expect(r.citado).toContain("> bien");
  });

  it("⚠️ si el correo ARRANCA citado, no se pliega nada", () => {
    const r = partirCitadoTexto("> todo citado\n> segunda línea");
    expect(r.citado).toBeNull();
  });

  it("un texto sin citas queda igual", () => {
    expect(partirCitadoTexto("hola\nqué tal").citado).toBeNull();
  });
});
