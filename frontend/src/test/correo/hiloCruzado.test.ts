import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { armarHiloCruzado } from "@/lib/mailHiloCruzado";
import type { MailSummary } from "@/hooks/useMailbox";

// Jhon puso Maven al lado de Gmail: «mandé mi respuesta pero no queda como en
// Google, que queda de inmediato». En Gmail el hilo tiene los cuatro mensajes
// —los que llegaron Y los que mandó él—; en Maven tenía dos, porque la lista
// consulta UNA carpeta y las respuestas propias viven en Enviados.

const m = (o: Partial<MailSummary> & { id: string; folder: string }): MailSummary => ({
  from: "ana@maven-ai.me", to: "bruno@maven-ai.me", subject: "Contrato",
  date: "2026-09-18T10:00:00Z", unread: false, origen: "cache",
  inReplyTo: undefined, refs: undefined, ...o,
});

describe("armarHiloCruzado", () => {
  it("mete la respuesta de ENVIADOS en el hilo de Recibidos", () => {
    const recibido = m({ id: "1", folder: "INBOX", messageId: "<1@z>" });
    const miRespuesta = m({
      id: "2", folder: "Enviado", messageId: "<2@z>", inReplyTo: "<1@z>",
      subject: "Re: Contrato", from: "bruno@maven-ai.me", to: "ana@maven-ai.me",
      date: "2026-09-18T11:00:00Z",
    });
    const r = armarHiloCruzado([recibido], [recibido, miRespuesta]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.folder)).toEqual(["INBOX", "Enviado"]);
  });

  it("⚠️ y la de Enviados guarda SU carpeta, o abrirla la busca donde no está", () => {
    const recibido = m({ id: "1", folder: "INBOX", messageId: "<1@z>" });
    const enviado = m({ id: "2", folder: "Enviado", messageId: "<2@z>", inReplyTo: "<1@z>" });
    const r = armarHiloCruzado([recibido], [enviado]);
    expect(r.find((x) => x.messageId === "<2@z>")?.folder).toBe("Enviado");
  });

  it("⚠️ escribirse a uno mismo NO muestra el mensaje dos veces", () => {
    // Con copia a uno mismo, el MISMO mensaje queda en Recibidos y en
    // Enviados. Mostrar las dos filas se lee como si lo hubieras mandado dos
    // veces.
    const enInbox = m({ id: "a", folder: "INBOX", messageId: "<1@z>" });
    const enEnviado = m({ id: "b", folder: "Enviado", messageId: "<1@z>" });
    const r = armarHiloCruzado([enInbox], [enInbox, enEnviado]);
    expect(r).toHaveLength(1);
    // Se prefiere la de Recibidos, que es la que uno espera abrir.
    expect(r[0].folder).toBe("INBOX");
  });

  it("la misma fila traída dos veces por dos consultas cuenta una", () => {
    const a = m({ id: "1", folder: "INBOX", messageId: "<1@z>" });
    expect(armarHiloCruzado([a], [a, a, a])).toHaveLength(1);
  });

  it("⚠️ lo que el motor NO puso en el hilo se queda afuera", () => {
    // La consulta trae de más a propósito (mismo asunto, 30 días). Quién entra
    // lo decide `agruparEnHilos`. Meter de más adentro de un hilo esconde un
    // correo dentro de otro, que se parece demasiado a perderlo.
    const mio = m({ id: "1", folder: "INBOX", messageId: "<1@z>" });
    const ajeno = m({
      id: "9", folder: "INBOX", messageId: "<9@z>",
      from: "otro@ajena.com", to: "tercero@ajena.com",
    });
    const r = armarHiloCruzado([mio], [mio, ajeno]);
    expect(r.map((x) => x.messageId)).toEqual(["<1@z>"]);
  });

  it("sin nada conocido no inventa un hilo", () => {
    expect(armarHiloCruzado([], [m({ id: "1", folder: "INBOX" })])).toEqual([]);
  });

  it("si no llegó nada, queda lo que ya se tenía", () => {
    const a = m({ id: "1", folder: "INBOX", messageId: "<1@z>" });
    expect(armarHiloCruzado([a], [])).toEqual([a]);
  });
});

// ── El cable ───────────────────────────────────────────────────────────────
const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const hook = leer("frontend/src/hooks/useHiloCompleto.ts");

describe("⚠️ la consulta del hilo cruza carpetas", () => {
  it("NO filtra por la carpeta a la vista", () => {
    // Es el bug entero: filtrando por carpeta, el hilo solo puede mostrar la
    // mitad de la charla — y encima la mitad en la que uno no habla.
    expect(hook).not.toMatch(/\.eq\(\s*["']folder["']/);
  });

  it("deja Papelera y Spam afuera", () => {
    // Un correo que mandaste a la papelera no tiene por qué reaparecer dentro
    // de la conversación, ni el spam colarse en un hilo legítimo.
    for (const f of ["Papelera", "Trash", "Spam", "Junk"]) {
      expect(hook, `falta ${f}`).toMatch(new RegExp(`"${f}"`));
    }
    expect(hook).toMatch(/\.not\(\s*["']folder["']\s*,\s*["']in["']/);
  });

  it("busca por cabeceras Y por asunto", () => {
    // Por cabeceras es exacto; por asunto hace falta porque las columnas de
    // cabeceras existen recién desde el 18/09/2026 y todo el correo anterior
    // está sin ellas.
    expect(hook).toMatch(/\.in\(\s*["']message_id["']/);
    expect(hook).toMatch(/\.in\(\s*["']in_reply_to["']/);
    expect(hook).toMatch(/\.overlaps\(\s*["']refs["']/);
    expect(hook).toMatch(/\.ilike\(\s*["']subject["']/);
  });

  it("⚠️ la búsqueda por asunto va ACOTADA en el tiempo y en filas", () => {
    // Sin ventana, un «Reporte semanal» arrastraría años de correo. La base ya
    // tocó techo una vez este mes.
    expect(hook).toMatch(/\.gte\(\s*["']date["']/);
    expect(hook).toMatch(/\.limit\(/);
  });

  it("⚠️ escapa los comodines de LIKE del asunto", () => {
    // Un asunto con `%` buscaría de más; con `_`, cualquier carácter.
    expect(hook).toMatch(/escaparLike/);
  });
});
