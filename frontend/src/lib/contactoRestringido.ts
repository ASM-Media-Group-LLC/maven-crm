// LOS CHATTERS ENTRE SÍ (Alvaro, 18/11/2026).
//
// Todo sigue como hace 7 días (chat directo y llamada 1 a 1 entre chatters se
// pueden). Solo lo NUEVO se restringe: un chatter no SUMA a otro chatter a una
// llamada, y cuando un chatter llama a su grupo, a los otros chatters no les
// suena. La pared es la base (call_participants_contacto en
// 20261118231000_contacto_entre_chatters.sql); la app solo esconde a esas
// personas en «Agregar a la llamada» y no las hace sonar.
//
// Qué roles se aíslan lo decide cada agencia (contacto_roles_aislados); la app
// no sabe de «Chatter»: pregunta a contactos_restringidos() a quiénes no puede
// sumar a una llamada quien está conectado.
//
// Si la consulta falla NO se esconde a nadie: es solo un filtro, y la base igual
// frena (con un aviso claro, ver esContactoNoPermitido).
import { supabase } from "@/integrations/supabase/client";

/** Cuánto vale la lista guardada antes de volver a pedirla. */
export const VIGENCIA_MS = 5 * 60_000;

/** El error que devuelve la base cuando se intenta sumar a alguien no permitido. */
export const esContactoNoPermitido = (e: unknown): boolean => {
  const m = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.includes("contacto_no_permitido");
};

/** Quita a los restringidos de una lista (personas, ids, lo que sea), salvo a
 *  los que `siempre` deja (p. ej. quien ya está en la llamada). */
export function sinRestringidos<T>(
  lista: T[],
  restringidos: ReadonlySet<string>,
  idDe: (x: T) => string,
  siempre: (id: string) => boolean = () => false,
): T[] {
  if (!restringidos.size) return lista;
  return lista.filter((x) => {
    const id = idDe(x);
    return !restringidos.has(id) || siempre(id);
  });
}

/** Los ids que se pueden hacer sonar (sin restringidos). */
export const idsContactables = (ids: string[], restringidos: ReadonlySet<string>): string[] =>
  sinRestringidos(ids, restringidos, (x) => x);

// ── La lista, guardada un rato ───────────────────────────────────────────────
let guardada: { uid: string; cuando: number; ids: Set<string> } | null = null;
let enCurso: { uid: string; promesa: Promise<Set<string>> } | null = null;

/** A quiénes NO puede sumar `uid` a una llamada. Si falla, lanza (quien llama decide). */
export async function cargarRestringidos(uid: string): Promise<Set<string>> {
  if (guardada && guardada.uid === uid && Date.now() - guardada.cuando < VIGENCIA_MS) return guardada.ids;
  if (enCurso && enCurso.uid === uid) return enCurso.promesa;
  const promesa = (async () => {
    // La función es nueva: todavía no está en los tipos generados.
    const db = supabase as unknown as {
      rpc(fn: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await db.rpc("contactos_restringidos");
    if (error) throw new Error(error.message);
    const ids = new Set(((data ?? []) as unknown[]).map((x) => String(x)));
    guardada = { uid, cuando: Date.now(), ids };
    return ids;
  })();
  enCurso = { uid, promesa };
  try {
    return await promesa;
  } finally {
    if (enCurso?.promesa === promesa) enCurso = null;
  }
}

/** Igual que cargarRestringidos, pero si falla devuelve vacío (y lo dice en la
 *  consola): la base frena igual. */
export async function restringidosOVacio(uid: string): Promise<Set<string>> {
  try {
    return await cargarRestringidos(uid);
  } catch (e) {
    console.warn("[contacto] no pude leer contactos_restringidos; la base frena igual:", e);
    return new Set();
  }
}
