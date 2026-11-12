import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  decidirEstado, estadoDeAlerta, estadoDeFalta, ESTADOS_PROBLEMA, compararMotivos,
  type EstadoVivo, type MotivoVivo,
} from "@/lib/motivosVivos";

export type { EstadoVivo, MotivoVivo } from "@/lib/motivosVivos";

// EL RONDÍN EN VIVO de Argos (reemplazo de Hubstaff): qué hace CADA persona
// AHORA MISMO. Argos "pasa" dejando un latido en monitor_rondas; acá juntamos
// ese latido con las pausas abiertas, las faltas recientes de la cámara, las
// ALERTAS VIVAS de Argos y quién está FUERA DE COWORK en su turno, para decir,
// por persona, su estado en vivo y POR QUÉ (sus motivos):
//   en cámara trabajando · presente · en pausa · pausa de más · en el celular ·
//   distraído · no mira · cámara apagada · fuera del puesto · fuera de lugar ·
//   sin compartir pantalla · fuera de Cowork.
// Hasta el 11/11 solo miraba monitor_eventos, que estuvo vacía: por eso el
// «quién la baja» del Pulso nunca tuvo a nadie (ver lib/motivosVivos.ts).
// Se refresca solo cada 15 s. Lo que cada uno ve lo decide la RLS (dueño, RR. HH.,
// el supervisor su equipo). Un fallo de lectura NO es «nadie»: se propaga.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export type PausaKind = "bano" | "break" | "almuerzo";

export interface PersonaRondin {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  estado: EstadoVivo;
  pausaKind: PausaKind | null;
  /** ISO de cuándo arrancó el estado actual (pausa, falta o último latido). */
  desde: string;
  /** ISO del último latido de Argos para esta persona. */
  lastAt: string | null;
  /** Por qué está como está (de peor a menos mal). Vacío si no hay problema. */
  motivos: MotivoVivo[];
}

export interface ResumenRondin {
  ultimaRonda: Date | null;
  total: number;
  trabajando: number;
  enPausa: number;
  conProblema: number;
}

const FRESCO_MS = 5 * 60 * 1000; // un latido/falta de los últimos 5 min = "ahora"
const ROSTER_MS = 40 * 60 * 1000; // a quién mostramos: visto en los últimos 40 min
// Orden en la lista: primero lo que hay que mirar, el que trabaja bien al final.
const RANK: Record<EstadoVivo, number> = {
  fuera_cowork: 0, celular: 0, se_fue: 0, fuera_de_lugar: 0,
  sin_pantalla: 1, camara_apagada: 1, distraido: 1, no_mira: 1, pausa_de_mas: 1,
  pausa: 2, presente: 3, ausente: 4, trabajando: 5,
};

interface FilaAlerta {
  id: string; user_id: string; tipo: string; gravedad: number | null; detalle: string | null;
  captura_path: string | null; abierta_at: string; revisada_at?: string | null; revisada_por?: string | null;
}
interface FilaFuera { id: string; user_id: string; desde: string; revisado_at?: string | null; revisado_por?: string | null }

/** Las alertas vivas. Con la migración del 11/11 traen «Revisado»; sin ella
 *  (columna inexistente, 42703) se leen sin esas dos columnas. */
async function leerAlertasVivas(): Promise<FilaAlerta[]> {
  const base = "id, user_id, tipo, gravedad, detalle, captura_path, abierta_at";
  const leer = (cols: string) => sinTipar.from("argos_alertas").select(cols).is("cerrada_at", null).limit(500);
  let r = await leer(`${base}, revisada_at, revisada_por`);
  if (r.error?.code === "42703") r = await leer(base);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as FilaAlerta[];
}

async function leerFueraAbiertos(): Promise<FilaFuera[]> {
  const leer = (cols: string) => sinTipar.from("cowork_fuera").select(cols).is("hasta", null).limit(300);
  let r = await leer("id, user_id, desde, revisado_at, revisado_por");
  if (r.error?.code === "42703") r = await leer("id, user_id, desde");
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as FilaFuera[];
}

