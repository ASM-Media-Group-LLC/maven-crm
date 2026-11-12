import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlsDeNas } from "@/hooks/useMonitorEventos";
import {
  calcularJornada, semanaDe, sumarDias, type Jornada, type JornadaCruda,
} from "@/lib/argosJornada";
import { armarMomentos, type ClipArgos, type FotoArgos, type Momento } from "@/lib/argosMomentos";

// Los datos de «Argos minuto a minuto» (Alvaro, 11/11/2026). La base entrega lo
// crudo (argos_jornada_cruda, solo a quien puede vigilar a la persona) y
// lib/argosJornada.ts hace la cuenta. Los pantallazos y videos del turno se leen
// aparte (la RLS ya deja verlos a quien puede vigilar) y se firman de una vez.
// Un fallo se dice como fallo: nunca se muestra como «día vacío».

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

const MAX_FOTOS = 1500;

async function leerCruda(uid: string, desde: string, hasta: string, conEquipo: boolean): Promise<JornadaCruda> {
  const { data, error } = await (supabase as unknown as RpcDb).rpc("argos_jornada_cruda", {
    _uid: uid, _desde: desde, _hasta: hasta, _con_equipo: conEquipo,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("argos_jornada_cruda");
  return data as JornadaCruda;
}

export interface DiaArgos {
  cruda: JornadaCruda;
  jornada: Jornada;
  equipo: Jornada[];
  nombre: string;
}

/** El turno de una persona en un día + el de sus compañeros de equipo. */
export function useArgosDia(uid: string | null, fecha: string) {
  const q = useQuery({
    enabled: !!uid,
    queryKey: ["argos-dia", uid, fecha],
    staleTime: 30_000,
    retry: 1,
    // Hoy se vuelve a leer cada minuto (el turno sigue corriendo).
    refetchInterval: (query) => {
      const d = query.state.data as DiaArgos | undefined;
      return d?.jornada.enCurso ? 60_000 : false;
    },
    queryFn: async (): Promise<DiaArgos> => {
      const cruda = await leerCruda(uid!, fecha, fecha, true);
      const ahora = Date.parse(cruda.ahora) || Date.now();
      const objetivo = cruda.personas.find((p) => p.objetivo);
      if (!objetivo) throw new Error("argos_jornada_cruda: sin persona");
      const jornada = calcularJornada(objetivo, fecha, cruda.limites, ahora);
      const equipo = cruda.personas.filter((p) => !p.objetivo).map((p) => calcularJornada(p, fecha, cruda.limites, ahora));
      return { cruda, jornada, equipo, nombre: objetivo.nombre ?? "" };
    },
  });
  return { dia: q.data ?? null, cargando: q.isLoading, error: (q.error as Error | null) ?? null, reintentar: () => { void q.refetch(); } };
}

export interface EvidenciaDia { momentos: Momento[]; clips: ClipArgos[] }

/** Los pantallazos (con su cámara) y los videos dentro del turno, ya firmados. */
export function useEvidenciaDia(uid: string | null, jornada: Jornada | null) {
  const desde = jornada ? new Date(jornada.inicio).toISOString() : null;
  const hasta = jornada ? new Date(Math.max(jornada.fin, jornada.inicio + 60_000)).toISOString() : null;
  const q = useQuery({
    enabled: !!uid && !!desde && !!hasta,
    queryKey: ["argos-evidencia", uid, desde, hasta],
    staleTime: 60_000,
    retry: 1,
    refetchInterval: jornada?.enCurso ? 120_000 : false,
    queryFn: async (): Promise<EvidenciaDia> => {
      const [fotosRes, clipsRes] = await Promise.all([
        sinTipar.from("monitor_capturas")
          .select("id, tipo, path, en_nas, nas_path, created_at, veredicto, fuera_de_lugar, cara_visible, perdonado")
          .eq("user_id", uid).gte("created_at", desde).lt("created_at", hasta)
          .order("created_at", { ascending: true }).limit(MAX_FOTOS),
        sinTipar.from("argos_clips").select("id, motivo, started_at, ended_at, duracion_seg, path, en_nas")
          .eq("user_id", uid).gte("started_at", desde).lt("started_at", hasta)
          .order("started_at", { ascending: true }).limit(100),
      ]);
      const fallo = fotosRes.error ?? clipsRes.error;
      if (fallo) throw new Error(fallo.message);

      type FilaFoto = { id: string; tipo: string; path: string | null; en_nas: boolean | null; nas_path: string | null; created_at: string;
        veredicto: string | null; fuera_de_lugar: boolean | null; cara_visible: boolean | null; perdonado: boolean | null };
      type FilaClip = { id: string; motivo: string | null; started_at: string; ended_at: string | null; duracion_seg: number | null; path: string; en_nas: boolean | null };
      const fotos = (fotosRes.data ?? []) as FilaFoto[];
      const clips = (clipsRes.data ?? []) as FilaClip[];

      const delBuzon = fotos.filter((f) => !f.en_nas && f.path).map((f) => f.path as string);
      const delNas = fotos.filter((f) => f.en_nas && f.nas_path).map((f) => f.nas_path as string);
      const rutasClip = clips.filter((c) => !c.en_nas).map((c) => c.path);
      const [firmas, nas, firmasClip] = await Promise.all([
        delBuzon.length ? supabase.storage.from("monitor-capturas").createSignedUrls(delBuzon, 3600) : Promise.resolve({ data: [], error: null }),
        urlsDeNas(delNas),
        rutasClip.length ? supabase.storage.from("argos-clips").createSignedUrls(rutasClip, 3600) : Promise.resolve({ data: [], error: null }),
      ]);
      const url = new Map((firmas.data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl]));
      const urlClip = new Map((firmasClip.data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl]));

      const aFoto = (f: FilaFoto): FotoArgos => ({
        id: f.id,
        tipo: f.tipo === "camara" ? "camara" : "pantalla",
        url: f.en_nas ? (f.nas_path ? nas[f.nas_path] ?? null : null) : (f.path ? url.get(f.path) ?? null : null),
        at: f.created_at,
        veredicto: f.veredicto,
        fueraDeLugar: f.fuera_de_lugar,
        caraVisible: f.cara_visible,
        perdonado: f.perdonado === true,
      });
      return {
        momentos: armarMomentos(fotos.map(aFoto)),
        clips: clips.map((c) => ({
          id: c.id, url: c.en_nas ? null : urlClip.get(c.path) ?? null, motivo: c.motivo,
          desde: c.started_at, hasta: c.ended_at, duracionSeg: c.duracion_seg,
        })),
      };
    },
  });
  return { evidencia: q.data ?? null, cargando: q.isLoading, error: (q.error as Error | null) ?? null, reintentar: () => { void q.refetch(); } };
}

/** La semana de lunes a domingo de una persona. */
export function useArgosSemana(uid: string | null, lunes: string, habilitado: boolean) {
  const q = useQuery({
    enabled: habilitado && !!uid,
    queryKey: ["argos-semana", uid, lunes],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<{ dias: Jornada[]; nombre: string }> => {
      const cruda = await leerCruda(uid!, lunes, sumarDias(lunes, 6), false);
      const ahora = Date.parse(cruda.ahora) || Date.now();
      const p = cruda.personas.find((x) => x.objetivo);
      if (!p) throw new Error("argos_jornada_cruda: sin persona");
      return { dias: semanaDe(p, lunes, cruda.limites, ahora), nombre: p.nombre ?? "" };
    },
  });
  const dias = useMemo(() => q.data?.dias ?? null, [q.data]);
  return { dias, cargando: q.isLoading, error: (q.error as Error | null) ?? null, reintentar: () => { void q.refetch(); } };
}
