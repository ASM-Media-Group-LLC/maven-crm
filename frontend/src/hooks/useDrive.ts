import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";
import { fetchAllRows } from "@/lib/supabasePaginate";

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
}

export type VistaDrive = "mia" | "unidades" | "compartido" | "recientes" | "papelera";

const COLUMNAS = "id, owner_id, parent_id, tipo, nombre, mime, size, estado, created_at, updated_at, last_opened_at, trashed_at";

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
        // entrar a la carpeta).
        // Las unidades compartidas y mi «Mi unidad» de Google tienen su lugar:
        // no se repiten acá (como en Google).
        const [{ data: sh, error: e1 }, unidades] = await Promise.all([
          tabla("drive_shares").select("item_id").eq("user_id", yo),
          unidadesQueVeo(),
        ]);
        if (e1) throw e1;
        const aparte = new Set(unidades.filter((u) => u.tipo === "empresa" || u.persona === yo).map((u) => u.item_id));
        const ids = ((sh ?? []) as unknown as { item_id: string }[]).map((s) => s.item_id).filter((id) => !aparte.has(id));
        if (!ids.length) return [];
        return ordenar(visibles(await fichasPorId(ids), yo));
      }
      if (vista === "recientes") {
        const { data, error } = await tabla("drive_items").select(COLUMNAS)
          .eq("tipo", "archivo").eq("estado", "listo").is("trashed_at", null)
          .not("last_opened_at", "is", null)
          .order("last_opened_at", { ascending: false }).limit(50);
        if (error) throw error;
        return (data ?? []) as unknown as DriveItem[];
      }
      // Papelera: solo lo que YO mandé ahí, y solo lo de arriba (si una
      // carpeta está en la papelera, sus hijos van con ella).
      const { data, error } = await tabla("drive_items").select(COLUMNAS)
        .eq("owner_id", yo).not("trashed_at", "is", null)
        .order("trashed_at", { ascending: false }).limit(500);
      if (error) throw error;
      const todos = (data ?? []) as unknown as DriveItem[];
      const enPapelera = new Set(todos.map((i) => i.id));
      return todos.filter((i) => !i.parent_id || !enPapelera.has(i.parent_id));
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
  };
}

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

export function useRenombrar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await tabla("drive_items").update({ nombre: nombre.trim() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function usePapelera() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, tirar }: { id: string; tirar: boolean }) => {
      const { error } = await tabla("drive_items")
        .update({ trashed_at: tirar ? new Date().toISOString() : null } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
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

/** Sube archivos a una carpeta: pide el permiso a la edge, manda el archivo
 *  directo al NAS (entero o por partes de 32 MB) y confirma con el recibo que
 *  firma el NAS. Las partes van de a una: el orden importa menos que no
 *  saturar la subida de la oficina. */
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
        const ini = await llamar<Inicio>("subir_iniciar", {
          parent_id: parentId, nombre: f.name, mime: f.type || "application/octet-stream", size: f.size,
        });
        let respuesta: { recibo?: string } | null;
        if ("url" in ini) {
          respuesta = await enviar(ini.url, "PUT", f, (e) => cambiar(clave, { enviado: e })) as { recibo?: string };
        } else {
          let base = 0;
          for (let i = 0; i < ini.partes.length; i++) {
            const pedazo = f.slice(i * ini.tamano_parte, (i + 1) * ini.tamano_parte);
            await enviar(ini.partes[i], "PUT", pedazo, (e) => cambiar(clave, { enviado: base + e }));
            base += pedazo.size;
          }
          respuesta = await enviar(ini.completar, "POST", null, () => {}) as { recibo?: string };
        }
        if (!respuesta?.recibo) throw new Error("El NAS no devolvió el recibo");
        await llamar("subir_confirmar", { id: ini.id, recibo: respuesta.recibo });
        cambiar(clave, { estado: "lista", enviado: f.size });
      } catch (e) {
        cambiar(clave, { estado: "error", error: (e as Error).message });
      }
      invalidar();
    }
  }, [invalidar]);

  return { subidas, subir, limpiar: () => setSubidas((s) => s.filter((x) => x.estado === "subiendo")) };
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
