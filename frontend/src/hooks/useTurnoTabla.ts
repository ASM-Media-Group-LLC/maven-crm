import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cargarHorarios } from "@/lib/horarioEmpleado";
import { useFotosDe } from "@/hooks/useHoyDelEquipo";
import {
  armarFila, apareceEnElDia, peor, sumarDias,
  type Aviso, type EntradaPersona, type FilaTurno, type Marca, type Pausa, type Segmento,
} from "@/lib/turnoTabla";

// LA TABLA DEL TURNO (25/11/2026). Lee, para UN día, las tablas que ya llenan
// Cowork y Argos y arma una fila por persona (lib/turnoTabla.ts). No escribe
// nada. Cada tabla ya tiene su RLS: quien mira solo recibe a la gente que hoy
// puede vigilar en Argos (dueño y admins todos, RR. HH. todos menos admins,
// supervisores su equipo). La lista de gente sale de argos_vigilables(), la
// misma que usa Jornada.
//
// Un fallo se dice como fallo: nunca «nadie llegó tarde» porque algo no cargó.

type Db = {
  rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};
const db = supabase as unknown as Db;

const PAGINA = 1000;

/** Lee todas las filas (de a 1.000: PostgREST corta ahí) de una consulta. */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await armar(i * PAGINA, i * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);

export interface DatosTurno {
  dia: string;
  filas: FilaTurno[];
  /** Momento en que se calcularon (para «actualizado a las…»). */
  calculadoAt: number;
  /** ¿Se pudo leer la tabla de días libres? (false = todavía no existe en la base). */
  diaLibreListo?: boolean;
}

