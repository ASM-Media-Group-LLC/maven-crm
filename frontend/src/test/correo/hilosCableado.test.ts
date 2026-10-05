import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ⚠️ EL MOTOR DE HILOS ANDABA; LO QUE ESTABA CORTADO ERA EL CABLE.
//
// `mailHilos.ts` tenía 23 tests en verde y la bandeja seguía mostrando la
// respuesta como un correo aparte. El motivo: `MailSummary` trae el campo
// `refs` y la forma que pedía el motor lo llamaba `references`, las dos
// opcionales. Un objeto con `refs` encaja perfecto en una forma que pide
// `references?`, así que TypeScript no dijo nada y el encadenado por
// cabeceras quedó muerto — con todos sus tests pasando.
//
// Los tests de acá no prueban el motor: prueban que lo que llega al motor
// tenga con qué trabajar. Son lo único que hubiera encontrado ese silencio.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const pagina = leer("frontend/src/pages/correo/CorreoPage.tsx");
const buzon = leer("frontend/src/hooks/useMailbox.ts");
const etiquetas = leer("frontend/src/hooks/useEtiquetasCorreo.ts");
const motor = leer("frontend/src/lib/mailHilos.ts");

/** El bloque de una interfaz SIN sus comentarios.
 *
 *  ⚠️ Sin quitarlos, un «no debe decir X» se dispara con el comentario que
 *  explica por qué NO se llama X. Ya me pasó tres veces en este repo: la
 *  prueba falla por su propia explicación. */
const camposDe = (fuente: string, nombre: string): string => {
  const i = fuente.indexOf(`export interface ${nombre}`);
  expect(i, `no está ${nombre}`).toBeGreaterThan(-1);
  return fuente
    .slice(i, fuente.indexOf("\n}", i))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
};

describe("⚠️ las cabeceras del hilo se piden a la base", () => {
  it("la lista de una carpeta trae in_reply_to y refs", () => {
    // Sin estas dos columnas en el select, la bandeja agrupa solo por asunto:
    // una respuesta con el asunto cambiado deja de juntarse con su original y
    // nadie se entera, porque nada falla.
    expect(buzon).toMatch(/in_reply_to,\s*refs/);
  });

  it("la vista por ETIQUETA también las trae", () => {
    // Es donde más se nota: una etiqueta junta correos de Recibidos, Enviados
    // y Archivados, o sea conversaciones partidas entre carpetas.
    const i = etiquetas.indexOf("export function useCorreosDeEtiqueta");
    expect(i, "no está la consulta de la etiqueta").toBeGreaterThan(-1);
    const fn = etiquetas.slice(i, i + 1500);
    expect(fn).toMatch(/in_reply_to,\s*refs/);
  });

  it("el mapeo de la etiqueta las pasa al objeto del correo", () => {
    // Traerlas de la base y después no copiarlas al objeto es el mismo
    // agujero, una capa más arriba.
    expect(pagina).toMatch(/inReplyTo:\s*\(m\.in_reply_to/);
    expect(pagina).toMatch(/refs:\s*\(m\.refs/);
  });
});

describe("⚠️ lo que SALE también encadena", () => {
  it("la respuesta manda la cadena entera de References, no solo el padre", () => {
    // Con solo el padre, quien recibe encadena ESTA respuesta pero se queda
    // sin el resto del hilo si le falta un eslabón del medio, y una
    // conversación larga se le parte en trozos. Gmail y Outlook mandan la
    // cadena completa (RFC 5322 §3.6.4).
    //
    // Desde el ⋮ de cada mensaje (02/10) la respuesta se arma en
    // lib/correo/accionesDelMensaje.ts, con la cadena del mensaje ELEGIDO (que
    // no siempre es el abierto). El comportamiento está probado en
    // test/correo/menuDelMensaje.test.tsx; acá, que la pantalla lo use.
    const acciones = leer("frontend/src/lib/correo/accionesDelMensaje.ts");
    const i = acciones.indexOf("export function borradorDeRespuesta");
    expect(i, "no está el armado de la respuesta").toBeGreaterThan(-1);
    const fn = acciones.slice(i, i + 2500);
    expect(fn).toMatch(/references:\s*\[\.\.\.\(resumen\.refs \?\? \[\]\), messageId\]/);
    expect(pagina).toMatch(/borradorDeRespuesta\(\{\s*resumen: m,/);
  });

  it("la copia sembrada en Enviados guarda in_reply_to y refs", () => {
    // Sembrar la fila sin las cabeceras deja el correo que acabás de mandar
    // suelto al lado de su propia conversación, hasta media hora.
    const edge = leer("supabase/functions/mail-fetch/index.ts");
    const i = edge.indexOf('await admin.from("mail_messages").upsert({');
    expect(i, "no está la siembra de Enviados").toBeGreaterThan(-1);
    const bloque = edge.slice(i, i + 3000).replace(/\/\/.*$/gm, "");
    expect(bloque).toMatch(/in_reply_to:/);
    expect(bloque).toMatch(/refs:/);
  });
});

describe("⚠️ el nombre del campo es UNO SOLO en todo el camino", () => {
  it("el motor pide `refs`, igual que MailSummary — nunca `references`", () => {
    // Si alguien vuelve a llamarlo `references` acá, el objeto de la bandeja
    // sigue encajando y el encadenado se apaga en silencio.
    const forma = camposDe(motor, "CorreoEncadenable");
    expect(forma).toMatch(/\brefs\b/);
    expect(forma).not.toMatch(/\breferences\b/);
  });

  it("⚠️ y son OBLIGATORIAS, para que olvidarlas no compile", () => {
    // Opcionales, un camino que no las trajera compilaba igual. Obligatorias
    // —aunque el valor pueda ser undefined— quien arme un correo tiene que
    // decidir qué pone.
    for (const forma of [camposDe(motor, "CorreoEncadenable"), camposDe(buzon, "MailSummary")]) {
      expect(forma).toMatch(/inReplyTo\s*:/);
      expect(forma).toMatch(/refs\s*:/);
      expect(forma).not.toMatch(/inReplyTo\s*\?/);
      expect(forma).not.toMatch(/refs\s*\?/);
    }
  });
});
