// Keila (06/10): «tenemos que poder ajustar el tamaño de las imágenes adjuntas,
// se está enviando en tamaño real y al salir a correos de terceros distorsionan
// el mensaje». Como Gmail: entran ajustadas a 600 px y se elige Pequeña, Mediana,
// Grande u Original; al enviar llevan su ancho (atributo, para Outlook) y
// max-width:100% (para el teléfono).
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ImagenConTamano } from "@/components/correo/ImagenConTamano";
import { htmlParaCorreo } from "@/components/correo/mailHtml";
import { ANCHO_AJUSTADO, anchoDeAtributo, anchoInicial, LADO_MAXIMO, medidasAchicadas, TAMANOS } from "@/lib/correo/imagenesDelCorreo";
import compositor from "@/components/correo/MailComposer.tsx?raw";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("los tamaños", () => {
  it("al pegar: la suya si es chica; si no, 600", () => {
    expect(anchoInicial(320)).toBe(320);
    expect(anchoInicial(2560)).toBe(ANCHO_AJUSTADO);
    expect(anchoInicial(0)).toBe(ANCHO_AJUSTADO);
  });

  it("una imagen enorme se achica (sin deformarla); una chica, nunca se agranda", () => {
    expect(medidasAchicadas(3840, 2160)).toEqual({ ancho: LADO_MAXIMO, alto: 900 });
    expect(medidasAchicadas(1080, 2400)).toEqual({ ancho: 720, alto: LADO_MAXIMO });
    expect(medidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it("el menú: Pequeña, Mediana, Grande (600) y Original (sin ancho)", () => {
    expect(TAMANOS.map((t) => [t.clave, t.ancho])).toEqual([["pequena", 200], ["mediana", 400], ["grande", 600], ["original", null]]);
    expect(anchoDeAtributo("400")).toBe(400);
    expect(anchoDeAtributo("abc")).toBeNull();
    expect(anchoDeAtributo(null)).toBeNull();
  });
});

describe("la imagen del editor lleva su ancho", () => {
  let editor: Editor | null = null;
  afterEach(() => editor?.destroy());

  it("con ancho: el atributo width (Outlook) y el estilo con tope (teléfono)", () => {
    editor = new Editor({ extensions: [StarterKit, ImagenConTamano.configure({ allowBase64: true })], content: "" });
    editor.commands.insertContent({ type: "image", attrs: { src: PNG, width: 400 } });
    const html = editor.getHTML();
    expect(html).toMatch(/<img[^>]+width="400"/);
    expect(html).toMatch(/style="width:\s*400px;\s*max-width:\s*100%;\s*height:\s*auto;?"/);
  });

  it("cambiar el tamaño cambia el ancho; Original lo saca y deja solo el tope", () => {
    editor = new Editor({ extensions: [StarterKit, ImagenConTamano.configure({ allowBase64: true })], content: `<img src="${PNG}" width="600">` });
    expect(editor.getHTML()).toMatch(/width="600"/);
    editor.commands.setNodeSelection(0);
    editor.commands.updateAttributes("image", { width: 200 });
    expect(editor.getHTML()).toMatch(/width="200"/);
    editor.commands.updateAttributes("image", { width: null });
    expect(editor.getHTML()).not.toMatch(/width="/);
    expect(editor.getHTML()).toMatch(/max-width:\s*100%;\s*height:\s*auto/);
  });
});

describe("el correo que sale", () => {
  it("toda imagen lleva max-width:100% (aunque venga de otro lado, p. ej. un reenvío)", () => {
    const html = htmlParaCorreo(`<p>hola</p><img src="cid:abc">`);
    expect(html).toMatch(/<img src="cid:abc" style="max-width:100%;height:auto">/);
  });

  it("y no se repite si la del editor ya lo trae", () => {
    const html = htmlParaCorreo(`<img src="cid:abc" width="400" style="width:400px;max-width:100%;height:auto">`);
    expect(html.match(/max-width/g)?.length).toBe(1);
    expect(html).toMatch(/width="400"/);
  });
});

describe("el compositor", () => {
  it("pega con el ancho preparado y muestra el menú de tamaño al tocar la imagen", () => {
    expect(compositor).toMatch(/const \{ src, ancho \} = await prepararImagen\(dataUrl, f\.type\)/);
    expect(compositor).toMatch(/insertContent\(\{ type: "image", attrs: \{ src, width: ancho \} \}\)/);
    expect(compositor).toMatch(/ImagenConTamano\.configure\(\{ allowBase64: true, inline: false \}\)/);
    expect(compositor).toMatch(/\{editor && <MenuDeTamanoDeImagen editor=\{editor\} \/>\}/);
    expect(compositor).toMatch(/if \(!editor\.isActive\("image"\)\) return setPos\(null\)/);
    expect(compositor).toMatch(/updateAttributes\("image", \{ width: valor \}\)/);
    // Sin tippy.js (el BubbleMenu de TipTap): no anda en las pruebas y es una librería entera para cuatro botones.
    expect(compositor).not.toMatch(/BubbleMenu \}|<BubbleMenu/);
  });
});
