import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { ordenar, useInvalidarDrive, type DriveItem } from "@/hooks/useDrive";
import { agruparPorCarpetaAnterior, esDelDestino, motivoDelError, type MotivoDeMover } from "@/lib/drive/seleccion";

// Drive: MOVER y BAJAR VARIOS (María Villegas, 02/10, «como Google»).
//
// Mover es cambiar la carpeta madre DESDE EL NAVEGADOR, con la sesión de la
// persona: la RLS (drive_items_editar) exige ser dueño o editor de lo que se
// mueve, y el trigger drive_items_cuidar revisa el destino (misma agencia,
// poder guardar ahí, que una carpeta no quede dentro de sí misma). Nada de
// esto pasa por la edge ni por el cliente admin.

const COLUMNAS = "id, owner_id, parent_id, tipo, nombre, mime, size, estado, created_at, updated_at, last_opened_at, trashed_at";

/** `types.ts` es generado y todavía no conoce estas tablas. */
const tabla = (n: string) => supabase.from(n as never);

// ── Mover ────────────────────────────────────────────────────────────────────

export interface Movido { id: string; antes: string | null }
export interface ResultadoMover {
  destino: string | null;
  movidos: Movido[];
  fallidos: { id: string; motivo: MotivoDeMover }[];
}

/** De a cuántas en una sola sentencia. Una URL con más ids se corta. */
const TRAMO = 100;

/**
 * Mueve las fichas a `destino` (null = la raíz de «Mi unidad»). Primero todo
 * el tramo en UNA sentencia (lo normal es que pase entero); si la base la
 * rechaza, de a una, para mover lo que se pueda —como Google— y decir qué no.
 *
 * ⚠️ `.select("id")`: un UPDATE que la RLS no deja hacer NO da error, toca cero
 * filas. Sin pedir las filas de vuelta, «no tenías permiso» se vería como
 * «movido».
 */
export async function moverFichas(items: readonly Pick<DriveItem, "id" | "parent_id">[], destino: string | null): Promise<ResultadoMover> {
  const r: ResultadoMover = { destino, movidos: [], fallidos: [] };
  const pendientes = items.filter((i) => i.id !== destino && i.parent_id !== destino);
  const una = async (lote: readonly Pick<DriveItem, "id" | "parent_id">[]) => {
    const { data, error } = await tabla("drive_items")
      .update({ parent_id: destino } as never)
      .in("id", lote.map((i) => i.id))
      .select("id");
    return { ok: new Set(((data ?? []) as unknown as { id: string }[]).map((f) => f.id)), error };
  };
  for (let n = 0; n < pendientes.length; n += TRAMO) {
    const tramo = pendientes.slice(n, n + TRAMO);
    const { ok, error } = await una(tramo);
    if (!error) {
      for (const i of tramo) {
        if (ok.has(i.id)) r.movidos.push({ id: i.id, antes: i.parent_id });
        else r.fallidos.push({ id: i.id, motivo: "sin_permiso" });
      }
      continue;
    }
    // La sentencia entera se deshizo. Si el problema es el destino, falla
    // igual para todas: no tiene sentido probar de a una.
    const motivo = motivoDelError(error);
    if (tramo.length === 1 || esDelDestino(motivo)) {
      for (const i of tramo) r.fallidos.push({ id: i.id, motivo });
      continue;
    }
    for (const i of tramo) {
      const sola = await una([i]);
      if (sola.error) r.fallidos.push({ id: i.id, motivo: motivoDelError(sola.error) });
      else if (sola.ok.has(i.id)) r.movidos.push({ id: i.id, antes: i.parent_id });
      else r.fallidos.push({ id: i.id, motivo: "sin_permiso" });
    }
  }
  return r;
}

