import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reescribirUiPrefs } from "@/hooks/useLanguage";

// LA BARRA DE REACCIONES APRENDE, COMO LA DE WHATSAPP (pedido de Jhon).
//
// Al pasar sobre un mensaje salen ocho emojis y un «+» que abre el selector
// completo. Con lo que la persona reacciona (desde la barra o desde el «+») pasa
// a encabezar la barra: siempre son ocho, primero lo último que usó y lo que
// falta lo completan los de siempre. El mismo historial, más largo, es el «Uso
// frecuente» del selector.
//
// Se guarda por persona y la sigue de un dispositivo a otro, con el mismo patrón
// que el idioma (hooks/useLanguage.tsx):
//   - localStorage: manda en el primer render, sin esperar a la red.
//   - profiles.ui_prefs.reaccionesRecientes: se lee una vez por pestaña y, si
//     difiere, gana (es lo último que usó en CUALQUIER dispositivo). Se escribe
//     con reescribirUiPrefs, que no pisa la apariencia ni el idioma.

/** Los ocho de siempre (los que tenía la barra fija). */
export const REACCIONES_POR_DEFECTO = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"] as const;
/** Cuántos emojis tiene la barra. */
export const EMOJIS_EN_LA_BARRA = REACCIONES_POR_DEFECTO.length;
/** Cuántas reacciones recientes se guardan (las del «Uso frecuente»: tres filas). */
export const MAX_RECIENTES = 24;

const CLAVE_EN_EL_PERFIL = "reaccionesRecientes";

/* ------------------------------------------------------------------ */
/* Las cuentas, sin estado: lo que prueban los tests                   */
/* ------------------------------------------------------------------ */

/** Después de reaccionar con `emoji`: queda primero y sin repetirse. */
export function registrarReaccion(recientes: readonly string[], emoji: string): string[] {
  return [emoji, ...recientes.filter((e) => e !== emoji)].slice(0, MAX_RECIENTES);
}

/** Los recientes primero y, detrás, los de siempre que no estén ya; hasta `tope`. */
function conLosDeSiempre(recientes: readonly string[], tope: number): string[] {
  const salida: string[] = [];
  for (const e of [...recientes, ...REACCIONES_POR_DEFECTO]) {
    if (salida.length >= tope) break;
    if (!salida.includes(e)) salida.push(e);
  }
  return salida;
}

/** La barra: siempre ocho, lo último usado primero, el resto los de siempre. */
export const barraDeReacciones = (recientes: readonly string[]): string[] =>
  conLosDeSiempre(recientes, EMOJIS_EN_LA_BARRA);

/** El «Uso frecuente» del selector: el historial entero y, si es corto, los de siempre. */
export const frecuentesDeReacciones = (recientes: readonly string[]): string[] =>
  conLosDeSiempre(recientes, MAX_RECIENTES);

/** Lo guardado (en localStorage o en el perfil) como lista válida, o null. */
export function recientesValidos(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 32)) return null;
  return [...new Set(v as string[])].slice(0, MAX_RECIENTES);
}

/* ------------------------------------------------------------------ */
/* El estado compartido: uno por pestaña, para todas las burbujas      */
/* ------------------------------------------------------------------ */

// Cada burbuja tiene su barra, así que el estado vive fuera de React: una
// lectura de localStorage y una del perfil por persona, no una por mensaje.
const enMemoria = new Map<string, string[]>();
const oyentes = new Set<() => void>();
const pedidosAlPerfil = new Set<string>();
// Cuántas veces reaccionó la persona en esta pestaña: si reaccionó mientras el
// perfil venía en camino, lo que llega es viejo y no se adopta.
let usos = 0;

const claveLocal = (uid: string) => `maven_reacciones_recientes_${uid}`;
const avisar = () => oyentes.forEach((o) => o());
const SIN_SESION: string[] = [];

function recientesDe(uid: string): string[] {
  let lista = enMemoria.get(uid);
  if (!lista) {
    lista = [];
    try {
      const crudo = localStorage.getItem(claveLocal(uid));
      lista = (crudo && recientesValidos(JSON.parse(crudo))) || [];
    } catch { /* localStorage bloqueado o JSON roto: arranca con los de siempre */ }
    enMemoria.set(uid, lista);
  }
  return lista;
}

function fijar(uid: string, lista: string[]) {
  enMemoria.set(uid, lista);
  try { localStorage.setItem(claveLocal(uid), JSON.stringify(lista)); } catch { /* */ }
  avisar();
}

const iguales = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((e, i) => e === b[i]);

/** Trae del perfil lo último usado en otro dispositivo. Una vez por pestaña. */
function leerDelPerfil(uid: string) {
  if (pedidosAlPerfil.has(uid)) return;
  pedidosAlPerfil.add(uid);
  const usosAlPedir = usos;
  try {
    supabase
      .from("profiles")
      .select("ui_prefs")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data || usos !== usosAlPedir) return;
        const prefs = data.ui_prefs as Record<string, unknown> | null;
        const remotas = recientesValidos(prefs?.[CLAVE_EN_EL_PERFIL]);
        if (remotas && !iguales(remotas, recientesDe(uid))) fijar(uid, remotas);
      }, () => {});
  } catch {
    // Sin cliente (pruebas) o el cliente tiró: queda lo local.
  }
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/** Solo para las pruebas: olvida lo que hay en memoria. */
export function __reiniciarReaccionesParaTests() {
  enMemoria.clear();
  pedidosAlPerfil.clear();
  usos = 0;
}

/** Trae del perfil las reacciones de otro dispositivo apenas se dibuja el chat,
 *  ANTES de que alguien abra una barra: si llegaran con la barra abierta, los
 *  emojis cambiarían de lugar bajo el cursor. */
export function useSincronizarReacciones(uid: string | null | undefined) {
  useEffect(() => {
    if (uid) leerDelPerfil(uid);
  }, [uid]);
}

/** La barra y el «Uso frecuente» de la persona, y con qué anotar una reacción. */
export function useReaccionesRecientes(uid: string | null | undefined) {
  const recientes = useSyncExternalStore(
    suscribir,
    () => (uid ? recientesDe(uid) : SIN_SESION),
  );

  const anotar = useCallback((emoji: string) => {
    if (!uid) return;
    const antes = recientesDe(uid);
    const siguiente = registrarReaccion(antes, emoji);
    // Reaccionar otra vez con el que ya va primero no cambia nada: ni se escribe.
    if (iguales(antes, siguiente)) return;
    usos += 1;
    fijar(uid, siguiente);
    // Fire-and-forget: lo local ya quedó aplicado y reescribirUiPrefs nunca rechaza.
    void reescribirUiPrefs((actual) =>
      iguales(recientesValidos(actual[CLAVE_EN_EL_PERFIL]) ?? [], siguiente)
        ? null
        : { ...actual, [CLAVE_EN_EL_PERFIL]: siguiente },
    );
  }, [uid]);

  return {
    barra: barraDeReacciones(recientes),
    frecuentes: frecuentesDeReacciones(recientes),
    anotar,
  };
}
