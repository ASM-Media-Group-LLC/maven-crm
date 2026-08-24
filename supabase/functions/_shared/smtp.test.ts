// Tests de quotedPrintable: la parte del SMTP que más fácil se rompe en
// silencio. Un QP mal armado = correos truncados o con "=E2=80" visibles.
// Correr: deno test supabase/functions/_shared/smtp.test.ts

import { buildMessage, encodeHeader, esDireccionSmtp, quotedPrintable } from "./smtp.ts";

function decodeQP(qp: string): string {
  // Decodificador de referencia: soft breaks fuera, =XX a bytes, UTF-8.
  const sinSoft = qp.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < sinSoft.length; i++) {
    const ch = sinSoft[i];
    if (ch === "=" && i + 2 < sinSoft.length + 1) {
      bytes.push(parseInt(sinSoft.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (ch === "\r") {
      continue;
    } else if (ch === "\n") {
      bytes.push(13, 10);
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\r\n/g, "\n");
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("roundtrip: emojis, acentos y saltos sobreviven", () => {
  const original = "Hola 👋 ¿cómo estás?\nSegunda línea con ñ y 🎉🔥\n\núltimo párrafo";
  assert(decodeQP(quotedPrintable(original)) === original, "roundtrip falló");
});

Deno.test("ninguna línea supera 76 caracteres", () => {
  const larga = "<div>" + "palabra ".repeat(500) + "🎯".repeat(100) + "</div>";
  const qp = quotedPrintable(larga);
  for (const linea of qp.split("\r\n")) {
    assert(linea.length <= 76, `línea de ${linea.length}: ${linea.slice(0, 40)}…`);
  }
  assert(decodeQP(qp) === larga, "roundtrip de línea larga falló");
});

Deno.test("no parte un =XX por la mitad al envolver", () => {
  // Muchos bytes multibyte seguidos fuerzan cortes cerca de secuencias =XX.
  const denso = "é".repeat(300);
  const qp = quotedPrintable(denso);
  for (const linea of qp.split("\r\n")) {
    // Un "=" suelto al final (soft break) está bien; "=X" cortado no.
    assert(!/=[0-9A-F]?$/.test(linea.replace(/=$/, "")), `secuencia cortada: …${linea.slice(-6)}`);
  }
  assert(decodeQP(qp) === denso, "roundtrip denso falló");
});

Deno.test("el signo igual se encodea", () => {
  const qp = quotedPrintable("a=b");
  assert(qp === "a=3Db", `esperaba a=3Db, salió ${qp}`);
});

Deno.test("espacio al final de línea dura se encodea", () => {
  const qp = quotedPrintable("hola \nchau");
  assert(qp.startsWith("hola=20"), `espacio final sin encodear: ${qp.split("\r\n")[0]}`);
  assert(decodeQP(qp) === "hola \nchau", "roundtrip espacio final falló");
});

Deno.test("solo ASCII de 7 bits en la salida", () => {
  const qp = quotedPrintable("víñetas 🚀 y tildes áéíóú");
  for (let i = 0; i < qp.length; i++) {
    assert(qp.charCodeAt(i) <= 126, `byte no-ASCII en salida QP: ${qp[i]}`);
  }
});

/* ── esDireccionSmtp: el cortafuegos contra inyección de comandos ────────── */

Deno.test("acepta direcciones normales", () => {
  for (const ok of [
    "juan.perez@maven-ai.me",
    "a@b.co",
    "nombre+etiqueta@sub.dominio.com",
    "UPPER.Case@Example.COM",
  ]) {
    assert(esDireccionSmtp(ok), `debería aceptar ${ok}`);
  }
});

Deno.test("RECHAZA inyección de comandos SMTP por CRLF", () => {
  // El ataque real: cerrar el <> y colar otro comando en la sesión
  // autenticada — destinatario oculto, o un mensaje entero forjado.
  const ataques = [
    "a@b.com>\r\nRCPT TO:<oculto@evil.com",
    "a@b.com>\r\nDATA\r\nFrom: jefe@unlok.me\r\n\r\nforjado\r\n.\r\n",
    "a@b.com\nRCPT TO:<x@y.com",
    "a@b.com\rQUIT",
    "a@b.com>\tRCPT TO:<x@y.com",
  ];
  for (const mal of ataques) {
    assert(!esDireccionSmtp(mal), `debería RECHAZAR: ${JSON.stringify(mal)}`);
  }
});

Deno.test("rechaza basura que no es una dirección", () => {
  for (const mal of [
    "", "sin-arroba", "a@b", "a@@b.com", "a b@c.com", "<a@b.com>",
    'a@b.com"', "a@b.com;c@d.com", "a@b.com,c@d.com", "a\\@b.com",
    "x".repeat(250) + "@b.com",
  ]) {
    assert(!esDireccionSmtp(mal), `debería rechazar ${JSON.stringify(mal)}`);
  }
});

Deno.test("rechaza lo que no es string", () => {
  for (const mal of [null, undefined, 42, {}, ["a@b.com"], true]) {
    assert(!esDireccionSmtp(mal), `debería rechazar ${JSON.stringify(mal)}`);
  }
});

/* ── encodeHeader: RFC 2047 limita cada encoded-word a 75 chars ──────────── */

Deno.test("ASCII puro pasa sin codificar", () => {
  const v = "Re: reunion de manana";
  assert(encodeHeader(v) === v, `no debia tocarlo: ${encodeHeader(v)}`);
});

Deno.test("ningun encoded-word supera 75 caracteres", () => {
  const asuntos = [
    "Re: Seguimiento de la reunión de ayer con el equipo de closers y managers 🚀",
    "Resumen semanal de resultados de promoción — creadoras activas y pendientes de revisión",
    "🎉".repeat(40),
    "ñ".repeat(200),
  ];
  for (const a of asuntos) {
    for (const palabra of encodeHeader(a).split("\r\n ")) {
      assert(palabra.length <= 75, `encoded-word de ${palabra.length}: ${palabra.slice(0, 30)}…`);
    }
  }
});

Deno.test("no parte un caracter multibyte entre encoded-words", () => {
  // Si un emoji se corta, el decodificador muestra un rombo. Se decodifica
  // todo y se compara con el original.
  const original = "🚀🎯🔥 informe de agosto — creadoras ñandú 😀😁😂🤣🥳";
  const juntado = encodeHeader(original)
    .split("\r\n ")
    .map((w) => w.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, ""))
    .map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    .reduce<number[]>((acc, arr) => acc.concat([...arr]), []);
  const vuelta = new TextDecoder().decode(new Uint8Array(juntado));
  assert(vuelta === original, `roundtrip roto: ${vuelta}`);
});

/* ── Largo de línea y display-name: los casos que rompieron en la ronda 2 ── */

/** Todas las líneas del RFC822, para chequear el límite duro de 998. */
function lineas(rfc: string): string[] {
  return rfc.split("\r\n");
}

Deno.test("un asunto ASCII larguísimo no deja líneas de más de 998", () => {
  // El mismo asunto con una tilde SÍ se plegaba (iba por encoded-word): el
  // camino ASCII era el que quedaba suelto, y es el más común.
  const largo = "Seguimiento del pago de comisiones ".repeat(30);
  for (const asunto of [largo, largo + " revisión"]) {
    const rfc = buildMessage({
      from: "a@b.com", to: ["c@d.com"], subject: asunto, text: "hola",
    });
    for (const l of lineas(rfc)) {
      assert(l.length <= 998, `línea de ${l.length}: ${l.slice(0, 50)}…`);
    }
  }
});

Deno.test("30 destinatarios no rompen el límite de línea", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => `persona.numero${i}@marketingkash.com`);
  const rfc = buildMessage({
    from: "a@b.com", to: muchos, cc: muchos, subject: "hola", text: "hola",
  });
  for (const l of lineas(rfc)) {
    assert(l.length <= 998, `línea de ${l.length}`);
  }
  // Y el plegado tiene que ser válido: la continuación arranca con espacio.
  const idx = lineas(rfc).findIndex((l) => l.startsWith("To:"));
  assert(lineas(rfc)[idx + 1].startsWith(" "), "la continuación debe arrancar con WSP");
});

Deno.test("un nombre con barra invertida no rompe el From", () => {
  for (const nombre of ["Jhon Lopez\\", "C:\\Users\\jhon", 'Ana "la jefa"']) {
    const rfc = buildMessage({
      from: "jhon@unlok.me", fromName: nombre, to: ["x@y.com"], subject: "s", text: "t",
    });
    const from = lineas(rfc).find((l) => l.startsWith("From:"))!;
    // La dirección tiene que seguir siendo recuperable: <...> al final.
    assert(from.endsWith("<jhon@unlok.me>"), `From roto: ${from}`);
    // Y el quoted-string tiene que cerrar: cantidad PAR de comillas no escapadas.
    const sinEscapar = from.slice(0, from.lastIndexOf("<")).replace(/\\./g, "");
    const comillas = (sinEscapar.match(/"/g) ?? []).length;
    assert(comillas % 2 === 0, `quoted-string sin cerrar: ${from}`);
  }
});

Deno.test("el display-name con acentos no se parte a mitad de palabra", () => {
  const nombre = "Andrés Felipe Gutiérrez Montoya Coordinación Operaciones";
  const rfc = buildMessage({
    from: "a@b.com", fromName: nombre, to: ["x@y.com"], subject: "s", text: "t",
  });
  const from = lineas(rfc).filter((l) => l.startsWith("From:") || l.startsWith(" =?"));
  // Cada encoded-word decodifica a un trozo que NO corta palabras: el trozo
  // termina en espacio o es el último.
  const trozos = from
    .join("")
    .match(/=\?UTF-8\?B\?([^?]+)\?=/g)!
    .map((w) => w.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, ""))
    .map((b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  trozos.slice(0, -1).forEach((t, i) => {
    assert(t.endsWith(" "), `el trozo ${i} corta una palabra: …${t.slice(-12)}`);
  });
  assert(trozos.join("") === nombre, `roundtrip roto: ${trozos.join("")}`);
});