/** «Deshacer»: cada cosa vuelve a la carpeta donde estaba. */
export async function devolverFichas(hecho: ResultadoMover): Promise<ResultadoMover> {
  const total: ResultadoMover = { destino: null, movidos: [], fallidos: [] };
  for (const [antes, ids] of agruparPorCarpetaAnterior(hecho.movidos)) {
    const r = await moverFichas(ids.map((id) => ({ id, parent_id: hecho.destino })), antes);
    total.movidos.push(...r.movidos);
    total.fallidos.push(...r.fallidos);
  }
  return total;
}

export function useMoverDrive() {
  const invalidar = useInvalidarDrive();
  return useMutation({
    mutationFn: ({ items, destino }: { items: readonly Pick<DriveItem, "id" | "parent_id">[]; destino: string | null }) =>
      moverFichas(items, destino),
    // Aunque falle a medias, lo que sí se movió ya no está donde estaba.
    onSettled: invalidar,
  });
}

export function useDeshacerMover() {
  const invalidar = useInvalidarDrive();
  return useMutation({ mutationFn: devolverFichas, onSettled: invalidar });
}

/** Varias a la papelera (o de vuelta), en una sentencia por tramo. Lo que la
 *  RLS no deja tocar vuelve como no hecho (ver `.select("id")` arriba). */
export async function papeleraVarias(ids: readonly string[], tirar: boolean): Promise<{ hechos: string[]; fallidos: string[] }> {
  const hechos: string[] = [];
  const fallidos: string[] = [];
  for (let n = 0; n < ids.length; n += TRAMO) {
    const tramo = ids.slice(n, n + TRAMO);
    const { data, error } = await tabla("drive_items")
      .update({ trashed_at: tirar ? new Date().toISOString() : null } as never)
      .in("id", tramo)
      .select("id");
    const ok = new Set(error ? [] : ((data ?? []) as unknown as { id: string }[]).map((f) => f.id));
    for (const id of tramo) (ok.has(id) ? hechos : fallidos).push(id);
  }
  return { hechos, fallidos };
}

export function usePapeleraVarias() {
  const invalidar = useInvalidarDrive();
  return useMutation({
    mutationFn: ({ ids, tirar }: { ids: readonly string[]; tirar: boolean }) => papeleraVarias(ids, tirar),
    onSettled: invalidar,
  });
}

// ── Qué carpetas son unidades (una unidad no se mueve, como en Google) ───────

export function useUnidadesDrive() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive", "unidades-ids", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const filas = await fetchAllRows((desde, hasta) => tabla("drive_unidades").select("item_id").order("item_id").range(desde, hasta));
      return new Set((filas as { item_id: string }[]).map((u) => u.item_id));
    },
  });
}

// ── El selector de carpetas de «Mover a…» ────────────────────────────────────

/** Las subcarpetas de una carpeta (sin los archivos: una carpeta importada
 *  puede tener decenas de miles). Paginado: PostgREST corta en 1000. */
export function useSubcarpetasDrive(carpeta: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive", "subcarpetas", carpeta, user?.id],
    enabled: !!user && !!carpeta,
    staleTime: 30_000,
    queryFn: async (): Promise<DriveItem[]> => {
      const data = await fetchAllRows((desde, hasta) => tabla("drive_items").select(COLUMNAS)
        .eq("parent_id", carpeta!).eq("tipo", "carpeta").is("trashed_at", null).order("id").range(desde, hasta));
      return ordenar(data as DriveItem[]);
    },
  });
}

export type RolDrive = "dueno" | "editor" | "lector" | null;

/** Mi rol en cada carpeta (drive_mi_rol, el mismo que usan la RLS y el
 *  trigger). Para no ofrecer como destino una carpeta donde no se puede
 *  guardar. Se pide solo para las carpetas de arriba de todo: el rol se
 *  hereda hacia abajo y nunca baja (si puedo editar una carpeta, puedo editar
 *  todo lo de adentro). */
