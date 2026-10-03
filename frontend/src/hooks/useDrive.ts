import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { recordarTamanos, tamanosRecordados } from "@/lib/drive/tamanosRecordados";

// Drive de Oficina. Las FICHAS (nombre, carpeta, dueño) se leen directo de la
// base con la RLS de drive_items; el CONTENIDO va y viene del NAS por la puerta de Dokploy (Tailscale)
// con un permiso firmado que da la edge `drive` (ver infra/nas-drive).

export interface DriveItem {
  id: string;
  owner_id: string | null;
  parent_id: string | null;
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  size: number | null;
  estado: "subiendo" | "listo";
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  trashed_at: string | null;
  /** La unidad compartida ('empresa') que la contiene, o null. Para el
   *  «Propietario» de lo importado (que no tiene dueño). */
  unidad_id?: string | null;
  /** Quién la mandó a la papelera (solo en la Papelera; null si fue antes del 03/10). */
  trashed_by?: string | null;
  /** Cuándo la abrí YO (solo en Recientes, de drive_aperturas). */
  abierto_por_mi_at?: string | null;
  /** El nombre de la carpeta donde estaba (solo en la Papelera), si la puedo ver. */
  ubicacion?: string | null;
}

export type VistaDrive = "mia" | "unidades" | "compartido" | "recientes" | "papelera";

const COLUMNAS = "id, owner_id, parent_id, tipo, nombre, mime, size, estado, created_at, updated_at, last_opened_at, trashed_at, unidad_id";

/** Un cambio que la RLS no deja hacer NO da error: toca cero filas. Los hooks
 *  que lo detectan (con `.select("id")`) tiran este error y la página lo dice
 *  en su idioma. */
export const SIN_PERMISO_DRIVE = "sin_permiso";

/** `types.ts` es generado y todavía no conoce estas tablas. */
const tabla = (n: string) => supabase.from(n as never);

/** Qué carpetas son unidades (la RLS deja ver las que puedo abrir y mi «Mi
 *  unidad» de Google): 'empresa' = unidad compartida de la agencia, 'personal'
 *  = la «Mi unidad» de Google de alguien, importada. */
interface UnidadVisible { item_id: string; tipo: "empresa" | "personal"; persona: string | null }
async function unidadesQueVeo(): Promise<UnidadVisible[]> {
  return fetchAllRows((desde, hasta) => tabla("drive_unidades").select("item_id, tipo, persona")
    .order("item_id").range(desde, hasta));
}

/** Fichas por id, de a tramos (una URL con cientos de ids se corta). */
async function fichasPorId(ids: string[]): Promise<DriveItem[]> {
  const todas: DriveItem[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await tabla("drive_items").select(COLUMNAS).in("id", ids.slice(i, i + 150)).is("trashed_at", null);
    if (error) throw error;
    todas.push(...((data ?? []) as unknown as DriveItem[]));
  }
  return todas;
}

