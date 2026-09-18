import { describe, it, expect } from "vitest";
import { agruparEnHilos, asuntoNormalizado, type CorreoEncadenable } from "@/lib/mailHilos";

const c = (o: Partial<CorreoEncadenable> & { date: string }): CorreoEncadenable => ({
  subject: "Contrato", from: "ana@maven-ai.me", to: "bruno@maven-ai.me", ...o,
});

describe("asuntoNormalizado", () => {
  it("saca Re: y RV:", () => {
    expect(asuntoNormalizado("Re: Contrato")).toBe("contrato");
    expect(asuntoNormalizado("RV: Contrato")).toBe("contrato");
  });

  it("⚠️ desapila los prefijos que se acumulan entre clientes", () => {
    // Zoho, Gmail y Outlook conviven en la misma empresa y cada uno pone el
    // suyo: sin desapilar, la misma conversación se parte en dos.
    expect(asuntoNormalizado("Re: RV: Fwd: Re: Contrato")).toBe("contrato");
  });

  it("aguanta el Re[2]: de los clientes viejos", () => {
    expect(asuntoNormalizado("Re[2]: Contrato")).toBe("contrato");
  });

  it("no se come una palabra que EMPIEZA con re", () => {
    expect(asuntoNormalizado("Reporte semanal")).toBe("reporte semanal");
    expect(asuntoNormalizado("Revisión de QA")).toBe("revisión de qa");
  });

  it("normaliza espacios y mayúsculas", () => {
    expect(asuntoNormalizado("  CONTRATO   Final  ")).toBe("contrato final");
  });
});

describe("agruparEnHilos · por cabeceras", () => {
  it("une la respuesta con su original", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", subject: "Re: Contrato", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].cantidad).toBe(2);
  });

  it("encadena un hilo de tres por References", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", date: "2026-09-17T11:00:00Z" }),
      c({ messageId: "<3@z>", references: ["<1@z>", "<2@z>"], date: "2026-09-17T12:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].cantidad).toBe(3);
  });

  it("⚠️ une aunque le hayan CAMBIADO el asunto al responder", () => {
    // Es lo que hace bien la cabecera y mal el asunto.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", subject: "otra cosa distinta", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
  });

  it("los mensajes quedan del más viejo al más nuevo", () => {
    const h = agruparEnHilos([
      c({ messageId: "<3@z>", inReplyTo: "<1@z>", date: "2026-09-17T12:00:00Z" }),
      c({ messageId: "<1@z>", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h[0].mensajes.map((m) => m.messageId)).toEqual(["<1@z>", "<2@z>", "<3@z>"]);
    expect(h[0].ultimo.messageId).toBe("<3@z>");
  });
});

describe("agruparEnHilos · por asunto, para los que NO traen cabeceras", () => {
  it("une los correos ya guardados, que no tienen In-Reply-To", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Re: Contrato", from: "bruno@maven-ai.me", to: "ana@maven-ai.me", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
  });

  it("⚠️ NO une dos «(sin asunto)» de gente distinta", () => {
    // Sin este freno, todos los (sin asunto) de la bandeja caen en UN hilo
    // gigante que se traga correos que no tienen nada que ver.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "(sin asunto)", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "(sin asunto)", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
  });

  it("⚠️ NO une un asunto de una o dos letras", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "ok", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "ok", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
  });

  it("⚠️ NO une a dos personas que no comparten ninguna dirección", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Factura mensual", from: "ana@maven-ai.me", to: "x@otra.com", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Factura mensual", from: "zoe@tercera.com", to: "w@cuarta.com", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
  });

  it("⚠️ NO une dos «Reporte semanal» separados por meses", () => {
    // Eso no es una conversación, es una costumbre.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Reporte semanal", date: "2026-01-10T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Reporte semanal", date: "2026-09-17T10:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
  });

  it("sí une dos del mismo asunto, misma gente, en la misma semana", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Reporte semanal", date: "2026-09-14T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Re: Reporte semanal", date: "2026-09-17T10:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
  });

  it("⚠️ un correo CON cabeceras no se re-une por asunto", () => {
    // Si ya quedó donde corresponde, unirlo además por asunto solo podría
    // meterlo en un hilo ajeno que casualmente se llama igual.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Contrato", inReplyTo: "<ajeno@otro>", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
  });
});

describe("agruparEnHilos · el orden de la bandeja", () => {
  it("un hilo viejo con respuesta de hoy va ARRIBA", () => {
    const h = agruparEnHilos([
      c({ messageId: "<a@z>", subject: "Algo reciente", from: "z@maven-ai.me", to: "q@maven-ai.me", date: "2026-09-16T10:00:00Z" }),
      c({ messageId: "<1@z>", subject: "Contrato de marzo", date: "2026-03-01T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", date: "2026-09-18T10:00:00Z" }),
    ]);
    expect(h[0].ultimo.messageId).toBe("<2@z>");
    expect(h[0].cantidad).toBe(2);
  });

  it("un correo suelto es un hilo de uno", () => {
    const h = agruparEnHilos([c({ messageId: "<1@z>", date: "2026-09-17T10:00:00Z" })]);
    expect(h[0].cantidad).toBe(1);
  });

  it("una bandeja vacía no se rompe", () => {
    expect(agruparEnHilos([])).toEqual([]);
  });

  it("aguanta correos sin messageId", () => {
    const h = agruparEnHilos([
      c({ date: "2026-09-17T10:00:00Z" }),
      c({ date: "2026-09-17T11:00:00Z", from: "bruno@maven-ai.me", to: "ana@maven-ai.me", subject: "Re: Contrato" }),
    ]);
    expect(h).toHaveLength(1);
  });

  it("⚠️ no se cuelga con una referencia circular", () => {
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", inReplyTo: "<2@z>", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
  });
});
