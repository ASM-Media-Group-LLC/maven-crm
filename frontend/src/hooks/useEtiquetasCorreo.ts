import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";

/** «En la lista de etiquetas» de Gmail: Mostrar / Mostrar si no están leídas /
 *  Ocultar. */
export type EnListaEtiquetas = "mostrar" | "si_no_leidas" | "ocultar";

export interface EtiquetaDeCorreo {
  id: string;
  /** Solo el tramo propio: la ruta «Padre/Hija» la arma `arbolDeEtiquetas`. */
  nombre: string;
  parentId: string | null;
  /** Fondo y texto, de la paleta de Gmail. Null = sin color. */
  color: ParDeColores | null;
  enListaEtiquetas: EnListaEtiquetas;
  /** «En la lista de mensajes»: si la pastilla aparece junto al asunto. */
  enListaMensajes: boolean;
}

/** `types.ts` es generado y todavía no conoce estas tablas. Mismo patrón que
 *  calendar_events y document_shares. */
function tabla(nombre: string) {
  return supabase.from(nombre as never);
}

interface FilaEtiqueta {
  id: string;
  nombre: string;
  parent_id: string | null;
  bg_color: string | null;
  text_color: string | null;
  en_lista_etiquetas: EnListaEtiquetas | null;
  en_lista_mensajes: boolean | null;
}

const deFila = (f: FilaEtiqueta): EtiquetaDeCorreo => ({
  id: f.id,
  nombre: f.nombre,
  parentId: f.parent_id ?? null,
  color: f.bg_color && f.text_color ? { fondo: f.bg_color, texto: f.text_color } : null,
  enListaEtiquetas: f.en_lista_etiquetas ?? "mostrar",
  enListaMensajes: f.en_lista_mensajes ?? true,
});

export function useEtiquetas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-labels", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EtiquetaDeCorreo[]> => {
      const { data, error } = await tabla("mail_labels")
        .select("id, nombre, parent_id, bg_color, text_color, en_lista_etiquetas, en_lista_mensajes")
        .order("nombre", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as FilaEtiqueta[]).map(deFila);
    },
  });
}

export interface NodoEtiqueta {
  etiqueta: EtiquetaDeCorreo;
  /** 0 = primer nivel. */
  nivel: number;
  /** «Hubstaff/Reportes»: como la muestra Gmail en la pastilla y en los menús. */
  ruta: string;
  tieneHijas: boolean;
  /** Los ids de sus madres, de la más cercana a la raíz. */
  ancestros: string[];
}

/** Las etiquetas en el orden de la columna: cada madre seguida de sus hijas,
 *  alfabético en cada nivel.
 *
 *  Una hija cuya madre no llegó (no debería pasar: borrar la madre borra las
 *  hijas) se muestra en el primer nivel en vez de desaparecer. */
export function arbolDeEtiquetas(etiquetas: EtiquetaDeCorreo[]): NodoEtiqueta[] {
  const ids = new Set(etiquetas.map((e) => e.id));
  const hijas = new Map<string | null, EtiquetaDeCorreo[]>();
  for (const e of etiquetas) {
    const madre = e.parentId && ids.has(e.parentId) ? e.parentId : null;
    const lista = hijas.get(madre);
    if (lista) lista.push(e);
    else hijas.set(madre, [e]);
  }
  const orden = (a: EtiquetaDeCorreo, b: EtiquetaDeCorreo) =>
    a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

  const salida: NodoEtiqueta[] = [];
  const vistos = new Set<string>();
  const bajar = (madre: string | null, nivel: number, ruta: string, ancestros: string[]) => {
    for (const e of [...(hijas.get(madre) ?? [])].sort(orden)) {
      // Un ciclo no puede entrar (lo frena un trigger en la base), pero si
      // entrara, la columna no se tiene que colgar.
      if (vistos.has(e.id)) continue;
      vistos.add(e.id);
      const miRuta = ruta ? `${ruta}/${e.nombre}` : e.nombre;
      salida.push({
        etiqueta: e, nivel, ruta: miRuta, ancestros,
        tieneHijas: (hijas.get(e.id) ?? []).length > 0,
      });
      bajar(e.id, nivel + 1, miRuta, [...ancestros, e.id]);
    }
  };
  bajar(null, 0, "", []);
  return salida;
}