/** Carpetas primero y después por nombre, como Google Drive. */
export function ordenar(items: DriveItem[]): DriveItem[] {
  return [...items].sort((a, b) =>
    a.tipo !== b.tipo ? (a.tipo === "carpeta" ? -1 : 1) : a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

async function llamar<T>(action: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("drive", { body: { action, ...cuerpo } });
  if (error) throw new Error(await describeFunctionError(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Lo que se ve en una vista: el contenido de una carpeta, lo compartido, lo
 *  reciente o la papelera. */
export function useDriveVista(vista: VistaDrive, carpeta: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive", vista, carpeta, user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<DriveItem[]> => {
      const yo = user!.id;
      if (carpeta) {
        // Dentro de una carpeta, venga de donde venga (mía o compartida): la
        // RLS ya dice qué se puede ver. ⚠️ Paginado: PostgREST corta en 1000 y
        // hay carpetas importadas de Google con decenas de miles de archivos.
        const data = await fetchAllRows((desde, hasta) => tabla("drive_items").select(COLUMNAS)
          .eq("parent_id", carpeta).is("trashed_at", null).order("id").range(desde, hasta));
        return ordenar(visibles(data, yo));
      }
      if (vista === "mia") {
        // Lo mío y, como en Google, mi «Mi unidad» de Google (importada).
        const [data, unidades] = await Promise.all([
          fetchAllRows((desde, hasta) => tabla("drive_items").select(COLUMNAS)
            .is("parent_id", null).eq("owner_id", yo).is("trashed_at", null).order("id").range(desde, hasta)),
          unidadesQueVeo(),
        ]);
        const deGoogle = await fichasPorId(unidades.filter((u) => u.tipo === "personal" && u.persona === yo).map((u) => u.item_id));
        return ordenar(visibles([...data, ...deGoogle], yo));
      }
      if (vista === "unidades") {
        // Las unidades compartidas de la agencia que puedo abrir.
        const unidades = await unidadesQueVeo();
        return ordenar(visibles(await fichasPorId(unidades.filter((u) => u.tipo === "empresa").map((u) => u.item_id)), yo));
      }
      if (vista === "compartido") {
        // Lo que me compartieron DIRECTAMENTE (no lo de adentro: eso se ve al
        // entrar a la carpeta) y lo abierto a toda la agencia que no veo ya
        // por otro lado (la base devuelve solo lo de más arriba).
        // Las unidades compartidas y mi «Mi unidad» de Google tienen su lugar:
        // no se repiten acá (como en Google).
        const [{ data: sh, error: e1 }, { data: ag, error: e2 }, unidades] = await Promise.all([
          tabla("drive_shares").select("item_id").eq("user_id", yo),
          supabase.rpc("drive_de_toda_la_agencia" as never),
          unidadesQueVeo(),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const aparte = new Set(unidades.filter((u) => u.tipo === "empresa" || u.persona === yo).map((u) => u.item_id));
        const ids = [...new Set([
          ...((sh ?? []) as unknown as { item_id: string }[]).map((s) => s.item_id),
          ...((ag ?? []) as unknown as { item_id: string }[]).map((s) => s.item_id),
        ])].filter((id) => !aparte.has(id));
        if (!ids.length) return [];
        return ordenar(visibles(await fichasPorId(ids), yo));
      }
      if (vista === "recientes") {
        // Lo que abrí YO, como en Google. ⚠️ No ordenar por last_opened_at: es
        // una fecha por archivo para todos (Test veía lo que abría Daniel).
        // Las fichas pasan igual por la RLS: si me quitan el acceso, se van.
        const { data, error } = await tabla("drive_aperturas").select("item_id, abierto_at")
          .eq("user_id", yo).order("abierto_at", { ascending: false }).limit(50);
        if (error) throw error;
        const aperturas = (data ?? []) as unknown as { item_id: string; abierto_at: string }[];
        const porId = new Map((await fichasPorId(aperturas.map((a) => a.item_id))).map((f) => [f.id, f]));
        // La fecha que se muestra es la de MI apertura («Abierto por mí»).
        return aperturas
          .map((a): DriveItem | undefined => { const f = porId.get(a.item_id); return f ? { ...f, abierto_por_mi_at: a.abierto_at } : undefined; })
          .filter((f): f is DriveItem => !!f && f.tipo === "archivo" && f.estado === "listo");
      }
      return papeleraQueVeo();
    },
  });
}

/** La papelera, como la de Google: TODO lo tirado que puedo ver, no solo lo
 *  mío. Lo importado de Google no tiene dueño (owner_id null): con «solo lo
 *  mío», quien lo tiraba lo perdía de vista y nadie podía restaurarlo (97
 *  archivos y 8 carpetas el 03/10). La RLS de drive_items ya filtra por
 *  drive_mi_rol: lo de una unidad compartida lo ven sus miembros, como la
 *  papelera de una unidad de Google. Restaurar y borrar para siempre siguen
 *  pidiendo dueño o editor (la RLS y la edge).
 *
 *  Solo lo de arriba: lo de adentro de una carpeta tirada va con ella. Con
 *  quién lo tiró (`trashed_by`, migración 20261003140000) y dónde estaba. */
async function papeleraQueVeo(): Promise<DriveItem[]> {
  const { data, error } = await tabla("drive_items").select(`${COLUMNAS}, trashed_by`)
    .not("trashed_at", "is", null)
    .order("trashed_at", { ascending: false }).limit(500);
  if (error) throw error;
  const todos = (data ?? []) as unknown as DriveItem[];
  const enPapelera = new Set(todos.map((i) => i.id));
  const arriba = todos.filter((i) => !i.parent_id || !enPapelera.has(i.parent_id));
  // Dónde estaba: el nombre de la carpeta madre, si la puedo ver (la RLS).
  const madres = [...new Set(arriba.map((i) => i.parent_id).filter((p): p is string => !!p))];
  const nombres = new Map<string, string>();
  for (let i = 0; i < madres.length; i += 150) {
    const { data: filas, error: e } = await tabla("drive_items").select("id, nombre").in("id", madres.slice(i, i + 150));
    if (e) throw e;
    for (const f of (filas ?? []) as unknown as { id: string; nombre: string }[]) nombres.set(f.id, f.nombre);
  }
  return arriba.map((i) => ({ ...i, ubicacion: i.parent_id ? nombres.get(i.parent_id) ?? null : null }));
}

/** Un resultado del buscador: la ficha y dónde está (la carpeta madre). */
export interface ResultadoDelDrive extends DriveItem {
  ubicacion: string | null;
}

/** Buscar en TODO el Drive que la persona puede ver, por nombre, como Google
 *  (la función drive_buscar: candidatos por índice, visibilidad después). Con
 *  `extensiones`, los archivos de esos formatos (las carpetas, siempre).
 *  Desde 3 letras: con menos no busca. */
export function useBuscarEnDrive(q: string, extensiones: string[] | null) {
  const { user } = useAuth();
  const texto = q.trim();
  return useQuery({
    queryKey: ["drive-buscar", texto, extensiones?.join(",") ?? "", user?.id],
    enabled: !!user && texto.length >= 3,
    staleTime: 30_000,
    // Mientras llega lo nuevo se queda lo anterior: sin esto la lista
    // parpadea vacía en cada letra.
    placeholderData: (anterior) => anterior,
    queryFn: async (): Promise<ResultadoDelDrive[]> => {
      const { data, error } = await supabase.rpc("drive_buscar" as never, {
        p_q: texto, p_extensiones: extensiones, p_limite: 50,
      } as never);
      if (error) throw error;
      type Fila = Pick<DriveItem, "id" | "nombre" | "tipo" | "mime" | "size" | "updated_at" | "owner_id" | "parent_id"> & { ubicacion: string | null };
      return ((data ?? []) as unknown as Fila[]).map((f) => ({
        ...f,
        // La función devuelve solo lo que ya está listo y fuera de la papelera.
        estado: "listo" as const,
        created_at: f.updated_at,
        last_opened_at: null,
        trashed_at: null,
      }));
    },
  });
}

/** Una subida que todavía no terminó solo la ve quien la está subiendo. */
function visibles(data: unknown, yo: string): DriveItem[] {
  return ((data ?? []) as DriveItem[]).filter((i) => i.estado === "listo" || i.owner_id === yo);
}

/** La ruta hasta una carpeta, para las «migas»: Mi unidad › Contabilidad › 2026.
 *  Se corta donde la persona deja de tener acceso (una carpeta compartida no
 *  muestra de quién es hija). */
export function useRutaDrive(carpeta: string | null) {
  return useQuery({
    queryKey: ["drive-ruta", carpeta],
    enabled: !!carpeta,
    staleTime: 60_000,
    queryFn: async () => {
      const ruta: { id: string; nombre: string; owner_id: string | null }[] = [];
      // Una unidad es el principio de su ruta, como en Google.
      const raices = new Set((await unidadesQueVeo()).map((u) => u.item_id));
      let actual: string | null = carpeta;
      for (let i = 0; actual && i < 30; i++) {
        const { data } = await tabla("drive_items").select("id, nombre, parent_id, owner_id").eq("id", actual).maybeSingle();
        const f = data as unknown as { id: string; nombre: string; parent_id: string | null; owner_id: string | null } | null;
        if (!f) break;
        ruta.unshift({ id: f.id, nombre: f.nombre, owner_id: f.owner_id });
        if (raices.has(f.id)) break;
        actual = f.parent_id;
      }
      return ruta;
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["drive"] });
    qc.invalidateQueries({ queryKey: ["drive-ruta"] });
    // Subir o borrar para siempre cambia el espacio usado.
    qc.invalidateQueries({ queryKey: ["drive-uso"] });
    qc.invalidateQueries({ queryKey: ["drive-uso-agencia"] });
    // Y lo que ocupan las carpetas (subir, mover, tirar o restaurar).
    qc.invalidateQueries({ queryKey: ["drive-tamanos"] });
    qc.invalidateQueries({ queryKey: ["drive-tamano"] });
  };
}
/** Lo mismo para los hooks de hooks/useDriveVarios.ts (mover y bajar varios). */
export const useInvalidarDrive = useInvalidar;

export function useCrearCarpeta() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ nombre, parentId }: { nombre: string; parentId: string | null }) => {
      const { error } = await tabla("drive_items")
        .insert({ tipo: "carpeta", nombre: nombre.trim(), parent_id: parentId } as never);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Cambiar el nombre. ⚠️ `.select("id")`: sin permiso de edición la RLS deja
 *  el UPDATE en cero filas y SIN error; sin pedir la fila de vuelta se vería
 *  como hecho. */
export function useRenombrar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { data, error } = await tabla("drive_items").update({ nombre: nombre.trim() } as never).eq("id", id).select("id");
      if (error) throw error;
      if (!(data as unknown[] | null)?.length) throw new Error(SIN_PERMISO_DRIVE);
    },
    onSuccess: invalidar,
  });
}

