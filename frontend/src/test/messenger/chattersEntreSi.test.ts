import { describe, expect, it } from "vitest";
import { esContactoNoPermitido, idsContactables, sinRestringidos } from "@/lib/contactoRestringido";

// Guarda (Alvaro, 18/11/2026): los mensajes siguen como hace 7 días (el chat
// directo entre chatters se abre y avisa el primer contacto); las llamadas no:
// «un chatter solo puede llamar a su supervisor, punto». La pared es la base
// (20261118231000_contacto_entre_chatters).
const leer = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const invitar = leer(import.meta.glob("../../lib/llamadaInvitar.ts", { query: "?raw", import: "default", eager: true }));
const agregar = leer(import.meta.glob("../../pages/messenger/videocall/AgregarALaLlamada.tsx", { query: "?raw", import: "default", eager: true }));
const nuevoChat = leer(import.meta.glob("../../pages/messenger/NewChatModal.tsx", { query: "?raw", import: "default", eager: true }));
const cabecera = leer(import.meta.glob("../../pages/messenger/components/ChatHeader.tsx", { query: "?raw", import: "default", eager: true }));
const migracion = leer(import.meta.glob("../../../../supabase/migrations/20261118231000_contacto_entre_chatters.sql", { query: "?raw", import: "default", eager: true }));

describe("chatters entre sí", () => {
  const restringidos = new Set(["ch2", "ch3"]);

  it("quita a los restringidos de la lista", () => {
    expect(idsContactables(["sup", "ch2", "ed", "ch3"], restringidos)).toEqual(["sup", "ed"]);
    const personas = [{ id: "sup" }, { id: "ch2" }];
    expect(sinRestringidos(personas, restringidos, (p) => p.id)).toEqual([{ id: "sup" }]);
  });

  it("quien ya está en la llamada (el 1 a 1 de siempre) se sigue viendo", () => {
    const personas = [{ id: "ch2" }, { id: "ch3" }];
    expect(sinRestringidos(personas, restringidos, (p) => p.id, (id) => id === "ch2")).toEqual([{ id: "ch2" }]);
  });

  it("sin restringidos (o si la consulta falló) no se esconde a nadie", () => {
    expect(idsContactables(["a", "b"], new Set())).toEqual(["a", "b"]);
  });

  it("reconoce el rechazo de la base", () => {
    expect(esContactoNoPermitido({ message: "contacto_no_permitido: no puedes sumar…" })).toBe(true);
    expect(esContactoNoPermitido(new Error("otra cosa"))).toBe(false);
    expect(esContactoNoPermitido(null)).toBe(false);
  });

  it("filtran: Agregar a la llamada y el timbre de grupo", () => {
    expect(invitar).toContain("restringidosOVacio(uid)");
    expect(invitar).toContain("idsContactables(");
    expect(agregar).toContain("useContactosRestringidos()");
    expect(agregar).toContain("sinRestringidos(resultados, restringidos");
  });

  it("el nuevo chat no se toca; la cabecera esconde llamar a quien no se puede", () => {
    expect(nuevoChat).not.toContain("useContactosRestringidos");
    expect(cabecera).toContain("useContactosRestringidos()");
    expect(cabecera).toContain("{puedeLlamar && (");
    expect(cabecera).toContain('onStartVideoCall(conversation, "audio")');
  });

  it("la base frena la llamada 1 a 1 de un chatter a quien no es de mando; el directo no", () => {
    expect(migracion).toMatch(/create trigger calls_contacto before insert on public\.calls/);
    expect(migracion).toMatch(/create or replace function public\.llamada_permitida/);
    expect(migracion).toMatch(/after insert on public\.chat_participants for each row execute function public\.chat_participants_primer_contacto/);
    expect(migracion).toMatch(/before insert or update of status on public\.call_participants/);
  });
});