/** Qué etiquetas se ven en la columna y cuáles quedan en «Más».
 *
 *  - «Mostrar»: siempre.
 *  - «Mostrar si no están leídas»: solo con algo sin leer en ella o en sus
 *    subetiquetas (si no, una hija con correo nuevo quedaría colgando de una
 *    madre invisible).
 *  - «Ocultar»: nunca, y se lleva a sus subetiquetas.
 *
 *  La etiqueta ABIERTA se ve siempre: ocultarla mientras la mirás te dejaría
 *  sin nada marcado en la columna. Una madre PLEGADA esconde a sus hijas, pero
 *  eso no las manda a «Más» (siguen ahí, detrás de la flecha). */
export function repartirEnColumna(
  nodos: NodoEtiqueta[],
  { noLeidos, etiquetaVista, plegadas }: {
    noLeidos: Map<string, number> | undefined;
    etiquetaVista: string | null;
    plegadas: Set<string>;
  },
): { arriba: NodoEtiqueta[]; enMas: NodoEtiqueta[] } {
  const porId = new Map(nodos.map((n) => [n.etiqueta.id, n.etiqueta]));
  const sinLeerRama = new Map<string, number>();
  for (const n of nodos) {
    const propio = noLeidos?.get(n.etiqueta.id) ?? 0;
    if (!propio) continue;
    for (const id of [n.etiqueta.id, ...n.ancestros]) {
      sinLeerRama.set(id, (sinLeerRama.get(id) ?? 0) + propio);
    }
  }
  const pasa = (e: EtiquetaDeCorreo) =>
    e.enListaEtiquetas === "mostrar" ||
    (e.enListaEtiquetas === "si_no_leidas" && (sinLeerRama.get(e.id) ?? 0) > 0);

  const arriba: NodoEtiqueta[] = [];
  const enMas: NodoEtiqueta[] = [];
  for (const n of nodos) {
    const abierta = n.etiqueta.id === etiquetaVista;
    const madres = n.ancestros.map((id) => porId.get(id)).filter(Boolean) as EtiquetaDeCorreo[];
    if (!abierta && !(pasa(n.etiqueta) && madres.every(pasa))) {
      enMas.push(n);
      continue;
    }
    if (!abierta && n.ancestros.some((id) => plegadas.has(id))) continue;
    arriba.push(n);
  }
  return { arriba, enMas };
}

/** Ella y todas sus subetiquetas, a cualquier profundidad. Sirve para no
 *  ofrecer «anidar en» una de sus propias hijas (sería un ciclo). */
export function ramaDe(id: string, etiquetas: EtiquetaDeCorreo[]): Set<string> {
  const rama = new Set([id]);
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const e of etiquetas) {
      if (e.parentId && rama.has(e.parentId) && !rama.has(e.id)) {
        rama.add(e.id);
        crecio = true;
      }
    }
  }
  return rama;
}

export function useEtiquetasPorCorreo() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-message-labels", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await tabla("mail_message_labels")
        .select("message_id, label_id").limit(5000);
      if (error) throw error;
      const mapa = new Map<string, string[]>();
      for (const f of (data ?? []) as unknown as { message_id: string; label_id: string }[]) {
        const ya = mapa.get(f.message_id);
        if (ya) ya.push(f.label_id);
        else mapa.set(f.message_id, [f.label_id]);
      }
      return mapa;
    },
  });
}

export function useCrearEtiqueta() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      { nombre, parentId = null }: { nombre: string; parentId?: string | null },
    ) => {
      // Sin color, como una etiqueta nueva de Gmail: el color se elige después
      // desde el ⋮.
      const { data, error } = await tabla("mail_labels")
        .insert({ nombre: nombre.trim(), parent_id: parentId, user_id: user?.id } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as unknown as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-labels"] }),
  });
}