// La papelera (una o varias) va por papeleraVarias (hooks/useDriveVarios.ts):
// pide las filas de vuelta y dice qué no se pudo, para «Deshacer» y para avisar
// a quien solo puede ver.

// ── Detalles (el panel ⓘ) y el tamaño de las carpetas ────────────────────────

/** La fila de un `maybeSingle()` o de una función que devuelve una tabla (que
 *  llega como lista). */
function primera<T>(data: unknown): T | null {
  const f = Array.isArray(data) ? data[0] : data;
  return f && typeof f === "object" ? (f as T) : null;
}

/** Una unidad que puedo ver, con su nombre: 'empresa' = unidad compartida;
 *  'personal' = la «Mi unidad» de Google de alguien (`persona`), importada. */
export interface UnidadConNombre { tipo: "empresa" | "personal"; persona: string | null; nombre: string }

/** Las unidades que veo, por id. Para el «Propietario» de lo importado (sin
 *  dueño): la unidad compartida que lo contiene, o la persona de la «Mi
 *  unidad» de Google. Son unas cien: dos consultas. */
export function useUnidadesConNombre() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive", "unidades-con-nombre", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, UnidadConNombre>> => {
      const unidades = await unidadesQueVeo();
      const nombres = new Map<string, string>();
      const ids = unidades.map((u) => u.item_id);
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await tabla("drive_items").select("id, nombre").in("id", ids.slice(i, i + 150));
        if (error) throw error;
        for (const f of (data ?? []) as unknown as { id: string; nombre: string }[]) nombres.set(f.id, f.nombre);
      }
      return new Map(unidades
        .filter((u) => nombres.has(u.item_id))
        .map((u) => [u.item_id, { tipo: u.tipo, persona: u.persona, nombre: nombres.get(u.item_id)! }]));
    },
  });
}

