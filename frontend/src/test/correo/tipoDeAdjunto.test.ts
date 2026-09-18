import { describe, it, expect } from "vitest";
import { tipoDeAdjunto } from "@/components/correo/AdjuntoVisor";
import type { MailAttachment } from "@/hooks/useMailbox";

const adj = (filename: string, contentType = ""): MailAttachment =>
  ({ filename, contentType, sizeBytes: 1, contentId: null }) as MailAttachment;

describe("tipoDeAdjunto", () => {
  it("lo de siempre sigue igual", () => {
    expect(tipoDeAdjunto(adj("cv.pdf"))).toBe("pdf");
    expect(tipoDeAdjunto(adj("foto.png"))).toBe("imagen");
    expect(tipoDeAdjunto(adj("notas.txt"))).toBe("texto");
    expect(tipoDeAdjunto(adj("respaldo.zip"))).toBe("ninguno");
  });

  it("⚠️ Office moderno va a ONLYOFFICE; el viejo sigue por el conversor", () => {
    // Convertir un .docx a PDF era ver una FOTO del documento: las fórmulas de
    // una hoja no se podían mirar y una tabla ancha salía cortada por el salto
    // de página que LibreOffice le inventaba. Los formatos VIEJOS sí siguen
    // por LibreOffice, que los abre mejor que ONLYOFFICE.
    expect(tipoDeAdjunto(adj("informe.docx"))).toBe("office");
    expect(tipoDeAdjunto(adj("cuentas.xlsx"))).toBe("office");
    expect(tipoDeAdjunto(adj("pitch.pptx"))).toBe("office");

    expect(tipoDeAdjunto(adj("viejo.doc"))).toBe("convertible");
    expect(tipoDeAdjunto(adj("viejo.xls"))).toBe("convertible");
    expect(tipoDeAdjunto(adj("texto.odt"))).toBe("convertible");
  });

  it("reconoce una invitación por extensión y por Content-Type", () => {
    expect(tipoDeAdjunto(adj("invite.ics"))).toBe("calendario");
    // ⚠️ La mitad llegan SIN extensión: Google manda una copia como
    // `invite.ics` y otra llamada solo "adjunto", con el mismo contenido.
    expect(tipoDeAdjunto(adj("adjunto", "text/calendar"))).toBe("calendario");
    expect(tipoDeAdjunto(adj("invite.ics", "application/ics"))).toBe("calendario");
  });

  it("⚠️ el calendario gana sobre el texto plano", () => {
    // Un .ics ES text/…: si lo atrapara la rama de texto se vería el archivo
    // crudo en vez de la reunión. El orden de los `if` es el arreglo.
    expect(tipoDeAdjunto(adj("invite.ics", "text/calendar"))).toBe("calendario");
    expect(tipoDeAdjunto(adj("agenda.ics", "text/plain"))).toBe("calendario");
  });

  it("reconoce audio y video, por extensión y por tipo declarado", () => {
    expect(tipoDeAdjunto(adj("nota.mp3"))).toBe("audio");
    expect(tipoDeAdjunto(adj("audio.m4a"))).toBe("audio");
    expect(tipoDeAdjunto(adj("clip.mp4"))).toBe("video");
    expect(tipoDeAdjunto(adj("grabacion.mov"))).toBe("video");
    // Por IMAP llegan anunciados como octet-stream, así que manda la extensión.
    expect(tipoDeAdjunto(adj("nota.mp3", "application/octet-stream"))).toBe("audio");
    // Y al revés: sin extensión conocida, sirve el tipo declarado.
    expect(tipoDeAdjunto(adj("grabacion", "audio/ogg"))).toBe("audio");
    expect(tipoDeAdjunto(adj("grabacion", "video/webm"))).toBe("video");
  });
});
