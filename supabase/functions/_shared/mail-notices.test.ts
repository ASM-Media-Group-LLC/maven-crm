// Tests del filtro de avisos del proveedor.
//
// El caso que MÁS importa acá no es que oculte los de bienvenida —eso es
// una línea— sino que NO oculte un rebote. Si alguien manda un correo a una
// dirección mal escrita y le tapamos el "no se pudo entregar", esa persona
// va a creer que su correo llegó. Es peor que el problema que el filtro
// resuelve, y no se nota hasta que ya causó daño.

import { assert, assertEquals } from "jsr:@std/assert";
import {
  direccionDe,
  esAvisoDelProveedor,
  ocultarAvisosDelProveedor,
} from "./mail-notices.ts";

Deno.test("extrae la dirección de un From con nombre", () => {
  assertEquals(direccionDe("Zoho Mail <welcome@zoho.com>"), "welcome@zoho.com");
  assertEquals(direccionDe("welcome@zoho.com"), "welcome@zoho.com");
  assertEquals(direccionDe("  WELCOME@ZOHO.COM  "), "welcome@zoho.com");
});

Deno.test("oculta los correos de bienvenida del proveedor", () => {
  assert(esAvisoDelProveedor("Zoho Mail <welcome@zoho.com>"));
  assert(esAvisoDelProveedor("<noreply@zoho.com>"));
});

// --- Lo que NO se puede ocultar nunca ------------------------------------

Deno.test("NO oculta rebotes: la persona tiene que enterarse", () => {
  for (
    const rebote of [
      "Mail Delivery Subsystem <mailer-daemon@zoho.com>",
      "postmaster@zoho.com",
      "MAILER-DAEMON@zohomail.com",
    ]
  ) {
    assert(
      !esAvisoDelProveedor(rebote),
      `${rebote} es un rebote y ocultarlo haría creer que el correo llegó`,
    );
  }
});

Deno.test("NO oculta a una persona que escribe desde el dominio", () => {
  assert(!esAvisoDelProveedor("Ana Torres <ana.torres@zoho.com>"));
});

Deno.test("NO oculta un remitente que solo se PARECE", () => {
  // Un dominio de atacante que termina igual no puede colarse en la lista.
  assert(!esAvisoDelProveedor("welcome@zoho.com.evil.net"));
  assert(!esAvisoDelProveedor("welcome@notzoho.com"));
});

// --- La lista completa ----------------------------------------------------

Deno.test("filtra la lista y deja el resto intacto", () => {
  const mensajes = [
    { seq: 1, from: "Zoho Mail <welcome@zoho.com>" },
    { seq: 2, from: "Cliente <cliente@empresa.com>" },
    { seq: 3, from: "welcome@zohomail.com" },
    { seq: 4, from: "Mail Delivery Subsystem <mailer-daemon@zoho.com>" },
  ];
  const visibles = ocultarAvisosDelProveedor(mensajes);
  assertEquals(visibles.map((m) => m.seq), [2, 4]);
});

Deno.test("una bandeja sin avisos no se toca", () => {
  const mensajes = [{ from: "a@b.com" }, { from: "c@d.com" }];
  assertEquals(ocultarAvisosDelProveedor(mensajes).length, 2);
});

Deno.test("un From vacío no rompe ni desaparece", () => {
  assertEquals(ocultarAvisosDelProveedor([{ from: "" }]).length, 1);
});