/** Una ficha por id (la carpeta en la que se está, para sus Detalles). */
export function useFichaDrive(id: string | null, habilitado = true) {
  return useQuery({
    queryKey: ["drive", "ficha", id],
    enabled: !!id && habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<DriveItem | null> => {
      const { data, error } = await tabla("drive_items").select(COLUMNAS).eq("id", id!).maybeSingle();
      if (error) throw error;
      const f = primera<DriveItem>(data);
      return f && f.id ? f : null;
    },
  });
}

/** Cuándo abrí YO un archivo («Abierto por mí» de los Detalles). */
export function useAperturaMia(id: string | null, habilitado = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive", "apertura", id, user?.id],
    enabled: !!id && !!user && habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await tabla("drive_aperturas").select("abierto_at")
        .eq("item_id", id!).eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      const f = primera<{ abierto_at?: string }>(data);
      return f?.abierto_at ?? null;
    },
  });
}

/** Mi rol sobre una ficha (dueno, editor, lector o null): para saber si el
 *  nombre se puede cambiar antes de intentarlo. */
export function useMiRolDrive(id: string | null | undefined) {
  return useQuery({
    queryKey: ["drive", "mi-rol", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<"dueno" | "editor" | "lector" | null> => {
      const { data, error } = await supabase.rpc("drive_mi_rol" as never, { p_item: id } as never);
      if (error) throw error;
      return (typeof data === "string" ? data : null) as "dueno" | "editor" | "lector" | null;
    },
  });
}

/** Lo que ocupa una carpeta (todo lo de adentro, sin la papelera). */
export interface TamanoDeCarpeta { bytes: number; archivos: number; carpetas: number; completo: boolean }

type FilaTamano = { item_id?: string; bytes: number | string; archivos: number | string; carpetas: number | string; completo: boolean };
const aTamano = (f: FilaTamano): TamanoDeCarpeta => ({
  bytes: Number(f.bytes) || 0, archivos: Number(f.archivos) || 0, carpetas: Number(f.carpetas) || 0, completo: f.completo !== false,
});

/** Una carpeta, para los Detalles (drive_tamano_carpeta: error si no la veo).
 *  Mientras cuenta, muestra el último tamaño conocido (ver tamanosRecordados). */
export function useTamanoCarpeta(id: string | null, habilitado = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive-tamano", id],
    enabled: !!id && habilitado,
    staleTime: 5 * 60_000,
    placeholderData: () => (id ? tamanosRecordados(user?.id).get(id) : undefined),
    queryFn: async (): Promise<TamanoDeCarpeta> => {
      const { data, error } = await supabase.rpc("drive_tamano_carpeta" as never, { p_item: id } as never);
      if (error) throw error;
      const f = primera<FilaTamano>(data);
      if (!f) throw new Error(SIN_PERMISO_DRIVE);
      const t = aTamano(f);
      if (id) recordarTamanos(user?.id, new Map([[id, t]]));
      return t;
    },
  });
}