export function useRolesDrive(ids: readonly string[], habilitado = true) {
  const { user } = useAuth();
  const clave = [...ids].sort();
  return useQuery({
    queryKey: ["drive", "roles", clave, user?.id],
    enabled: !!user && habilitado && clave.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, RolDrive>> => {
      const roles = new Map<string, RolDrive>();
      for (let i = 0; i < clave.length; i += 8) {
        await Promise.all(clave.slice(i, i + 8).map(async (id) => {
          const { data, error } = await supabase.rpc("drive_mi_rol" as never, { p_item: id } as never);
          roles.set(id, error ? null : ((data as unknown as RolDrive) ?? null));
        }));
      }
      return roles;
    },
  });
}

export const puedeGuardar = (rol: RolDrive | undefined) => rol === "dueno" || rol === "editor";

/** Crea una carpeta y devuelve su id (para entrar en ella en el selector). */
export async function crearCarpetaEn(nombre: string, parentId: string | null): Promise<string> {
  const { data, error } = await tabla("drive_items")
    .insert({ tipo: "carpeta", nombre: nombre.trim(), parent_id: parentId } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

// ── Bajar varios en un .zip ──────────────────────────────────────────────────

export class ErrorDelZip extends Error {
  constructor(message: string, public codigo?: string, public tope?: number) { super(message); }
}

export interface PermisoZip { url: string; t: string; archivos: number; bytes: number }

/** Le pide a la edge el permiso del .zip. La edge lee lo elegido —y lo de
 *  adentro de cada carpeta— con la sesión de la persona. */
export async function pedirZip(ids: readonly string[]): Promise<PermisoZip> {
  const { data, error } = await supabase.functions.invoke("drive", { body: { action: "bajar_varios", ids } });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    let cuerpo: { error?: string; codigo?: string; tope?: number } | null = null;
    if (ctx instanceof Response) {
      try { cuerpo = await ctx.clone().json(); } catch { /* sin cuerpo JSON */ }
    }
    throw new ErrorDelZip(cuerpo?.error ?? (await describeFunctionError(error)), cuerpo?.codigo, cuerpo?.tope);
  }
  const d = data as Partial<PermisoZip> & { error?: string; codigo?: string; tope?: number };
  if (d?.error || !d?.url || !d?.t) throw new ErrorDelZip(d?.error ?? "", d?.codigo, d?.tope);
  return d as PermisoZip;
}

/**
 * Manda el permiso al NAS con un formulario POST a un iframe escondido: el
 * navegador baja el .zip sin abrir otra pestaña ni salir de Maven. El permiso
 * va en el CUERPO: con miles de archivos no entra en una URL.
 *
 * Una descarga (Content-Disposition: attachment) no le cambia la página al
 * iframe; un error del NAS sí, y eso es lo que avisa `alFallar`. El iframe
 * queda un rato: sacarlo antes de que el NAS conteste cortaría el pedido.
 */
export function mandarAlNas(url: string, permiso: string, alFallar: () => void): void {
  const nombre = `drive-zip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const marco = document.createElement("iframe");
  marco.name = nombre;
  marco.hidden = true;
  marco.tabIndex = -1;
  marco.setAttribute("aria-hidden", "true");
  document.body.appendChild(marco);
  const formulario = document.createElement("form");
  formulario.method = "POST";
  formulario.action = url;
  formulario.target = nombre;
  formulario.enctype = "application/x-www-form-urlencoded";
  formulario.hidden = true;
  const campo = document.createElement("input");
  campo.type = "hidden";
  campo.name = "t";
  campo.value = permiso;
  formulario.appendChild(campo);
  document.body.appendChild(formulario);
  marco.addEventListener("load", () => {
    try {
      // La carga inicial (about:blank) no cuenta.
      if (marco.contentWindow?.location.href === "about:blank") return;
    } catch { /* otra página (la del NAS): es un error */ }
    alFallar();
    marco.remove();
  });
  formulario.submit();
  formulario.remove();
  window.setTimeout(() => marco.remove(), 10 * 60 * 1000);
}