export function useTurnoTabla(dia: string, esHoy: boolean, habilitado = true) {
  const q = useQuery<DatosTurno>({
    enabled: habilitado,
    queryKey: ["argos-turno-tabla", dia],
    refetchInterval: esHoy ? 60_000 : false,
    staleTime: esHoy ? 30_000 : 5 * 60_000,
    queryFn: async () => {
      // 1) La gente que quien mira puede vigilar.
      const vig = await db.rpc("argos_vigilables");
      if (vig.error) throw new Error(vig.error.message);
      const ids = [...new Set(((vig.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))];
      if (!ids.length) return { dia, filas: [], calculadoAt: Date.now() };

      // 2) Nombres, horario de ESE día y tope de comida y baño de cada uno.
      const [perfiles, horarios, pausasPlan, sinCowork] = await Promise.all([
        db.from("profiles").select("id, full_name, deleted_at").in("id", ids),
        cargarHorarios(ids, dia),
        db.rpc("pausas_del_equipo"),
        // SIN COWORK, SIN HORARIO (Alvaro, 27/11/2026): a quien no debe estar en
        // Cowork no se le pide horario; su entrada y salida son su primera y última
        // conexión. Si la función no está, todos se ven como antes.
        db.rpc("argos_sin_cowork_de", { _ids: ids }),
      ]);
      const sinHorario = new Set<string>(sinCowork.error ? [] : ((sinCowork.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
      if (perfiles.error) throw new Error(perfiles.error.message);
      const nombres = new Map<string, string>();
      for (const p of (perfiles.data ?? []) as Array<{ id: string; full_name: string | null; deleted_at: string | null }>) {
        if (!p.deleted_at) nombres.set(p.id, p.full_name ?? "—");
      }
      // Si el plan de pausas no carga, se usa el de siempre (30 + 10): es un tope, no una lista.
      const plan = new Map<string, { comida_min: number; bano_min: number }>();
      if (!pausasPlan.error) for (const r of (pausasPlan.data ?? []) as Array<{ user_id: string; comida_min: number; bano_min: number }>) plan.set(r.user_id, r);

      // 3) Una sola ventana para todos: desde una hora antes del día hasta el
      //    mediodía siguiente (turnos que cruzan la medianoche).
      const desde = iso(Date.parse(`${dia}T00:00:00-05:00`) - 60 * 60_000);
      const hasta = iso(Date.parse(`${sumarDias(dia, 1)}T12:00:00-05:00`));
      const gente = [...nombres.keys()];

      const [segs, pausas, avisos, marcas] = await Promise.all([
        todas<{ user_id: string; estado: string; started_at: string; ended_at: string | null; last_seen_at: string | null }>((a, b) =>
          db.from("cowork_tiempo_segmentos").select("user_id, estado, started_at, ended_at, last_seen_at")
            .in("user_id", gente).gte("started_at", desde).lt("started_at", hasta).order("started_at").range(a, b)),
        todas<{ user_id: string; kind: string; started_at: string; ended_at: string | null; auto_closed: boolean | null }>((a, b) =>
          db.from("cowork_breaks").select("user_id, kind, started_at, ended_at, auto_closed")
            .in("user_id", gente).gte("started_at", desde).lt("started_at", hasta).order("started_at").range(a, b)),
        // «*»: las frases (27/11/2026) llegan solas cuando la columna exista.
        todas<{ user_id: string; tipo: string; mensaje: string | null; avisado_at: string; escalado_at: string | null; cerrado_at: string | null; frases?: string[] | null }>((a, b) =>
          db.from("argos_nudges").select("*")
            .in("user_id", gente).gte("avisado_at", desde).lt("avisado_at", hasta).order("avisado_at").range(a, b)),
        todas<{ user_id: string; inicio: string; fin: string | null; cierre: string | null }>((a, b) =>
          db.from("turno_marcas").select("user_id, inicio, fin, cierre")
            .in("user_id", gente).gte("inicio", desde).lt("inicio", hasta).order("inicio").range(a, b)),
      ]);

      const porPersona = <T extends { user_id: string }>(xs: T[]) => {
        const m = new Map<string, T[]>();
        for (const x of xs) { const a = m.get(x.user_id) ?? []; a.push(x); m.set(x.user_id, a); }
        return m;
      };
      const segsDe = porPersona(segs), pausasDe = porPersona(pausas), avisosDe = porPersona(avisos), marcasDe = porPersona(marcas);
      const ahora = Date.now();

      const filas: FilaTurno[] = [];
      for (const id of gente) {
        const hBase = horarios.get(id);
        // Sin Cowork y sin horario confirmado: sin turno (no hay tarde, ni «atrás»).
        const libreDeHorario = sinHorario.has(id) && !hBase?.confirmado;
        const h = libreDeHorario ? undefined : hBase;
        const pl = plan.get(id);
        const entrada: EntradaPersona = {
          userId: id,
          nombre: nombres.get(id) ?? "—",
          horario: {
            entrada: h?.entrada ?? null,
            salida: h?.salida ?? null,
            toleranciaMin: h?.toleranciaMin ?? 5,
            confirmado: h?.confirmado ?? false,
            comidaMin: pl?.comida_min ?? 30,
            banoMin: pl?.bano_min ?? 10,
          },
          segmentos: (segsDe.get(id) ?? []).map((s): Segmento => ({
            estado: s.estado, inicio: ms(s.started_at), fin: ms(s.ended_at ?? s.last_seen_at),
          })).filter((s) => Number.isFinite(s.inicio) && Number.isFinite(s.fin)),
          pausas: (pausasDe.get(id) ?? []).map((b): Pausa => ({
            kind: b.kind, inicio: ms(b.started_at), fin: b.ended_at ? ms(b.ended_at) : null, autoCerrada: !!b.auto_closed,
          })),
          avisos: (avisosDe.get(id) ?? []).map((n): Aviso => ({
            tipo: n.tipo, at: ms(n.avisado_at), escalado: !!n.escalado_at, cerrado: !!n.cerrado_at,
            cerradoAt: n.cerrado_at ? ms(n.cerrado_at) : null, mensaje: n.mensaje ?? null,
            frases: Array.isArray(n.frases) ? n.frases : [],
          })),
          marcas: (marcasDe.get(id) ?? []).map((m): Marca => ({
            inicio: ms(m.inicio), fin: m.fin ? ms(m.fin) : null, cierre: m.cierre,
          })),
        };
        // Lo de otro día no entra: armarFila mira a cada persona solo dentro de su ventana.
        const fila = armarFila(dia, entrada, ahora);
        if (libreDeHorario) fila.sinHorario = true;
        if (apareceEnElDia(fila)) filas.push(fila);
      }
      // Quien «no vino» y tampoco entró a Cowork en los 14 días anteriores va aparte
      // (Alvaro, 26/11/2026): son cuentas sin uso o días libres mal puestos.
      const desde14 = iso(Date.parse(`${sumarDias(dia, -14)}T00:00:00-05:00`));
      const hasta1 = iso(Date.parse(`${sumarDias(dia, 1)}T00:00:00-05:00`));
      // También quien aún no llega (turno empezado): una cuenta sin uso no cuenta.
      const ausentes = filas.filter((f) => f.noVino || (f.llegada == null && f.noLlegaMin != null));
      const activos = await Promise.all(ausentes.map(async (f) => {
        const r = await db.from("cowork_tiempo_segmentos").select("id").eq("user_id", f.userId)
          .gte("started_at", desde14).lt("started_at", hasta1).limit(1);
        // Si la consulta falla no se sabe: se deja como «no vino» (no se esconde a nadie).
        return r.error ? true : (r.data ?? []).length > 0;
      }));
      ausentes.forEach((f, i) => { if (!activos[i]) f.inactivo = true; });

      const ids2 = filas.map((f) => f.userId);
      const [libres, tardes, cierres, gracias, fueraHora] = await Promise.all([
        // DÍA LIBRE (27/11/2026): lo marcado por RR. HH. o el supervisor. Si la tabla
        // todavía no existe o falla, nadie sale como libre (se ve igual que antes).
        db.from("argos_dia_libre").select("user_id, motivo").eq("dia", dia).in("user_id", ids2),
        // LO NORMAL: tardanzas de los 6 días anteriores (tardanzas_registro) y horas
        // conectado de los turnos cerrados de la semana anterior (argos_gracia_cierre).
        db.from("tardanzas_registro").select("user_id, dia").in("user_id", ids2).gte("dia", sumarDias(dia, -6)).lt("dia", dia),
        db.from("argos_gracia_cierre").select("user_id, turno, conectado_min").in("user_id", ids2).gte("turno", sumarDias(dia, -7)).lt("turno", dia),
        // La gracia de cada uno (empresa o Posición). Sin la función todavía, 10.
        db.rpc("argos_gracia_minutos_de", { _ids: ids2 }),
        // COMER FUERA DE SU HORA (27/11/2026): solo si la hora es obligatoria. Si la
        // función falla o no existe, no se marca a nadie (se ve como antes).
        db.rpc("argos_comida_fuera_de_hora", { _ids: ids2, _dia: dia }),
      ]);
      const fueraHoraDe = new Map<string, number>();
      if (!fueraHora.error) for (const r of (fueraHora.data ?? []) as Array<{ user_id: string; minutos: number | null }>) {
        if (r.minutos != null) fueraHoraDe.set(r.user_id, r.minutos);
      }
      const graciaDe = new Map<string, number>();
      if (!gracias.error) for (const r of (gracias.data ?? []) as Array<{ user_id: string; minutos: number }>) graciaDe.set(r.user_id, r.minutos);
      const libreDe = new Map<string, string | null>();
      if (!libres.error) for (const r of (libres.data ?? []) as Array<{ user_id: string; motivo: string | null }>) libreDe.set(r.user_id, r.motivo);
      const tardesDe = new Map<string, Set<string>>();
      if (!tardes.error) for (const r of (tardes.data ?? []) as Array<{ user_id: string; dia: string }>) {
        const x = tardesDe.get(r.user_id) ?? new Set<string>(); x.add(r.dia); tardesDe.set(r.user_id, x);
      }
      const horasDe = new Map<string, number[]>();
      if (!cierres.error) for (const r of (cierres.data ?? []) as Array<{ user_id: string; conectado_min: number | null }>) {
        if (!r.conectado_min) continue;
        const x = horasDe.get(r.user_id) ?? []; x.push(r.conectado_min); horasDe.set(r.user_id, x);
      }
      for (const f of filas) {
        f.graciaMin = graciaDe.get(f.userId) ?? 10;
        const fh = fueraHoraDe.get(f.userId);
        f.comidaFueraHoraMin = fh ?? null;
        // Aviso amarillo, sin descontar (Alvaro, 27/11/2026).
        if (fh && fh > 0) { f.motivos.push({ k: "comidaHora", min: fh }); f.nivel = peor(f.nivel, "ambar"); }
        if (libreDe.has(f.userId)) {
          f.diaLibre = { motivo: libreDe.get(f.userId) ?? null };
          if (f.llegada == null) { f.nivel = "ok"; f.motivos = []; f.noVino = false; }
        }
        const hs = horasDe.get(f.userId);
        f.costumbre = (tardes.error && cierres.error) ? null : {
          tardesSemana: tardesDe.get(f.userId)?.size ?? 0,
          conectadoPromedio: hs?.length ? Math.round(hs.reduce((x, y) => x + y, 0) / hs.length) : null,
        };
      }
      return { dia, filas, calculadoAt: ahora, diaLibreListo: !libres.error };
    },
  });

  const ids = useMemo(() => (q.data?.filas ?? []).map((f) => f.userId), [q.data]);
  const fotos = useFotosDe(ids).data ?? {};
  return { ...q, fotos };
}