/** De a cuántas carpetas por llamada (el tope de drive_tamanos). */
export const TANDA_TAMANOS = 100;

/** De a cuántas las pide la lista. Tandas CHICAS y en paralelo: una tanda se ve
 *  recién cuando termina su carpeta más pesada (KASH sola tarda ~2 s), así que
 *  de a 100 todas esperaban a la peor. De a 8, la pesada solo frena a 7. */
export const TANDA_EN_PANTALLA = 8;

/** Pide los tamaños de una tanda. La función deja de empezar carpetas nuevas a
 *  los ~3 s y devuelve las que alcanzó: las que faltan se piden de nuevo. Si
 *  una vuelta no trae nada, lo que queda no se puede ver (o no es una
 *  carpeta): se corta ahí. */
export async function pedirTamanos(ids: readonly string[]): Promise<Map<string, TamanoDeCarpeta>> {
  const listos = new Map<string, TamanoDeCarpeta>();
  let faltan = [...ids];
  for (let vuelta = 0; faltan.length && vuelta < 5; vuelta++) {
    const { data, error } = await supabase.rpc("drive_tamanos" as never, { p_ids: faltan } as never);
    if (error) throw error;
    const filas = (Array.isArray(data) ? data : []) as FilaTamano[];
    let nuevas = 0;
    for (const f of filas) {
      if (!f?.item_id || listos.has(f.item_id)) continue;
      listos.set(f.item_id, aTamano(f));
      nuevas++;
    }
    if (!nuevas) break;
    faltan = faltan.filter((id) => !listos.has(id));
  }
  return listos;
}

export type EstadoDeTamano =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "listo"; tamano: TamanoDeCarpeta }
  /** No volvió: no la puedo ver entera o no se alcanzó a contar. */
  | { estado: "sinDato" };

/** El tamaño de las carpetas que se están dibujando (la columna «Tamaño» y las
 *  tarjetas), de a tandas de TANDA_EN_PANTALLA, todas a la vez: una llamada por
 *  tanda, no una por carpeta. Las tandas se arman en el orden de la lista, así
 *  que al bajar y dibujar más las de arriba no se vuelven a pedir.
 *  react-query guarda cada tanda 5 min; subir, mover o tirar algo las vuelve a
 *  pedir (useInvalidar). Mientras una tanda cuenta, se muestra el último tamaño
 *  conocido de cada carpeta (tamanosRecordados) en vez de la rayita. */
