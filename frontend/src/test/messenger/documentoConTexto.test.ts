// Keila (08/10): «cuando adjuntamos documentos al chat el texto que se escribe para
// enviarlo con los documentos no sale, o sea se pierde». El compositor guardaba el
// texto en el primer archivo (MessageInput: «viaja en la primera imagen… o, si no
// hay imágenes, en el primer archivo»), pero la burbuja de un DOCUMENTO dibujaba
// solo la tarjeta del archivo y nunca el texto: 219 documentos de 26 personas con
// el texto escondido en 60 días. Las imágenes sí lo mostraban.
import { describe, it, expect } from "vitest";
import burbuja from "@/pages/messenger/components/MessageBubble.tsx?raw";
import compositor from "@/pages/messenger/components/MessageInput.tsx?raw";

describe("un documento con texto muestra el texto", () => {
  const rama = burbuja.slice(burbuja.indexOf('if (message.type === "file") {'), burbuja.indexOf("if (isEditing)"));

  it("la burbuja de documento dibuja el texto debajo de la tarjeta", () => {
    expect(rama.length, "no encontré la rama de documento").toBeGreaterThan(200);
    expect(rama).toMatch(/message\.content && message\.content !== message\.file_name/);
    expect(rama).toMatch(/<RichText doc=\{message\.content_rich\}/);
    expect(rama).toMatch(/whitespace-pre-wrap/);
  });

  it("y el compositor sigue mandando el texto con el primer archivo si no hay imágenes", () => {
    expect(compositor).toMatch(/const givesCaption = captionPending && \(imageCount > 0 \? isImg : true\)/);
  });
});
