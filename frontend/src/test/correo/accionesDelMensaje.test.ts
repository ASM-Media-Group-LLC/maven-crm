import { describe, it, expect } from "vitest";
import type { MailMessage, MailSummary } from "@/hooks/useMailbox";
import {
  agruparPorCarpeta, borradorDeReenvio, borradorDeRespuesta, desdeAqui, NO_SE_SUELTA, paraSoltarEnCarpeta,
} from "@/lib/correo/accionesDelMensaje";
import { juntarSinRepetir, partirNoLeidosPrimero } from "@/lib/correo/noLeidosPrimero";
import { agruparEnHilos } from "@/lib/mailHilos";
import { enlaceACorreo, resumenParaElChat, textoParaElChat } from "@/lib/correo/compartirEnChat";
import { esAtajoDeVolver } from "@/lib/correo/atajos";
import { sanitizarPrefsCorreo } from "@/hooks/usePreferenciasCorreo";

// Lo puro de los cuatro pedidos de Keila (02/10): el ⋮ de cada mensaje, «No
// leídos primero», arrastrar a carpetas y etiquetas, y el enlace del chat.

const resumen = (over: Partial<MailSummary>): MailSummary => ({
  id: "x", uid: 1, from: "Ana <ana@x.com>", to: "yo@maven-ai.me", subject: "Contrato",
  date: "2026-09-30T10:00:00Z", messageId: "<x@x>", inReplyTo: undefined, refs: undefined,
  unread: false, origen: "cache", ...over,
});
const cuerpo = (over: Partial<MailMessage>): MailMessage => ({
  folder: "INBOX", from: "Ana <ana@x.com>", to: "yo@maven-ai.me", cc: "", subject: "Contrato",
  date: "2026-09-30T10:00:00Z", html: null, text: "Hola", remote_images: 0, attachments: [], truncated: false,
  ...over,
});

describe("responder a UN mensaje del hilo (el ⋮), no al abierto", () => {
  it("encadena con ESE mensaje: su Message-ID y su cadena de References", () => {
    const m1 = resumen({ id: "a", messageId: "<a@x>", refs: ["<raiz@x>"] });
    const b = borradorDeRespuesta({
      resumen: m1, mensaje: cuerpo({ from: "Ana <ana@x.com>", subject: "Re: Contrato", text: "Lo reviso" }),
      yo: "yo@maven-ai.me", aTodos: false, fecha: "30 de septiembre",
    });
    expect(b.inReplyTo).toBe("<a@x>");
    expect(b.references).toBe("<raiz@x> <a@x>");
    expect(b.to).toBe("ana@x.com");
    // No se apila «Re: Re:».
    expect(b.subject).toBe("Re: Contrato");
    expect(b.citar).toEqual({ de: "Ana", fecha: "30 de septiembre", texto: "Lo reviso" });
  });

  it("a todos: suma el Para y la Copia del original, menos yo", () => {
    const b = borradorDeRespuesta({
      resumen: resumen({}),
      mensaje: cuerpo({ from: "Ana <ana@x.com>", to: "yo@maven-ai.me, beto@x.com", cc: "caro@x.com" }),
      yo: "yo@maven-ai.me", aTodos: true, fecha: "",
    });
    expect(b.to).toBe("ana@x.com, beto@x.com");
    expect(b.cc).toBe("caro@x.com");
  });

  it("sin Message-ID no inventa encadenado", () => {
    const b = borradorDeRespuesta({
      resumen: resumen({ messageId: undefined }), mensaje: cuerpo({}), yo: "yo@maven-ai.me", aTodos: false, fecha: "",
    });
    expect(b.inReplyTo).toBeUndefined();
    expect(b.references).toBeUndefined();
  });

  it("reenviar: sin inReplyTo, con el cajón de borrador del mensaje y la cita completa", () => {
    const b = borradorDeReenvio({
      resumen: resumen({ messageId: "<f@x>" }),
      mensaje: cuerpo({ subject: "Factura", to: "yo@maven-ai.me" }),
      fecha: "1 de octubre", carpeta: "Archive",
    });
    expect(b.to).toBe("");
    expect(b.subject).toBe("Fwd: Factura");
    expect(b.inReplyTo).toBeUndefined();
    expect(b.reenvioDe).toBe("<f@x>");
    expect(b.citar).toMatchObject({ reenvio: true, de: "Ana <ana@x.com>", asunto: "Factura", fecha: "1 de octubre" });
    // Sin Message-ID, el cajón se arma con la carpeta y el uid DE ESE MENSAJE.
    expect(borradorDeReenvio({
      resumen: resumen({ messageId: undefined, uid: 77 }), mensaje: cuerpo({}), fecha: "", carpeta: "Archive",
    }).reenvioDe).toBe("uid:Archive:77");
  });
});