export function useTamanosDeCarpetas(ids: readonly string[]): (id: string) => EstadoDeTamano {
  const { user } = useAuth();
  const clave = ids.join(",");
  const tandas = useMemo(() => {
    const lista = clave ? clave.split(",") : [];
    const salida: string[][] = [];
    for (let i = 0; i < lista.length; i += TANDA_EN_PANTALLA) salida.push(lista.slice(i, i + TANDA_EN_PANTALLA));
    return salida;
  }, [clave]);
  // Se relee al cambiar de carpeta: así entra lo que se contó en esta misma sesión.
  const recordados = useMemo(() => tamanosRecordados(user?.id), [user?.id, clave]);
  const resultados = useQueries({
    queries: tandas.map((tanda) => ({
      queryKey: ["drive-tamanos", user?.id, tanda.join(",")],
      enabled: !!user,
      staleTime: 5 * 60_000,
      retry: 1,
      queryFn: async () => {
        const listos = await pedirTamanos(tanda);
        recordarTamanos(user?.id, listos);
        return listos;
      },
    })),
  });
  const enQueTanda = useMemo(() => {
    const m = new Map<string, number>();
    tandas.forEach((t, n) => t.forEach((id) => m.set(id, n)));
    return m;
  }, [tandas]);
  return (id: string): EstadoDeTamano => {
    const n = enQueTanda.get(id);
    const r = n === undefined ? undefined : resultados[n];
    if (!r || r.isPending || r.isError) {
      const antes = recordados.get(id);
      if (antes) return { estado: "listo", tamano: antes };
      return !r || r.isPending ? { estado: "cargando" } : { estado: "error" };
    }
    const tamano = r.data?.get(id);
    return tamano ? { estado: "listo", tamano } : { estado: "sinDato" };
  };
}

export function useBorrarParaSiempre() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => llamar<{ ok: true }>("borrar_para_siempre", { id }),
    onSuccess: invalidar,
  });
}

/** Abre (o baja) un archivo. La URL viene firmada por la edge y apunta directo
 *  al NAS; vence en unas horas. */
export async function abrirArchivo(id: string, descargar: boolean): Promise<void> {
  // La pestaña se abre ANTES de pedir la URL: si se abre después del await, el
  // navegador lo toma como una ventana emergente no pedida y la bloquea.
  const pestana = descargar ? null : window.open("about:blank", "_blank");
  try {
    const { url } = await llamar<{ url: string }>("abrir", { id, descargar });
    if (pestana) pestana.location.href = url;
    else window.location.href = url; // Content-Disposition: attachment → no navega
  } catch (e) {
    pestana?.close();
    throw e;
  }
}

// ── Compartir ────────────────────────────────────────────────────────────────

export interface CompartidoDrive { user_id: string; rol: "lector" | "editor" }

export function useCompartidosDrive(itemId: string | undefined) {
  return useQuery({
    queryKey: ["drive-shares", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<CompartidoDrive[]> => {
      const { data, error } = await tabla("drive_shares").select("user_id, rol").eq("item_id", itemId!);
      if (error) throw error;
      return (data ?? []) as unknown as CompartidoDrive[];
    },
  });
}

export function useCompartirDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { itemId, userId, rol, quitar }: { itemId: string; userId: string; rol?: "lector" | "editor"; quitar?: boolean },
    ) => {
      if (quitar) {
        const { error } = await tabla("drive_shares").delete().eq("item_id", itemId).eq("user_id", userId);
        if (error) throw error;
        return;
      }
      const { error } = await tabla("drive_shares")
        .upsert({ item_id: itemId, user_id: userId, rol: rol ?? "lector" } as never, { onConflict: "item_id,user_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["drive-shares", v.itemId] }),
  });
}

/** El acceso general de una ficha: abierta a toda la agencia (ella misma o una
 *  carpeta de arriba) o null = «Restringido». */
export interface AccesoGeneralDrive { item_id: string; nombre: string; rol: "lector" | "editor"; heredado: boolean }

