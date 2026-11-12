import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compararMotivos, estadoDeAlerta, type EstadoVivo, type MotivoVivo } from "@/lib/motivosVivos";

// LO QUE SE VE ARRIBA DE LA VISTA EN VIVO (Alvaro, 11/11/2026): quién es, POR
// QUÉ se abrió (qué vio Argos, desde cuándo y la foto que lo disparó), si sigue
// pasando o ya se cerró, y si alguien ya lo revisó. Se refresca cada 15 s: si la
// alerta se cierra o alguien la revisa, se ve sin recargar.
//
// La razón llega por la url: ?alerta=<argos_alertas.id>, ?fuera=<cowork_fuera.id>
// o ?clip=<argos_clips.id>. Sin ninguna, se toma lo peor que tenga abierto ahora.
// Lo que cada uno puede leer lo decide la RLS; si la base dice que no puedes
// vigilar a esta persona (puede_vigilar), la vista lo dice y no muestra nada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

export type FuenteRazon = "argos" | "fuera" | "clip";

export interface RazonEnVivo {
  fuente: FuenteRazon;
  id: string;
  /** Tipo crudo: el de la alerta, "fuera_cowork" o el motivo del clip. */
  tipo: string;
  estado: EstadoVivo | null;
  detalle: string | null;
  gravedad: number;
  desde: string;
  /** null = sigue pasando. */
  hasta: string | null;
  capturaPath: string | null;
  revisadoAt: string | null;
  revisadoPor: string | null;
  revisadoNombre: string | null;
}

export interface DatosEnVivo {
  /** null = la base no pudo decirlo (se deja pasar: la RLS filtra igual). */
  puedeVer: boolean | null;
  nombre: string;
  razon: RazonEnVivo | null;
  /** Se pidió una razón por la url y no existe (o no es de esta persona). */
  razonNoEncontrada: boolean;
  /** Lo demás que tiene abierto ahora (para «también…»). */
  otras: RazonEnVivo[];
}

interface FilaAlerta {
  id: string; user_id: string; tipo: string; gravedad: number | null; detalle: string | null; captura_path: string | null;
  abierta_at: string; cerrada_at: string | null; revisada_at?: string | null; revisada_por?: string | null;
}
interface FilaFuera { id: string; user_id: string; desde: string; hasta: string | null; revisado_at?: string | null; revisado_por?: string | null }
interface FilaClip { id: string; user_id: string; motivo: string | null; started_at: string; ended_at: string | null }

const COLS_ALERTA = "id, user_id, tipo, gravedad, detalle, captura_path, abierta_at, cerrada_at";
const COLS_FUERA = "id, user_id, desde, hasta";