/** `habilitado = false` no consulta nada (para quien no ve el Pulso). */
export function useRondinVivo(habilitado = true) {
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["rondin-vivo"],
    staleTime: 10_000,
    refetchInterval: 15_000, // el rondín en vivo se refresca solo cada 15 s
    queryFn: async (): Promise<{ personas: PersonaRondin[]; resumen: ResumenRondin }> => {
      const ahora = Date.now();
      const ahoraISO = new Date(ahora).toISOString();
      const frescoISO = new Date(ahora - FRESCO_MS).toISOString();

      const [rondasRes, breaksRes, eventosRes, alertas, fuera] = await Promise.all([
        sinTipar.from("monitor_rondas").select("user_id, last_at, trabajando, presente").order("last_at", { ascending: false }).limit(300),
        // pausas abiertas = sin cerrar
        sinTipar.from("cowork_breaks").select("user_id, kind, started_at").is("ended_at", null).limit(300),
        // faltas de los últimos 5 min (lo que está pasando ahora)
        sinTipar.from("monitor_eventos").select("user_id, tipo, created_at, detalle, captura_path").gte("created_at", frescoISO).neq("estado", "descartado").order("created_at", { ascending: false }).limit(300),
        leerAlertasVivas(),
        leerFueraAbiertos(),
      ]);
      // PostgREST: error ≠ vacío. Un fallo se dice; nunca «todo en orden».
      const fallo = rondasRes.error ?? breaksRes.error ?? eventosRes.error;
      if (fallo) throw new Error(fallo.message);

      const rondas = (rondasRes.data ?? []) as Array<{ user_id: string; last_at: string; trabajando: boolean | null; presente: boolean | null }>;
      const breaks = (breaksRes.data ?? []) as Array<{ user_id: string; kind: string; started_at: string }>;
      const eventos = (eventosRes.data ?? []) as Array<{ user_id: string; tipo: string; created_at: string; detalle: string | null; captura_path: string | null }>;

      // Última ronda por persona (rondas ya viene ordenado desc).
      const rondaPor = new Map<string, { last_at: string; trabajando: boolean | null; presente: boolean | null }>();
      for (const r of rondas) if (!rondaPor.has(r.user_id)) rondaPor.set(r.user_id, r);

      // Pausa abierta por persona (la más reciente).
      const pausaPor = new Map<string, { kind: PausaKind; started_at: string }>();
      for (const b of breaks) {
        const k = b.kind as PausaKind;
        if (!pausaPor.has(b.user_id)) pausaPor.set(b.user_id, { kind: k, started_at: b.started_at });
      }

      // Motivos por persona: alertas vivas de Argos, salida de Cowork y la falta
      // fresca más reciente de la cámara.
      const motivosPor = new Map<string, MotivoVivo[]>();
      const sumar = (uid: string, m: MotivoVivo) => {
        const arr = motivosPor.get(uid) ?? [];
        arr.push(m);
        motivosPor.set(uid, arr);
      };
      for (const a of alertas) {
        const estado = estadoDeAlerta(a.tipo);
        if (!estado) continue;
        sumar(a.user_id, {
          fuente: "argos", estado, tipo: a.tipo, desde: a.abierta_at, detalle: a.detalle,
          gravedad: a.gravedad ?? 2, alertaId: a.id, capturaPath: a.captura_path,
          revisadoAt: a.revisada_at ?? null, revisadoPor: a.revisada_por ?? null,
        });
      }
      for (const f of fuera) {
        sumar(f.user_id, {
          fuente: "fuera", estado: "fuera_cowork", tipo: "fuera_cowork", desde: f.desde, detalle: null,
          gravedad: 3, fueraId: f.id, revisadoAt: f.revisado_at ?? null, revisadoPor: f.revisado_por ?? null,
        });
      }
      const faltaVista = new Set<string>();
      for (const e of eventos) {
        const estado = estadoDeFalta(e.tipo);
        if (!estado || faltaVista.has(e.user_id)) continue;
        faltaVista.add(e.user_id);
        // Si Argos ya abrió una alerta del mismo estado, esa manda (trae su id).
        if ((motivosPor.get(e.user_id) ?? []).some((m) => m.estado === estado)) continue;
        sumar(e.user_id, {
          fuente: "rondin", estado, tipo: e.tipo, desde: e.created_at, detalle: e.detalle,
          gravedad: 2, capturaPath: e.captura_path,
        });
      }

      // Roster: visto en los últimos 40 min (ronda reciente), con pausa abierta o
      // con algún motivo vivo (quien se salió de Cowork no deja latido).
      const corteRoster = ahora - ROSTER_MS;
      const ids = new Set<string>();
      for (const [id, r] of rondaPor) if (new Date(r.last_at).getTime() > corteRoster) ids.add(id);
      for (const id of pausaPor.keys()) ids.add(id);
      for (const id of motivosPor.keys()) ids.add(id);
      if (ids.size === 0) {
        return { personas: [], resumen: { ultimaRonda: rondas[0]?.last_at ? new Date(rondas[0].last_at) : null, total: 0, trabajando: 0, enPausa: 0, conProblema: 0 } };
      }

      const { data: perfiles, error: perfErr } = await supabase
        .from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", [...ids]);
      if (perfErr) throw new Error(perfErr.message);
      const perfilPor = new Map((perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]));

      const corteFresco = ahora - FRESCO_MS;
      const personas: PersonaRondin[] = [...ids].map((id) => {
        const ronda = rondaPor.get(id);
        const pausa = pausaPor.get(id) ?? null;
        const motivos = (motivosPor.get(id) ?? []).sort(compararMotivos);
        const { estado, desde } = decidirEstado({
          motivos,
          pausa,
          latido: ronda ? { ...ronda, fresco: new Date(ronda.last_at).getTime() > corteFresco } : null,
          ahoraISO,
        });
        const p = perfilPor.get(id);
        return {
          userId: id,
          nombre: p?.full_name?.trim() || "",
          avatarUrl: p?.avatar_url ?? null,
          avatarSeed: p?.avatar_seed ?? null,
          estado,
          pausaKind: estado === "pausa" || estado === "pausa_de_mas" ? pausa?.kind ?? null : null,
          desde,
          lastAt: ronda?.last_at ?? null,
          motivos,
        };
      });

      personas.sort((a, b) => RANK[a.estado] - RANK[b.estado] || a.nombre.localeCompare(b.nombre, "es"));

      const resumen: ResumenRondin = {
        ultimaRonda: rondas[0]?.last_at ? new Date(rondas[0].last_at) : null,
        total: personas.length,
        trabajando: personas.filter((p) => p.estado === "trabajando").length,
        enPausa: personas.filter((p) => p.estado === "pausa").length,
        conProblema: personas.filter((p) => ESTADOS_PROBLEMA.includes(p.estado)).length,
      };
      return { personas, resumen };
    },
  });

  return {
    personas: q.data?.personas ?? [],
    resumen: q.data?.resumen ?? { ultimaRonda: null, total: 0, trabajando: 0, enPausa: 0, conProblema: 0 },
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    reintentar: () => { void q.refetch(); },
  };
}