export function useAccesoGeneralDrive(itemId: string | undefined) {
  return useQuery({
    queryKey: ["drive-acceso-general", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<AccesoGeneralDrive | null> => {
      const { data, error } = await supabase.rpc("drive_acceso_general" as never, { p_item: itemId } as never);
      if (error) throw error;
      const f = ((data ?? []) as unknown as { item_id: string; nombre: string; rol: "lector" | "editor"; nivel: number }[])[0];
      return f ? { item_id: f.item_id, nombre: f.nombre, rol: f.rol, heredado: f.nivel > 0 } : null;
    },
  });
}

/** Abre una ficha a toda la agencia con un rol, o la vuelve a «Restringido»
 *  (rol null). */
export function useCambiarAccesoGeneral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, rol }: { itemId: string; rol: "lector" | "editor" | null }) => {
      if (!rol) {
        const { error } = await tabla("drive_compartido_agencia").delete().eq("item_id", itemId);
        if (error) throw error;
        return;
      }
      const { error } = await tabla("drive_compartido_agencia")
        .upsert({ item_id: itemId, rol } as never, { onConflict: "item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      // Cambia lo que ven todos: el acceso de lo de adentro y «Compartido conmigo».
      qc.invalidateQueries({ queryKey: ["drive-acceso-general"] });
      qc.invalidateQueries({ queryKey: ["drive"] });
    },
  });
}

// ── Subidas ──────────────────────────────────────────────────────────────────

export interface Subida {
  clave: string;
  nombre: string;
  size: number;
  enviado: number;
  estado: "subiendo" | "lista" | "error";
  error?: string;
}

type Inicio =
  | { id: string; url: string }
  | { id: string; tamano_parte: number; partes: string[]; completar: string };

/** PUT con progreso. fetch no avisa cuánto va subiendo; XMLHttpRequest sí. */
function enviar(url: string, metodo: string, cuerpo: Blob | null, onProgreso: (n: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(metodo, url);
    xhr.upload.onprogress = (e) => onProgreso(e.loaded);
    xhr.onload = () => {
      let j: unknown = null;
      try { j = JSON.parse(xhr.responseText || "null"); } catch { /* sin cuerpo */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(j);
      else reject(new Error((j as { error?: string } | null)?.error ?? `El NAS contestó ${xhr.status}`));
    };
    // Sin respuesta del todo: la puerta o la mini no están. No es «el archivo
    // es inválido»; es «el NAS no está».
    xhr.onerror = () => reject(new Error("No se pudo llegar al NAS"));
    xhr.send(cuerpo);
  });
}

/** Sube UN archivo: pide el permiso a la edge, manda el archivo directo al NAS
 *  (entero o por partes de 32 MB) y confirma con el recibo que firma el NAS.
 *  Las partes van de a una: el orden importa menos que no saturar la subida de
 *  la oficina. Devuelve el id de la ficha, que al volver ya está «listo». */
async function subirArchivo(f: File, parentId: string | null, onProgreso: (enviado: number) => void): Promise<string> {
  const ini = await llamar<Inicio>("subir_iniciar", {
    parent_id: parentId, nombre: f.name, mime: f.type || "application/octet-stream", size: f.size,
  });
  let respuesta: { recibo?: string } | null;
  if ("url" in ini) {
    respuesta = await enviar(ini.url, "PUT", f, onProgreso) as { recibo?: string };
  } else {
    let base = 0;
    for (let i = 0; i < ini.partes.length; i++) {
      const pedazo = f.slice(i * ini.tamano_parte, (i + 1) * ini.tamano_parte);
      await enviar(ini.partes[i], "PUT", pedazo, (e) => onProgreso(base + e));
      base += pedazo.size;
    }
    respuesta = await enviar(ini.completar, "POST", null, () => {}) as { recibo?: string };
  }
  if (!respuesta?.recibo) throw new Error("El NAS no devolvió el recibo");
  await llamar("subir_confirmar", { id: ini.id, recibo: respuesta.recibo });
  return ini.id;
}

/** Sube archivos a una carpeta, de a uno (ver subirArchivo), con el avance de
 *  cada uno para el panel de subidas. */
