// Tests de quotedPrintable: la parte del SMTP que más fácil se rompe en
// silencio. Un QP mal armado = correos truncados o con "=E2=80" visibles.
// Correr: deno test supabase/functions/_shared/smtp.test.ts

import {
  buildMessage, encodeHeader, esDireccionSmtp, quotedPrintable, timeoutDelPunto,
} from "./smtp.ts";

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

/* ── Adjuntos: multipart/mixed ───────────────────────────────────────────── */

Deno.test("sin adjuntos NO aparece multipart/mixed (nada cambió)", () => {
  const conHtml = buildMessage({ from: "a@b.com", to: ["c@d.com"], subject: "s", html: "<p>x</p>" });
  assert(!/multipart\/mixed/.test(conHtml), "no debería haber mixed");
  assert(/multipart\/alternative/.test(conHtml), "el HTML debería seguir yendo como alternative");
  const soloText = buildMessage({ from: "a@b.com", to: ["c@d.com"], subject: "s", text: "hola" });
  assert(!/multipart/.test(soloText), "un texto solo no lleva multipart");
});

Deno.test("con adjunto: multipart/mixed con el cuerpo Y el archivo en base64", () => {
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", html: "<p>hola</p>",
    attachments: [{ filename: "d.bin", contentType: "application/octet-stream", contentBase64: btoa("hola") }],
  });
  assert(/Content-Type: multipart\/mixed/.test(rfc), "no es multipart/mixed");
  assert(/Content-Type: multipart\/alternative/.test(rfc), "perdió el cuerpo alternative adentro");
  assert(/Content-Disposition: attachment; filename="d.bin"/.test(rfc), "sin Content-Disposition del adjunto");
  assert(/Content-Transfer-Encoding: base64/.test(rfc), "el adjunto no va en base64");
  for (const l of rfc.split("\r\n")) assert(l.length <= 998, `línea de ${l.length}`);
});

Deno.test("el base64 del adjunto se pliega a 76", () => {
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", text: "t",
    attachments: [{ filename: "g.bin", contentType: "application/octet-stream", contentBase64: btoa("A".repeat(1000)) }],
  });
  for (const l of rfc.split("\r\n")) {
    if (/^[A-Za-z0-9+/]+=*$/.test(l) && l.length > 20) {
      assert(l.length <= 76, `línea base64 de ${l.length}`);
    }
  }
});

Deno.test("roundtrip: los bytes del adjunto sobreviven al armado", () => {
  const original = new Uint8Array(300).map((_, i) => (i * 7) % 256);
  let bin = "";
  for (const x of original) bin += String.fromCharCode(x);
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", text: "t",
    attachments: [{ filename: "r.bin", contentType: "application/octet-stream", contentBase64: btoa(bin) }],
  });
  // El bloque base64 va tras la línea en blanco que sigue al Content-Disposition.
  const m = rfc.match(/Content-Disposition: attachment[^\r\n]*\r\n\r\n([\s\S]*?)\r\n--/);
  assert(m !== null, "no encontró el bloque del adjunto");
  const rec = atob(m![1].replace(/\r\n/g, ""));
  assert(rec.length === original.length, `largo distinto: ${rec.length}`);
  for (let i = 0; i < original.length; i++) {
    assert(rec.charCodeAt(i) === original[i], `byte ${i} distinto`);
  }
});

Deno.test("un filename con acentos usa RFC 2231 y el header queda en ASCII", () => {
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", text: "t",
    attachments: [{ filename: "árbol ñoño.pdf", contentType: "application/pdf", contentBase64: btoa("x") }],
  });
  assert(/filename\*=UTF-8''/.test(rfc), "no usó RFC 2231 para el nombre no-ASCII");
  const disp = rfc.split("\r\n").find((l) => l.startsWith("Content-Disposition:"))!;
  for (let i = 0; i < disp.length; i++) {
    assert(disp.charCodeAt(i) <= 126, `byte no-ASCII en el header: ${disp}`);
  }
});

Deno.test("un filename con comillas o CRLF NO inyecta encabezados", () => {
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", text: "t",
    attachments: [{
      filename: 'factura".pdf\r\nBcc: hacker@evil.com',
      contentType: "application/pdf",
      contentBase64: btoa("x"),
    }],
  });
  for (const l of rfc.split("\r\n")) {
    assert(!/^Bcc:/i.test(l), `encabezado inyectado desde el filename: ${l}`);
  }
});

