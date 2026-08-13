// Quick commands: los regex que pueden SECUESTRAR una invocación normal del agente.
// Positivos = comandos reales que deben funcionar; negativos = los mensajes reales
// que dispararon comandos sin serlo (con fecha del incidente).
// Correr: deno test supabase/functions/_shared/whatsapp-quick-commands.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectQuickCommand } from "./whatsapp.ts";

Deno.test("13/08 09:49 — el plan de Brayan con 'cierre a demo' NO es un pedido de EOD", () => {
  // El mensaje real (recortado) que disparó quick_command_eod: el bot respondió
  // "no es hora de cierre de jornada" frente a un plan de agencias.
  const plan =
    "@140716701401153 plan del bloque de agencias para hoy: disparo las 6 que confirmaste libres — " +
    "OFM Models, Dedalo, Estelar, Agence Pink, Cabaret y Adastra. Todas desde la cuenta de partnerships, " +
    "espaciadas, con el mensaje del marketplace de unlimited.partners (0% comisión, pago día 1) y " +
    "cierre a demo de 15 min. Entregable: las 6 enviadas + conteo del embudo, con evidencia al corte de las 2h.";
  assertEquals(detectQuickCommand(plan), null);
});

Deno.test("los comandos EOD reales siguen funcionando", () => {
  assertEquals(detectQuickCommand("@140716701401153 cierre del día"), "eod");
  assertEquals(detectQuickCommand("maven, dame el cierre de jornada porfa"), "eod");
  assertEquals(detectQuickCommand("cierre del turno"), "eod");
  assertEquals(detectQuickCommand("resumen del día"), "eod");
  assertEquals(detectQuickCommand("cómo va el equipo?"), "eod");
  assertEquals(detectQuickCommand("EOD"), "eod");
});

Deno.test("'cierre' de negocio no dispara aunque el mensaje sea corto", () => {
  assertEquals(detectQuickCommand("buen cierre con la agencia 💪"), null);
  assertEquals(detectQuickCommand("cierre a demo de 15 min"), null);
  assertEquals(detectQuickCommand("el cierre de ventas quedó para mañana"), null);
});

Deno.test("un comando tiene que parecer un comando: >80 chars = conversación", () => {
  // Aunque contenga la frase exacta, un mensaje largo no es un comando — es
  // alguien contando algo. Esto cubre también a audit/sincroniza/presentate.
  const largo =
    "hoy estuve viendo el cierre del día de ayer con Carolina y quedamos en que la auditoría " +
    "de las cuentas la hacemos el viernes cuando sincroniza el historial completo del mes";
  assertEquals(detectQuickCommand(largo), null);
  // La @mención cruda no cuenta para el largo: comando corto + mención sigue pasando.
  assertEquals(detectQuickCommand("@140716701401153 audita el grupo"), "audit");
});

Deno.test("presentate y help intactos", () => {
  assertEquals(detectQuickCommand("@140716701401153 preséntate"), "presentate");
  assertEquals(detectQuickCommand("maven ayuda"), "help");
  assertEquals(detectQuickCommand("qué comandos tenés?"), "help");
});