export function useSubidasDrive() {
  const invalidar = useInvalidar();
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const cambiar = (clave: string, c: Partial<Subida>) =>
    setSubidas((s) => s.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  const subir = useCallback(async (archivos: File[], parentId: string | null) => {
    const nuevas = archivos.map((f) => ({
      clave: `${Date.now()}-${Math.random()}`, nombre: f.name, size: f.size, enviado: 0, estado: "subiendo" as const,
    }));
    setSubidas((s) => [...nuevas, ...s]);
    for (let n = 0; n < archivos.length; n++) {
      const f = archivos[n];
      const { clave } = nuevas[n];
      try {
        await subirArchivo(f, parentId, (e) => cambiar(clave, { enviado: e }));
        cambiar(clave, { estado: "lista", enviado: f.size });
      } catch (e) {
        cambiar(clave, { estado: "error", error: (e as Error).message });
      }
      invalidar();
    }
  }, [invalidar]);

  return { subidas, subir, limpiar: () => setSubidas((s) => s.filter((x) => x.estado === "subiendo")) };
}

/** «Abrir» › «Subir» de la Oficina: sube UN archivo y devuelve su id cuando ya
 *  está listo, para abrirlo apenas termina. El mismo camino que el Drive
 *  (subirArchivo); lo único distinto es que quien llama necesita el id. */
export function useSubirUnArchivo() {
  const invalidar = useInvalidar();
  return useCallback(async (f: File, parentId: string | null, onProgreso: (enviado: number) => void) => {
    try {
      return await subirArchivo(f, parentId, onProgreso);
    } finally {
      // Haya salido bien o no: una subida a medias también cambia la lista y
      // el espacio usado.
      invalidar();
    }
  }, [invalidar]);
}

// ── Cupo ─────────────────────────────────────────────────────────────────────

export interface UsoDrive { usado: number; cupo: number }

/** Cuánto uso y cuánto tengo (50 GB salvo que un admin me haya puesto otro).
 *  Cuenta la papelera: sigue ocupando lugar en el NAS. */
export function useUsoDrive() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive-uso", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<UsoDrive> => {
      const { data, error } = await supabase.rpc("drive_uso" as never);
      if (error) throw error;
      const filas = data as unknown as { usado: number; cupo: number }[] | { usado: number; cupo: number } | null;
      const f = Array.isArray(filas) ? filas[0] : filas ?? undefined;
      return { usado: Number(f?.usado ?? 0), cupo: Number(f?.cupo ?? 0) };
    },
  });
}

export interface UsoAgencia { usado: number; cupo: number | null; personas: number }

/** El espacio común de la agencia: lo que está dentro de las unidades
 *  compartidas. cupo null = sin tope (KASH); si no, como Starter de Google. */
export function useUsoAgencia(habilitado = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drive-uso-agencia", user?.id],
    enabled: !!user && habilitado,
    staleTime: 60_000,
    queryFn: async (): Promise<UsoAgencia> => {
      const { data, error } = await supabase.rpc("drive_uso_agencia" as never);
      if (error) throw error;
      const filas = data as unknown as UsoAgencia[] | UsoAgencia | null;
      const f = Array.isArray(filas) ? filas[0] : filas ?? undefined;
      return { usado: Number(f?.usado ?? 0), cupo: f?.cupo == null ? null : Number(f.cupo), personas: Number(f?.personas ?? 0) };
    },
  });
}

/** Un admin crea una unidad compartida (sin dueño, de la agencia). */
export function useCrearUnidad() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (nombre: string) => llamar<{ id: string }>("crear_unidad", { nombre: nombre.trim() }),
    onSuccess: invalidar,
  });
}

export interface UsoDePersona { user_id: string; nombre: string; usado: number; cupo: number; cupo_propio: boolean }

/** Para el admin: todas las personas de su agencia con su uso y su cupo. */
export function useUsosDeMiAgencia(habilitado: boolean) {
  return useQuery({
    queryKey: ["drive-usos-agencia"],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<UsoDePersona[]> => {
      const { data, error } = await supabase.rpc("drive_usos_de_mi_agencia" as never);
      if (error) throw error;
      return ((data ?? []) as UsoDePersona[]).map((u) => ({ ...u, usado: Number(u.usado), cupo: Number(u.cupo) }));
    },
  });
}

/** El admin cambia el cupo de alguien (en bytes) o lo vuelve al general
 *  (null). */
export function useGuardarCupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, bytes }: { userId: string; bytes: number | null }) => {
      if (bytes === null) {
        const { error } = await tabla("drive_cupos").delete().eq("user_id", userId);
        if (error) throw error;
        return;
      }
      const { error } = await tabla("drive_cupos")
        .upsert({ user_id: userId, bytes_max: Math.round(bytes) } as never, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive-usos-agencia"] });
      qc.invalidateQueries({ queryKey: ["drive-uso"] });
    },
  });
}