/** Lee con las columnas de «Revisado»; si la migración aún no está (42703), sin ellas. */
async function conRevisado<T>(leer: (extra: string) => Promise<{ data: T | null; error: { code?: string; message: string } | null }>, extra: string) {
  let r = await leer(extra);
  if (r.error?.code === "42703") r = await leer("");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const deAlerta = (a: FilaAlerta): RazonEnVivo => ({
  fuente: "argos", id: a.id, tipo: a.tipo, estado: estadoDeAlerta(a.tipo), detalle: a.detalle,
  gravedad: a.gravedad ?? 2, desde: a.abierta_at, hasta: a.cerrada_at, capturaPath: a.captura_path,
  revisadoAt: a.revisada_at ?? null, revisadoPor: a.revisada_por ?? null, revisadoNombre: null,
});
const deFuera = (f: FilaFuera): RazonEnVivo => ({
  fuente: "fuera", id: f.id, tipo: "fuera_cowork", estado: "fuera_cowork", detalle: null, gravedad: 3,
  desde: f.desde, hasta: f.hasta, capturaPath: null,
  revisadoAt: f.revisado_at ?? null, revisadoPor: f.revisado_por ?? null, revisadoNombre: null,
});
const deClip = (c: FilaClip): RazonEnVivo => ({
  fuente: "clip", id: c.id, tipo: c.motivo ?? "distraido", estado: estadoDeAlerta(c.motivo ?? "distraido"), detalle: null,
  gravedad: 2, desde: c.started_at, hasta: c.ended_at ?? c.started_at, capturaPath: null,
  revisadoAt: null, revisadoPor: null, revisadoNombre: null,
});

/** Para ordenar razones abiertas con la misma regla que «Quién está bajando». */
const comoMotivo = (r: RazonEnVivo): MotivoVivo => ({
  fuente: r.fuente === "fuera" ? "fuera" : "argos", estado: r.estado ?? "presente", tipo: r.tipo, desde: r.desde,
  detalle: r.detalle, gravedad: r.gravedad, revisadoAt: r.revisadoAt,
});

export function useEnVivoPersona(userId: string | null, pedido: { alertaId: string | null; fueraId: string | null; clipId: string | null }) {
  const q = useQuery({
    enabled: !!userId,
    queryKey: ["en-vivo-persona", userId, pedido.alertaId, pedido.fueraId, pedido.clipId],
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<DatosEnVivo> => {
      const uid = userId!;
      const [permiso, perfil, alertasAbiertas, fueraAbierta] = await Promise.all([
        sinTipar.rpc("puede_vigilar", { _target: uid }),
        sinTipar.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
        conRevisado<FilaAlerta[]>((extra) =>
          sinTipar.from("argos_alertas").select(COLS_ALERTA + extra).eq("user_id", uid).is("cerrada_at", null).limit(20),
        ", revisada_at, revisada_por"),
        conRevisado<FilaFuera[]>((extra) =>
          sinTipar.from("cowork_fuera").select(COLS_FUERA + extra).eq("user_id", uid).is("hasta", null).limit(5),
        ", revisado_at, revisado_por"),
      ]);
      // Sin la función (antes de aplicar la migración) no se concluye «no puedes».
      const puedeVer: boolean | null = permiso.error ? null : permiso.data === true;
      if (puedeVer === false) {
        return { puedeVer, nombre: "", razon: null, razonNoEncontrada: false, otras: [] };
      }
      if (perfil.error) throw new Error(perfil.error.message);

      let razon: RazonEnVivo | null = null;
      let razonNoEncontrada = false;
      if (pedido.alertaId) {
        const a = await conRevisado<FilaAlerta | null>((extra) =>
          sinTipar.from("argos_alertas").select(COLS_ALERTA + extra).eq("id", pedido.alertaId).eq("user_id", uid).maybeSingle(),
        ", revisada_at, revisada_por");
        razon = a ? deAlerta(a) : null;
        razonNoEncontrada = !a;
      } else if (pedido.fueraId) {
        const f = await conRevisado<FilaFuera | null>((extra) =>
          sinTipar.from("cowork_fuera").select(COLS_FUERA + extra).eq("id", pedido.fueraId).eq("user_id", uid).maybeSingle(),
        ", revisado_at, revisado_por");
        razon = f ? deFuera(f) : null;
        razonNoEncontrada = !f;
      } else if (pedido.clipId) {
        const { data, error } = await sinTipar.from("argos_clips").select("id, user_id, motivo, started_at, ended_at")
          .eq("id", pedido.clipId).eq("user_id", uid).maybeSingle();
        if (error) throw new Error(error.message);
        razon = data ? deClip(data as FilaClip) : null;
        razonNoEncontrada = !data;
      }

      // Lo abierto ahora, de peor a menos mal («sin señal» no cuenta como razón
      // principal: es del rastreo, no de la persona).
      const abiertas = [
        ...(alertasAbiertas ?? []).map(deAlerta),
        ...(fueraAbierta ?? []).map(deFuera),
      ].sort((a, b) => compararMotivos(comoMotivo(a), comoMotivo(b)));
      if (!razon && !pedido.alertaId && !pedido.fueraId && !pedido.clipId) {
        razon = abiertas.find((r) => r.estado != null) ?? null;
      }
      const otras = abiertas.filter((r) => r.id !== razon?.id && r.estado != null);

      if (razon?.revisadoPor) {
        const { data } = await supabase.from("profiles").select("full_name").eq("id", razon.revisadoPor).maybeSingle();
        razon = { ...razon, revisadoNombre: data?.full_name?.trim() || null };
      }

      return {
        puedeVer,
        nombre: (perfil.data?.full_name as string | null)?.trim() || "",
        razon,
        razonNoEncontrada,
        otras,
      };
    },
  });
  return {
    datos: q.data ?? null,
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    reintentar: () => { void q.refetch(); },
  };
}

/** URL firmada de la foto que disparó la alerta (bucket monitor-capturas). */
export function useFotoDeLaRazon(path: string | null) {
  const q = useQuery({
    enabled: !!path,
    queryKey: ["foto-razon", path],
    staleTime: 4 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage.from("monitor-capturas").createSignedUrl(path!, 600);
      if (error) return null; // ya se mudó al NAS o no hay permiso: la tarjeta lo dice
      return data?.signedUrl ?? null;
    },
  });
  return { url: q.data ?? null, cargando: q.isLoading };
}