Deno.test("un Content-Type malicioso cae al octet-stream (no inyecta)", () => {
  const rfc = buildMessage({
    from: "a@b.com", to: ["c@d.com"], subject: "s", text: "t",
    attachments: [{
      filename: "a.bin",
      contentType: "application/pdf\r\nBcc: x@y.com",
      contentBase64: btoa("x"),
    }],
  });
  for (const l of rfc.split("\r\n")) {
    assert(!/^Bcc:/i.test(l), `inyección por content-type: ${l}`);
  }
  assert(/Content-Type: application\/octet-stream/.test(rfc), "no cayó al tipo seguro");
});

// ---------------------------------------------------------------------------
// Plegado del base64 con adjuntos GRANDES (tope 20 MB desde 07/09/2026)
// ---------------------------------------------------------------------------

/** La implementación VIEJA, como referencia: el cambio a slice() es por
 *  memoria y CPU, y no puede alterar ni un byte de la salida. */
function plegarViejo(b64: string): string {
  return (b64.replace(/\s+/g, "").match(/.{1,76}/g) ?? []).join("\r\n");
}

function plegarNuevo(b64: string): string {
  const limpio = b64.replace(/\s+/g, "");
  const lineas: string[] = [];
  for (let i = 0; i < limpio.length; i += 76) lineas.push(limpio.slice(i, i + 76));
  return lineas.join("\r\n");
}

Deno.test("el plegado nuevo da EXACTAMENTE lo mismo que el viejo", () => {
  // Bordes: vacío, más corto que una línea, justo 76, 76+1, y varias líneas.
  const casos = [0, 1, 75, 76, 77, 152, 153, 1000, 4096];
  for (const n of casos) {
    const b64 = "QUJDRA".repeat(Math.ceil(n / 6)).slice(0, n);
    assert(
      plegarNuevo(b64) === plegarViejo(b64),
      `difieren con largo ${n}`,
    );
  }
  // Y con basura de espacios en el medio, que es lo que limpia el replace.
  const sucio = "AAAA\r\nBBBB\t CCCC\n".repeat(50);
  assert(plegarNuevo(sucio) === plegarViejo(sucio), "difieren con espacios");
});

Deno.test("un adjunto de 20 MB se pliega entero, rápido y sin líneas largas", () => {
  // 20 MB de archivo = el tope. En base64 son ~26,7 MB y ~350k líneas: acá es
  // donde el .match() viejo materializaba cada línea y se comía la memoria.
  const bytesArchivo = 20 * 1024 * 1024;
  const b64 = "QUJDRA".repeat(Math.ceil((bytesArchivo * 4 / 3) / 6));

  const t0 = Date.now();
  const plegado = plegarNuevo(b64);
  const ms = Date.now() - t0;

  const lineas = plegado.split("\r\n");
  assert(lineas.length > 300_000, `esperaba ~350k líneas, hubo ${lineas.length}`);
  for (const l of lineas) {
    if (l.length > 76) throw new Error(`línea de ${l.length}`);
  }
  // Nada se pierde por el camino.
  assert(
    plegado.replace(/\r\n/g, "").length === b64.length,
    "se perdieron caracteres al plegar",
  );
  // La edge tiene 2 s de CPU POR PEDIDO, y plegar es solo un paso de varios.
  assert(ms < 1_500, `plegar tardó ${ms} ms, demasiado del presupuesto de CPU`);
});

// ── El timeout del punto final ─────────────────────────────────────────────
// Ver el comentario de `timeoutDelPunto`. El 17/09/2026 un correo de 13 PDF
// (~25 MB en base64) se envió DOS VECES porque esperábamos la confirmación
// con el timeout de un comando común.

Deno.test("timeoutDelPunto: un correo sin adjuntos no espera de más", () => {
  const t = timeoutDelPunto(40 * 1024); // 40 KB de texto
  assert(t >= 30_000, `piso demasiado bajo: ${t}`);
  assert(t <= 40_000, `esperar ${t / 1000}s por un correo de texto es absurdo`);
});

Deno.test("timeoutDelPunto: el correo que falló en prod entra cómodo", () => {
  // 18,5 MB crudos → ~25 MB en base64, que es lo que viajó de verdad.
  const t = timeoutDelPunto(25 * 1024 * 1024);
  assert(t > 20_000, `${t / 1000}s NO mejora los 20s que rompieron en prod`);
  assert(t >= 150_000, `${t / 1000}s es poco para que Zoho ingiera 25 MB`);
});

