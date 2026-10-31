import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// EL RONDÍN EN VIVO de Argos (reemplazo de Hubstaff): qué hace CADA persona
// AHORA MISMO. Argos "pasa" dejando un latido en monitor_rondas; acá juntamos
// ese latido con las pausas abiertas y las faltas recientes para decir, por
// persona, su estado en vivo:
//   en cámara trabajando · presente · en pausa (baño/break/almuerzo) ·
//   en el celular · distraído · no mira · cámara apagada · fuera del puesto.
// Se refresca solo cada 15 s. Lo ven supervisor+ (lo fuerza la RLS de las
// tablas: monitor_rondas, cowork_breaks, monitor_eventos).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export type EstadoVivo =
  | "trabajando" | "presente" | "pausa"
  | "celular" | "distraido" | "no_mira" | "camara_apagada" | "se_fue"
  | "ausente";

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
const PROBLEMA: EstadoVivo[] = ["celular", "distraido", "no_mira", "camara_apagada", "se_fue"];
// Orden en la lista: primero lo que hay que mirar, el que trabaja bien al final.
const RANK: Record<EstadoVivo, number> = {
  celular: 0, se_fue: 0, camara_apagada: 1, distraido: 1, no_mira: 1,
  pausa: 2, presente: 3, ausente: 4, trabajando: 5,
};

export function useRondinVivo() {
  const q = useQuery({
    queryKey: ["rondin-vivo"],
    staleTime: 10_000,
    refetchInterval: 15_000, // el rondín en vivo se refresca solo cada 15 s
    queryFn: async (): Promise<{ personas: PersonaRondin[]; resumen: ResumenRondin }> => {
      const ahora = Date.now();
      const frescoISO = new Date(ahora - FRESCO_MS).toISOString();

      const [rondasRes, breaksRes, eventosRes] = await Promise.all([
        sinTipar.from("monitor_rondas").select("user_id, last_at, trabajando, presente").order("last_at", { ascending: false }).limit(300),
        // pausas abiertas = sin cerrar
        sinTipar.from("cowork_breaks").select("user_id, kind, started_at").is("ended_at", null).limit(300),
        // faltas de los últimos 5 min (lo que está pasando ahora)
        sinTipar.from("monitor_eventos").select("user_id, tipo, created_at").gte("created_at", frescoISO).neq("estado", "descartado").order("created_at", { ascending: false }).limit(300),
      ]);

      const rondas = (rondasRes.data ?? []) as Array<{ user_id: string; last_at: string; trabajando: boolean | null; presente: boolean | null }>;
      const breaks = (breaksRes.data ?? []) as Array<{ user_id: string; kind: string; started_at: string }>;
      const eventos = (eventosRes.data ?? []) as Array<{ user_id: string; tipo: string; created_at: string }>;

      // Última ronda por persona (rondas ya viene ordenado desc).
      const rondaPor = new Map<string, { last_at: string; trabajando: boolean | null; presente: boolean | null }>();
      for (const r of rondas) if (!rondaPor.has(r.user_id)) rondaPor.set(r.user_id, r);

      // Pausa abierta por persona (la más reciente).
      const pausaPor = new Map<string, { kind: PausaKind; started_at: string }>();
      for (const b of breaks) {
        const k = b.kind as PausaKind;
        if (!pausaPor.has(b.user_id)) pausaPor.set(b.user_id, { kind: k, started_at: b.started_at });
      }

      // Falta seria más reciente por persona (en la ventana fresca).
      const faltaPor = new Map<string, { tipo: EstadoVivo; created_at: string }>();
      for (const e of eventos) {
        if (!PROBLEMA.includes(e.tipo as EstadoVivo)) continue;
        if (!faltaPor.has(e.user_id)) faltaPor.set(e.user_id, { tipo: e.tipo as EstadoVivo, created_at: e.created_at });
      }

      // Roster: visto en los últimos 40 min (ronda reciente) o con pausa abierta.
      const corteRoster = ahora - ROSTER_MS;
      const ids = new Set<string>();
      for (const [id, r] of rondaPor) if (new Date(r.last_at).getTime() > corteRoster) ids.add(id);
      for (const id of pausaPor.keys()) ids.add(id);
      if (ids.size === 0) {
        return { personas: [], resumen: { ultimaRonda: rondas[0]?.last_at ? new Date(rondas[0].last_at) : null, total: 0, trabajando: 0, enPausa: 0, conProblema: 0 } };
      }

      const { data: perfiles } = await supabase
        .from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", [...ids]);
      const perfilPor = new Map((perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]));

      const corteFresco = ahora - FRESCO_MS;
      const personas: PersonaRondin[] = [...ids].map((id) => {
        const ronda = rondaPor.get(id);
        const pausa = pausaPor.get(id);
        const falta = faltaPor.get(id);
        const latidoFresco = ronda ? new Date(ronda.last_at).getTime() > corteFresco : false;

        // Prioridad del estado en vivo: pausa > falta reciente > latido > ausente.
        let estado: EstadoVivo;
        let desde: string;
        let pausaKind: PausaKind | null = null;
        if (pausa) {
          estado = "pausa"; pausaKind = pausa.kind; desde = pausa.started_at;
        } else if (falta) {
          estado = falta.tipo; desde = falta.created_at;
        } else if (latidoFresco && ronda) {
          estado = ronda.trabajando ? "trabajando" : ronda.presente ? "presente" : "se_fue";
          desde = ronda.last_at;
        } else {
          estado = "ausente"; desde = ronda?.last_at ?? new Date(ahora).toISOString();
        }

        const p = perfilPor.get(id);
        return {
          userId: id,
          nombre: p?.full_name?.trim() || "",
          avatarUrl: p?.avatar_url ?? null,
          avatarSeed: p?.avatar_seed ?? null,
          estado, pausaKind, desde,
          lastAt: ronda?.last_at ?? null,
        };
      });

      personas.sort((a, b) => RANK[a.estado] - RANK[b.estado] || a.nombre.localeCompare(b.nombre, "es"));

      const resumen: ResumenRondin = {
        ultimaRonda: rondas[0]?.last_at ? new Date(rondas[0].last_at) : null,
        total: personas.length,
        trabajando: personas.filter((p) => p.estado === "trabajando").length,
        enPausa: personas.filter((p) => p.estado === "pausa").length,
        conProblema: personas.filter((p) => PROBLEMA.includes(p.estado)).length,
      };
      return { personas, resumen };
    },
  });

  return {
    personas: q.data?.personas ?? [],
    resumen: q.data?.resumen ?? { ultimaRonda: null, total: 0, trabajando: 0, enPausa: 0, conProblema: 0 },
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
