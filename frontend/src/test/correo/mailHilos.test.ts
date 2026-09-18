import { describe, it, expect } from "vitest";
import { agruparEnHilos, asuntoNormalizado, type CorreoEncadenable } from "@/lib/mailHilos";

const c = (o: Partial<CorreoEncadenable> & { date: string }): CorreoEncadenable => ({
  subject: "Contrato", from: "ana@maven-ai.me", to: "bruno@maven-ai.me",
  inReplyTo: undefined, refs: undefined, ...o,
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
      c({ messageId: "<3@z>", refs: ["<1@z>", "<2@z>"], date: "2026-09-17T12:00:00Z" }),
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

  it("⚠️ un correo YA ENCADENADO no se re-une por asunto", () => {
    // Si el paso por cabeceras lo dejó donde corresponde, unirlo ADEMÁS por
    // asunto solo podría meterlo en un hilo ajeno que se llama igual.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Contrato", inReplyTo: "<1@z>", date: "2026-09-17T11:00:00Z" }),
      // Mismo asunto y misma gente, pero cuelga de otra conversación que sí
      // está cargada: se queda en la suya.
      c({ messageId: "<3@z>", subject: "Contrato", inReplyTo: "<9@z>", date: "2026-09-17T12:00:00Z" }),
      c({ messageId: "<9@z>", subject: "Otra cosa", date: "2026-09-17T09:00:00Z" }),
    ]);
    expect(h).toHaveLength(2);
    expect(h.map((x) => x.cantidad).sort()).toEqual([2, 2]);
  });

  it("⚠️ una respuesta que cuelga de algo QUE NO ESTÁ CARGADO sí se une por asunto", () => {
    // El caso real: respondés desde Maven (la copia queda en Enviados) y la
    // contrarespuesta llega a Recibidos apuntando a esa copia. Mirando solo
    // Recibidos, su `In-Reply-To` no resuelve contra nada.
    //
    // Antes contaba como "ya encadenado" por el solo hecho de traer cabecera,
    // así que también quedaba afuera del paso por asunto: no se unía por
    // ningún lado y salía como un correo suelto al lado de su propio hilo.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", subject: "Re: Contrato", inReplyTo: "<enviados@maven-ai.me>", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].cantidad).toBe(2);
  });

  it("⚠️ pero no la une con desconocidos solo porque la cabecera no resolvió", () => {
    // La red de seguridad del paso por asunto sigue pidiendo las tres cosas:
    // mismo asunto, gente en común y menos de 30 días. Acá no hay nadie en
    // común, así que no se unen.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Contrato", date: "2026-09-17T10:00:00Z" }),
      c({
        messageId: "<2@z>", subject: "Re: Contrato", inReplyTo: "<ajeno@otro>",
        from: "otro@ajena.com", to: "tercero@ajena.com", date: "2026-09-17T11:00:00Z",
      }),
    ]);
    expect(h).toHaveLength(2);
  });
});