export interface CambiosDeEtiqueta {
  nombre?: string;
  parentId?: string | null;
  /** Null = «Eliminar color». */
  color?: ParDeColores | null;
  enListaEtiquetas?: EnListaEtiquetas;
  enListaMensajes?: boolean;
}

/** Todo lo del menú ⋮ que no es borrar: color, mostrar/ocultar, renombrar y
 *  cambiar de madre.
 *
 *  Se aplica en la caché ANTES de que conteste la base: elegir un color o
 *  «Ocultar» tiene que verse al instante, como en Gmail. Si la base lo
 *  rechaza, se vuelve a lo de antes. */
export function useActualizarEtiqueta() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const clave = ["mail-labels", user?.id];
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: CambiosDeEtiqueta }) => {
      const fila: Record<string, unknown> = {};
      if (cambios.nombre !== undefined) fila.nombre = cambios.nombre.trim();
      if (cambios.parentId !== undefined) fila.parent_id = cambios.parentId;
      if (cambios.color !== undefined) {
        fila.bg_color = cambios.color?.fondo ?? null;
        fila.text_color = cambios.color?.texto ?? null;
      }
      if (cambios.enListaEtiquetas !== undefined) fila.en_lista_etiquetas = cambios.enListaEtiquetas;
      if (cambios.enListaMensajes !== undefined) fila.en_lista_mensajes = cambios.enListaMensajes;
      const { error } = await tabla("mail_labels").update(fila as never).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, cambios }) => {
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<EtiquetaDeCorreo[]>(clave);
      qc.setQueryData<EtiquetaDeCorreo[]>(clave, (viejas) =>
        viejas?.map((e) => (e.id === id ? { ...e, ...cambios, nombre: cambios.nombre?.trim() ?? e.nombre } : e)),
      );
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(clave, ctx.antes);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["mail-labels"] }),
  });
}

export function useBorrarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabla("mail_labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-labels"] });
      // Las asignaciones (y las subetiquetas) se van con ON DELETE CASCADE; el
      // mapa en memoria no.
      qc.invalidateQueries({ queryKey: ["mail-message-labels"] });
      qc.invalidateQueries({ queryKey: ["mail-labels-unread"] });
    },
  });
}

/** Pone o saca una etiqueta de varios correos de una.
 *
 *  ⚠️ Por `message_id` y NO por (carpeta, uid): el uid CAMBIA al mover el
 *  correo de carpeta, así que una etiqueta atada al uid se perdería la primera
 *  vez que alguien lo archiva — o peor, la heredaría otro mensaje que reciba
 *  ese uid después. */
export function useEtiquetarCorreos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      { messageIds, labelId, poner }:
      { messageIds: string[]; labelId: string; poner: boolean },
    ) => {
      const ids = messageIds.filter(Boolean);
      if (!ids.length) throw new Error("Estos correos no tienen identificador; abre la carpeta de nuevo e inténtalo.");
      if (poner) {
        const { error } = await tabla("mail_message_labels").upsert(
          ids.map((m) => ({ user_id: user?.id, message_id: m, label_id: labelId })) as never,
          { onConflict: "user_id,message_id,label_id" },
        );
        if (error) throw error;
      } else {
        const { error } = await tabla("mail_message_labels")
          .delete().eq("label_id", labelId).in("message_id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-message-labels"] }),
  });
}

/** Los correos que tienen una etiqueta, de CUALQUIER carpeta.
 *
 *  ⚠️ Una etiqueta no es una carpeta: cruza todas. Un correo etiquetado
 *  "Pagos" y después archivado sigue estando en "Pagos" — si esto filtrara por
 *  carpeta, desaparecería de su etiqueta al archivarlo, que es justo lo que
 *  uno NO espera de una etiqueta.
 *
 *  Va en dos consultas y no en un join: PostgREST puede anidar, pero la
 *  relación es por `message_id` (texto) y no por una FK, así que no hay
 *  relación declarada que seguir. */