Deno.test("timeoutDelPunto: crece con el tamaño", () => {
  const chico = timeoutDelPunto(100 * 1024);
  const medio = timeoutDelPunto(5 * 1024 * 1024);
  const grande = timeoutDelPunto(25 * 1024 * 1024);
  assert(chico < medio && medio < grande, `no es monótono: ${chico} ${medio} ${grande}`);
});

Deno.test("timeoutDelPunto: tiene techo, no espera para siempre", () => {
  // Un adjunto gigante no puede colgar la edge function hasta que la maten.
  assert(timeoutDelPunto(500 * 1024 * 1024) <= 180_000, "sin techo");
});

// ── Imágenes pegadas en el cuerpo ──────────────────────────────────────────
// Una captura pegada tiene que viajar como parte MIME con Content-ID adentro
// de un multipart/related JUNTO al HTML que la nombra. Mandarla como adjunto
// común hace que el correo llegue con un hueco donde estaba la imagen.

const PNG1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const base = {
  from: "jhon@maven-ai.me", to: ["ana@maven-ai.me"], subject: "Hola",
};

Deno.test("una imagen pegada va en multipart/related con su Content-ID", () => {
  const rfc = buildMessage({
    ...base,
    html: '<p>mirá esto <img src="cid:img1@maven-ai.me"></p>',
    attachments: [{
      filename: "imagen-1.png", contentType: "image/png",
      contentBase64: PNG1x1, contentId: "img1@maven-ai.me",
    }],
  });
  assert(rfc.includes("multipart/related"), "falta el multipart/related");
  assert(rfc.includes("Content-ID: <img1@maven-ai.me>"), "falta el Content-ID");
  assert(rfc.includes("Content-Disposition: inline"), "la imagen no va inline");
  assert(!/Content-Disposition: attachment/.test(rfc), "la imagen NO es un adjunto");
});

Deno.test("⚠️ el related va ADENTRO del mixed, no al revés", () => {
  // Al revés, los clientes no resuelven el cid: la imagen no queda en el mismo
  // subárbol que el HTML que la nombra.
  const rfc = buildMessage({
    ...base,
    html: '<p><img src="cid:img1@maven-ai.me"></p>',
    attachments: [
      { filename: "imagen-1.png", contentType: "image/png", contentBase64: PNG1x1, contentId: "img1@maven-ai.me" },
      { filename: "contrato.pdf", contentType: "application/pdf", contentBase64: PNG1x1 },
    ],
  });
  const mixed = rfc.indexOf("multipart/mixed");
  const related = rfc.indexOf("multipart/related");
  assert(mixed > -1 && related > -1, "faltan los dos niveles");
  assert(mixed < related, "el mixed tiene que estar AFUERA del related");
});

Deno.test("un archivo adjunto de verdad sigue yendo como attachment", () => {
  const rfc = buildMessage({
    ...base,
    html: "<p>hola</p>",
    attachments: [{ filename: "contrato.pdf", contentType: "application/pdf", contentBase64: PNG1x1 }],
  });
  assert(rfc.includes("Content-Disposition: attachment"), "no va como adjunto");
  assert(!rfc.includes("multipart/related"), "sin imágenes no hace falta related");
  assert(!rfc.includes("Content-ID:"), "un adjunto común no lleva Content-ID");
});

Deno.test("sin adjuntos ni imágenes el mensaje queda como siempre", () => {
  const rfc = buildMessage({ ...base, html: "<p>hola</p>" });
  assert(!rfc.includes("multipart/related"), "no debería haber related");
  assert(!rfc.includes("multipart/mixed"), "no debería haber mixed");
});

Deno.test("solo imágenes pegadas: related SIN mixed alrededor", () => {
  // Envolver en un mixed que contiene una sola parte es basura que algunos
  // clientes dibujan como "1 adjunto" cuando no hay ninguno.
  const rfc = buildMessage({
    ...base,
    html: '<p><img src="cid:img1@maven-ai.me"></p>',
    attachments: [{ filename: "i.png", contentType: "image/png", contentBase64: PNG1x1, contentId: "img1@maven-ai.me" }],
  });
  assert(rfc.includes("multipart/related"), "falta el related");
  assert(!rfc.includes("multipart/mixed"), "no hace falta el mixed");
});

Deno.test("⚠️ un Content-ID no puede inyectar cabeceras", () => {
  const rfc = buildMessage({
    ...base,
    html: "<p>x</p>",
    attachments: [{
      filename: "i.png", contentType: "image/png", contentBase64: PNG1x1,
      contentId: "malo@x>\r\nBcc: victima@otra.com",
    }],
  });
  assert(!/^Bcc:/m.test(rfc), "se coló un Bcc por el Content-ID");
});