describe("agruparEnHilos · el hilo «Test» de producción", () => {
  // Los tres correos tal como quedaron en la base el 18/09/2026, con sus
  // Message-ID de verdad. Jhon los vio como dos renglones sueltos en Recibidos
  // mientras Gmail los mostraba como UNA conversación.
  const RAIZ = "<CAA4Qn53gc_DxkrRFFtMFADK1Ukd7iFPdfVEnVuWHyd-v+MptRw@mail.gmail.com>";
  const ENVIADO = "<dea1da25-5c7e-4814-8d3c-8732f7aecebf@maven-ai.me>";
  const RESPUESTA = "<CAA4Qn504Vm1My6ay37ET_WEccnHgpTduzOT9UcLLDgnD4cecsg@mail.gmail.com>";

  const recibidos = () => [
    c({
      messageId: RAIZ, subject: "Test",
      from: "jhon.j.lopez@unlok.me", to: "jhon.lopez@maven-ai.me",
      date: "2026-09-18T20:53:39Z",
    }),
    c({
      messageId: RESPUESTA, subject: "Re: Test",
      inReplyTo: ENVIADO, refs: [RAIZ, ENVIADO],
      from: "jhon.j.lopez@unlok.me", to: "jhon.lopez@maven-ai.me",
      date: "2026-09-18T21:02:52Z",
    }),
  ];

  it("los agrupa por References aunque el In-Reply-To apunte a Enviados", () => {
    const h = agruparEnHilos(recibidos());
    expect(h).toHaveLength(1);
    expect(h[0].cantidad).toBe(2);
    expect(h[0].asunto).toBe("Test");
  });

  it("⚠️ y también sin References, que es como quedó la copia en Enviados", () => {
    // La copia sembrada en Enviados no guardaba las cabeceras del hilo, así
    // que hubo media hora en que ese correo no tenía `refs`. Aun así tiene
    // que agrupar, por el camino del asunto.
    const [raiz, respuesta] = recibidos();
    const h = agruparEnHilos([raiz, { ...respuesta, refs: undefined }]);
    expect(h).toHaveLength(1);
    expect(h[0].cantidad).toBe(2);
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

describe("cómo se presenta el hilo en la lista", () => {
  it("el hilo se llama como EMPEZÓ, no como su última respuesta", () => {
    // Con el del último se leería «Re: RE: RV: Hojas de vida», que es ruido de
    // los clientes de correo, no el tema de la conversación.
    const h = agruparEnHilos([
      c({ messageId: "<1@z>", subject: "Hojas de vida Chatters", date: "2026-09-17T10:00:00Z" }),
      c({ messageId: "<2@z>", inReplyTo: "<1@z>", subject: "RE: RV: Hojas de vida Chatters", date: "2026-09-17T11:00:00Z" }),
    ]);
    expect(h[0].asunto).toBe("Hojas de vida Chatters");
    expect(h[0].ultimo.subject).toBe("RE: RV: Hojas de vida Chatters");
  });

  it("caso real de prod: 11 correos quedan en 7 conversaciones", () => {
    const correos = [
      c({ messageId: "<a1@z>", subject: "Asunto: Transición de Hubstaff a CRM Maven", from: "grace.gelves@maven-ai.me", to: "hhrr@maven-ai.me", date: "2026-09-17T17:00:59Z" }),
      c({ messageId: "<a2@z>", subject: "Re: Asunto: Transición de Hubstaff a CRM Maven", from: "daniel.duque@maven-ai.me", to: "grace.gelves@maven-ai.me", date: "2026-09-18T15:26:00Z" }),
      c({ messageId: "<b1@z>", subject: "Hojas de vida Chatters", from: "lina.pertuz@maven-ai.me", to: "andrea.palacio@maven-ai.me", date: "2026-09-17T15:37:00Z" }),
      c({ messageId: "<b2@z>", subject: "Re: Hojas de vida Chatters", from: "grace.gelves@maven-ai.me", to: "lina.pertuz@maven-ai.me", date: "2026-09-16T23:17:02Z" }),
      c({ messageId: "<b3@z>", subject: "RE: RV: Hojas de vida Chatters", from: "andrea.palacio@maven-ai.me", to: "lina.pertuz@maven-ai.me", date: "2026-09-16T22:15:35Z" }),
      c({ messageId: "<c1@z>", subject: "BASE DE DATOS MODELOS", from: "brayan.castano@maven-ai.me", to: "maria.suarez@maven-ai.me", date: "2026-09-17T15:53:00Z" }),
      c({ messageId: "<c2@z>", subject: "Re: BASE DE DATOS MODELOS", from: "maria.suarez@maven-ai.me", to: "brayan.castano@maven-ai.me", date: "2026-09-18T10:26:00Z" }),
      c({ messageId: "<d1@z>", subject: "(sin asunto)", from: "x@otra.com", to: "jhon.lopez@maven-ai.me", date: "2026-09-18T09:00:00Z" }),
      c({ messageId: "<d2@z>", subject: "(sin asunto)", from: "z@tercera.com", to: "jhon.lopez@maven-ai.me", date: "2026-09-18T08:00:00Z" }),
      c({ messageId: "<e1@z>", subject: "Reporte semanal", from: "ana@maven-ai.me", to: "jhon.lopez@maven-ai.me", date: "2026-01-10T10:00:00Z" }),
      c({ messageId: "<e2@z>", subject: "Reporte semanal", from: "ana@maven-ai.me", to: "jhon.lopez@maven-ai.me", date: "2026-09-18T10:00:00Z" }),
    ];
    const h = agruparEnHilos(correos);
    expect(h).toHaveLength(7);
    // El de 3 es el de las hojas de vida, con el «RE: RV:» adentro.
    expect(h.find((x) => x.cantidad === 3)?.asunto).toBe("Hojas de vida Chatters");
    // Los dos (sin asunto) y los dos Reporte semanal siguen sueltos.
    expect(h.filter((x) => x.cantidad === 1)).toHaveLength(4);
    // Arriba, el hilo con la respuesta más nueva.
    expect(h[0].ultimo.messageId).toBe("<a2@z>");
  });
});