export function useCorreosDeEtiqueta(labelId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-por-etiqueta", labelId, user?.id],
    enabled: !!labelId && !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rel, error: e1 } = await tabla("mail_message_labels")
        .select("message_id").eq("label_id", labelId!).limit(500);
      if (e1) throw e1;
      const ids = ((rel ?? []) as unknown as { message_id: string }[])
        .map((r) => r.message_id);
      if (!ids.length) return [];

      const { data, error } = await supabase
        .from("mail_messages" as never)
        .select(
          "id, uid, folder, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id, in_reply_to, refs",
        )
        .in("message_id", ids)
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      // El mismo correo está en la caché de cada buzón que lo recibió; y si
      // alguien tiene una copia en dos carpetas, aparecería dos veces. Se
      // deja UNA por message_id, la más nueva.
      const vistos = new Set<string>();
      return ((data ?? []) as unknown as Record<string, unknown>[]).filter((m) => {
        const k = String(m.message_id ?? m.id);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    },
  });
}

/** Cuántos SIN LEER tiene cada etiqueta, para el número de la columna.
 *
 *  Va en una consulta aparte y no pegado a `useEtiquetas` porque cambia mucho
 *  más seguido: las etiquetas casi nunca, los no leídos con cada correo que
 *  llega. Juntarlas obligaría a re-traer la lista de etiquetas todo el tiempo. */
export function useNoLeidosPorEtiqueta() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-labels-unread", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data: rel, error } = await tabla("mail_message_labels")
        .select("label_id, message_id").limit(5000);
      if (error) throw error;
      const filas = (rel ?? []) as unknown as { label_id: string; message_id: string }[];
      if (!filas.length) return new Map();

      // Las copias de los etiquetados, leídas o no. Se pregunta por los
      // etiquetados y no por todos: la bandeja tiene miles y las etiquetas,
      // decenas.
      const ids = [...new Set(filas.map((f) => f.message_id))];
      const { data: copias } = await supabase
        .from("mail_messages" as never)
        .select("message_id, unread")
        .in("message_id", ids)
        .limit(10000);
      return contarNoLeidosPorEtiqueta(filas, (copias ?? []) as unknown as { message_id: string; unread: boolean }[]);
    },
  });
}

/** Cuántos sin leer tiene cada etiqueta.
 *
 *  ⚠️ UN CORREO CON UNA COPIA LEÍDA ESTÁ LEÍDO (Keila, 08/10: «los abro varias
 *  veces pero no se quita eso»). En su buzón había dos copias del MISMO correo
 *  en Archivo —la que envió y la que recibió, archivadas juntas—; abría una y la
 *  otra seguía sin leer, y esa contaba para siempre. Ahora leer marca todas las
 *  copias (useMarkSeen), y acá, por si quedó alguna vieja, basta con que una
 *  esté leída.
 *
 *  Por message_id ÚNICO y no por fila: contar filas contaría dos veces lo que
 *  tiene dos copias. */
export function contarNoLeidosPorEtiqueta(
  relaciones: { label_id: string; message_id: string }[],
  copias: { message_id: string; unread: boolean }[],
): Map<string, number> {
  const conCopiaSinLeer = new Set<string>();
  const conCopiaLeida = new Set<string>();
  for (const c of copias) (c.unread ? conCopiaSinLeer : conCopiaLeida).add(c.message_id);

  const cuenta = new Map<string, number>();
  const yaContado = new Set<string>();
  for (const f of relaciones) {
    const clave = `${f.label_id}|${f.message_id}`;
    if (yaContado.has(clave) || !conCopiaSinLeer.has(f.message_id) || conCopiaLeida.has(f.message_id)) continue;
    yaContado.add(clave);
    cuenta.set(f.label_id, (cuenta.get(f.label_id) ?? 0) + 1);
  }
  return cuenta;
}
