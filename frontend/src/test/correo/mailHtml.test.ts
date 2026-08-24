// Lo que le LLEGA al destinatario. Cada caso de acá es un defecto que ya
// pasó de verdad y que no se ve mirando la pantalla del compositor.
import { describe, expect, it } from "vitest";
import { htmlParaCorreo, textoParaCorreo } from "@/components/correo/mailHtml";

describe("textoParaCorreo", () => {
  it("no pega el sub-ítem al padre en listas anidadas", () => {
    const txt = textoParaCorreo(
      "<ul><li><p>Padre</p><ul><li><p>HijoA</p></li><li><p>HijoB</p></li></ul></li><li><p>Otro</p></li></ul>",
    );
    expect(txt).not.toContain("PadreHijoA");
    expect(txt).toContain("- Padre");
    expect(txt).toContain("HijoA");
    expect(txt).toContain("- Otro");
  });

  it("prefija con '>' TODAS las líneas citadas, no solo la primera", () => {
    const txt = textoParaCorreo(
      "<p>Perfecto, nos vemos.</p><blockquote><p>El 20 ago, Ana escribió:</p>" +
        "<p>Hola Jhon,<br>Te confirmo la reunión.<br>Llevo el contrato.</p></blockquote>",
    );
    const citadas = txt
      .split("\n")
      .filter((l) => l.includes("confirmo") || l.includes("contrato"));
    expect(citadas).toHaveLength(2);
    citadas.forEach((l) => expect(l.trimStart().startsWith(">")).toBe(true));
  });

  it("respeta el start de una lista numerada (el HTML sí lo respetaba)", () => {
    const txt = textoParaCorreo('<ol start="3"><li><p>tres</p></li><li><p>cuatro</p></li></ol>');
    expect(txt).toContain("3. tres");
    expect(txt).toContain("4. cuatro");
  });

  it("conserva la URL de los links", () => {
    expect(textoParaCorreo('<p>ver <a href="https://maven.asmtech.ai/x">acá</a></p>')).toContain(
      "https://maven.asmtech.ai/x",
    );
  });

  it("un <li> con dos párrafos no queda pegado", () => {
    expect(textoParaCorreo("<ul><li><p>uno</p><p>dos</p></li></ul>")).not.toContain("unodos");
  });
});

describe("htmlParaCorreo", () => {
  it("no le pone margen al <p> de adentro de un <li> (listas a doble espacio)", () => {
    const html = htmlParaCorreo("<ul><li><p>uno</p></li><li><p>dos</p></li></ul>");
    const dentro = html.match(/<li><p style="([^"]*)"/)?.[1] ?? "";
    expect(dentro).toContain("margin:0");
    expect(dentro).not.toContain("10px");
  });

  it("conserva atributos como start (el reemplazo de texto los perdía)", () => {
    const html = htmlParaCorreo('<ol start="3"><li><p>tres</p></li></ol>');
    expect(html).toContain('start="3"');
    expect(html).toContain("padding-left:24px");
  });

  it("no toca el interior de un href aunque tenga '<p>' adentro", () => {
    // El serializador NO escapa '<' en atributos: con reemplazo de texto,
    // un href que contiene "<p>" recibía el estilo DENTRO de la URL.
    const html = htmlParaCorreo('<p><a href="https://x.com/?q=<p>">link</a></p>');
    const href = html.match(/href="([^"]*)"/)?.[1] ?? "";
    expect(href).not.toContain("style");
    expect(href).not.toContain("margin");
    expect(html).toContain("color:#4f46e5");
  });

  it("le da altura a los renglones en blanco", () => {
    expect(htmlParaCorreo("<p>uno</p><p></p><p>dos</p>")).toContain("&nbsp;");
  });

  it("estila el tachado inline (el motor de Word no estila <s>)", () => {
    expect(htmlParaCorreo("<p><s>viejo</s></p>")).toContain("line-through");
  });

  it("declara fondo blanco (clientes que muestran el correo en oscuro)", () => {
    expect(htmlParaCorreo("<p>hola</p>")).toContain("background-color:#ffffff");
  });
});