describe("«Marcar como no leído a partir de aquí»", () => {
  const h1 = resumen({ id: "1", uid: 1, folder: "INBOX", messageId: "<1@x>", date: "2026-09-28T10:00:00Z" });
  const h2 = resumen({ id: "2", uid: 5, folder: "Enviado", messageId: "<2@x>", date: "2026-09-29T10:00:00Z" });
  const h3 = resumen({ id: "3", uid: 3, folder: "INBOX", messageId: "<3@x>", date: "2026-09-30T10:00:00Z" });

  it("toma ESE mensaje y los posteriores, no los anteriores", () => {
    expect(desdeAqui([h1, h2, h3], h2).map((m) => m.id)).toEqual(["2", "3"]);
    expect(desdeAqui([h3, h1, h2], h1).map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(desdeAqui([h1, h2, h3], h3).map((m) => m.id)).toEqual(["3"]);
  });

  it("no cuenta dos veces el mismo mensaje (el abierto y su copia en el hilo)", () => {
    const copia = { ...h2 };
    expect(desdeAqui([h1, copia, h3], h2).map((m) => m.id)).toEqual(["2", "3"]);
  });

  it("⚠️ se agrupa POR CARPETA: el uid 5 de Enviados no es el uid 5 de Recibidos", () => {
    const grupos = agruparPorCarpeta(desdeAqui([h1, h2, h3], h2), "INBOX");
    expect([...grupos.entries()].map(([f, ms]) => [f, ms.map((m) => m.uid)])).toEqual([
      ["Enviado", [5]],
      ["INBOX", [3]],
    ]);
  });

  it("un correo sin carpeta es de la carpeta que se mira", () => {
    const grupos = agruparPorCarpeta([resumen({ id: "s", folder: undefined })], "Archive");
    expect([...grupos.keys()]).toEqual(["Archive"]);
  });
});

describe("soltar correos arrastrados sobre una carpeta", () => {
  it("se mueve lo que no está ya ahí", () => {
    const a = resumen({ id: "a", folder: "INBOX" });
    const b = resumen({ id: "b", folder: "Archive" });
    const r = paraSoltarEnCarpeta([a, b], "Archive", "INBOX");
    expect(r.mover.map((m) => m.id)).toEqual(["a"]);
    expect(r.yaEstaban).toBe(1);
  });

  it("no se suelta en Pospuestos (sin cuándo, quedaría escondido), Borradores ni Enviados", () => {
    for (const f of ["Snoozed", "Borrador", "Enviado"]) expect(NO_SE_SUELTA.has(f)).toBe(true);
    for (const f of ["INBOX", "Archive", "Papelera", "Correo no deseado", "Proveedores"]) {
      expect(NO_SE_SUELTA.has(f)).toBe(false);
    }
  });
});

describe("«No leídos primero»", () => {
  const leido = (id: string, date: string, over: Partial<MailSummary> = {}) =>
    resumen({ id, messageId: `<${id}@x>`, subject: `Asunto ${id}`, date, unread: false, ...over });

  it("junta los no leídos de TODA la carpeta con la página, sin repetir", () => {
    const n1 = leido("n1", "2026-09-01T10:00:00Z", { unread: true });
    const p1 = leido("p1", "2026-09-30T10:00:00Z");
    expect(juntarSinRepetir([n1], [p1, { ...n1, unread: false }]).map((m) => m.id)).toEqual(["n1", "p1"]);
  });

  it("una conversación va arriba si CUALQUIERA de sus mensajes está sin leer", () => {
    const raiz = leido("r", "2026-09-29T10:00:00Z", { subject: "Pagos", from: "Ana <ana@x.com>" });
    const respuesta = leido("re", "2026-09-30T10:00:00Z", {
      subject: "Re: Pagos", from: "Beto <beto@x.com>", to: "ana@x.com", unread: true,
      inReplyTo: "<r@x>", refs: ["<r@x>"],
    });
    const suelto = leido("s", "2026-09-30T11:00:00Z");
    const { noLeidos, resto } = partirNoLeidosPrimero(agruparEnHilos([raiz, respuesta, suelto]));
    expect(noLeidos.map((h) => h.mensajes.map((m) => m.id).sort())).toEqual([["r", "re"]]);
    expect(resto.map((h) => h.ultimo.id)).toEqual(["s"]);
  });

  it("lo que se acaba de leer se queda arriba mientras se retenga", () => {
    const recien = leido("x", "2026-09-30T10:00:00Z");
    const { noLeidos } = partirNoLeidosPrimero(agruparEnHilos([recien]), (m) => m.id === "x");
    expect(noLeidos).toHaveLength(1);
  });
});

describe("«Compartir en el chat»", () => {
  it("el enlace va por Message-ID (cada quien abre SU copia), codificado", () => {
    expect(enlaceACorreo("https://app.maven-ai.me/", "<a+b@x.com>"))
      .toBe("https://app.maven-ai.me/correo?mensaje=%3Ca%2Bb%40x.com%3E");
    expect(enlaceACorreo("https://app.maven-ai.me", undefined)).toBeNull();
  });

  it("el mensaje lleva quién, asunto, fecha, resumen y enlace, siempre en español", () => {
    const texto = textoParaElChat({
      de: "Ana Smith <ana@x.com>", asunto: "Quarterly report", fecha: "2026-10-01T15:30:00",
      resumen: "Here is the report. > El 30 de septiembre, Beto escribió: viejo", messageId: "<m1@x>",
    }, "  Miren esto  ", "https://app.maven-ai.me");
    expect(texto.split("\n")).toEqual([
      "Miren esto",
      "",
      "Correo compartido",
      "De: Ana Smith <ana@x.com>",
      "Asunto: Quarterly report",
      "Fecha: 1 de octubre de 2026, 15:30",
      "",
      "«Here is the report.»",
      "",
      "Abrir en Maven: https://app.maven-ai.me/correo?mensaje=%3Cm1%40x%3E",
    ]);
  });

  it("el resumen se recorta en una palabra", () => {
    const largo = "palabra ".repeat(100);
    const r = resumenParaElChat(largo);
    expect(r.length).toBeLessThanOrEqual(281);
    expect(r.endsWith("palabra…")).toBe(true);
  });
});

describe("«u» y Escape vuelven a la lista", () => {
  const tecla = (key: string, over: Partial<KeyboardEvent> = {}) => ({
    key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: document.body, ...over,
  });

  it("con nada encima, sí", () => {
    document.body.innerHTML = "";
    expect(esAtajoDeVolver(tecla("u"), document)).toBe(true);
    expect(esAtajoDeVolver(tecla("Escape"), document)).toBe(true);
    expect(esAtajoDeVolver(tecla("j"), document)).toBe(false);
    expect(esAtajoDeVolver(tecla("u", { metaKey: true }), document)).toBe(false);
  });

  it("escribiendo, o con un diálogo o un menú abierto, no", () => {
    document.body.innerHTML = '<input id="i" /><div id="e" contenteditable="true"></div>';
    expect(esAtajoDeVolver(tecla("u", { target: document.getElementById("i") }), document)).toBe(false);
    expect(esAtajoDeVolver(tecla("u", { target: document.getElementById("e") }), document)).toBe(false);
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(esAtajoDeVolver(tecla("Escape"), document)).toBe(false);
    document.body.innerHTML = '<div role="menu"></div>';
    expect(esAtajoDeVolver(tecla("u"), document)).toBe(false);
    document.body.innerHTML = "";
  });
});

describe("las preferencias del correo", () => {
  it("solo se aceptan las claves y los valores válidos", () => {
    expect(sanitizarPrefsCorreo({ noLeidosPrimero: true, lectura: "completa", otra: 1 }))
      .toEqual({ noLeidosPrimero: true, lectura: "completa" });
    expect(sanitizarPrefsCorreo({ noLeidosPrimero: "si", lectura: "abajo" })).toEqual({});
    expect(sanitizarPrefsCorreo(null)).toEqual({});
    expect(sanitizarPrefsCorreo([1, 2])).toEqual({});
  });
});
