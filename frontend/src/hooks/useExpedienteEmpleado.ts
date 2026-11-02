import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calcularNota, type Nota } from "@/lib/notaEmpleado";

// EL EXPEDIENTE del empleado (Argos): el mes día por día — qué hizo cada día,
// con su nota, y al abrir un día el detalle (horas, faltas, pausas, pantallazos
// y capturas). Junta datos que ya existen por día: cowork_tiempo_diario (horas),
// monitor_eventos (faltas), cowork_pausas_resumen (pausas) y monitor_capturas
// (pantallazos/cámara). Lo ven supervisor+ (lo fuerza la RLS).

export interface FaltaDia { id: string; tipo: string; fuente: string; detalle: string | null; capturaPath: string | null; createdAt: string; }
export interface CapturaDia { id: string; tipo: "pantalla" | "camara"; path: string; nasPath: string | null; enNas: boolean; fueraDeLugar: boolean | null; veredicto: string | null; createdAt: string; }
export interface DiaExpediente {
  fecha: string;         // YYYY-MM-DD
  horas: number;
  faltas: FaltaDia[];
  minutosPausaDeMas: number;
  capturas: CapturaDia[];
  nota: Nota;
}
export interface Expediente {
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  dias: Map<string, DiaExpediente>;  // por YYYY-MM-DD
}

const SERIAS = ["camara_apagada", "se_fue", "celular", "distraido", "no_mira", "pantalla_distraccion"];
const META_DIA = 6;

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

function fechaBogota(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
function diaDe(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** año y mes (1-12) del período a mirar. */
export function useExpedienteEmpleado(userId: string | null, anio: number, mes: number) {
  const { user } = useAuth();
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate(); // último día del mes
  const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(finMes).padStart(2, "0")}`;

  const q = useQuery({
    enabled: !!user?.id && !!userId,
    queryKey: ["expediente", userId, anio, mes],
    staleTime: 60_000,
    queryFn: async (): Promise<Expediente> => {
      const db = supabase as unknown as RpcDb;
      const inicioISO = `${desde}T00:00:00-05:00`;
      const finISO = `${hasta}T23:59:59-05:00`;

      const [perfRes, tiempoRes, eventosRes, pausasRes, capturasRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url, avatar_seed").eq("id", userId!).maybeSingle(),
        db.rpc("cowork_tiempo_diario", { _desde: desde, _hasta: hasta, _user_id: userId, _limit: 100, _offset: 0 }),
        supabase.from("monitor_eventos").select("id, tipo, fuente, detalle, captura_path, created_at, estado").eq("user_id", userId!).neq("estado", "descartado").gte("created_at", inicioISO).lte("created_at", finISO).order("created_at", { ascending: false }).limit(1000),
        db.rpc("cowork_pausas_resumen", { _desde: desde, _hasta: hasta, _session_id: null, _user_id: userId, _limit: 100, _offset: 0 }),
        supabase.from("monitor_capturas").select("id, tipo, path, nas_path, en_nas, fuera_de_lugar, veredicto, created_at").eq("user_id", userId!).gte("created_at", inicioISO).lte("created_at", finISO).order("created_at", { ascending: false }).limit(3000),
      ]);

      const dias = new Map<string, DiaExpediente>();
      const asegura = (f: string): DiaExpediente => {
        let d = dias.get(f);
        if (!d) { d = { fecha: f, horas: 0, faltas: [], minutosPausaDeMas: 0, capturas: [], nota: { valor: null, banda: null, factores: [] } }; dias.set(f, d); }
        return d;
      };

      // horas por día
      for (const r of (tiempoRes.data ?? []) as Array<{ dia: string; seg_activo: number | string }>) {
        const f = r.dia?.slice(0, 10);
        if (f) asegura(f).horas = Number(r.seg_activo) / 3600;
      }
      // faltas por día
      for (const e of (eventosRes.data ?? []) as Array<{ id: string; tipo: string; fuente: string; detalle: string | null; captura_path: string | null; created_at: string }>) {
        const f = diaDe(e.created_at);
        asegura(f).faltas.push({ id: e.id, tipo: e.tipo, fuente: e.fuente, detalle: e.detalle, capturaPath: e.captura_path, createdAt: e.created_at });
      }
      // pausas de más por día
      for (const r of (pausasRes.data ?? []) as Array<{ dia: string; seg_bano?: number | null; bano_limite_seg?: number | null; bano_excedido?: boolean | null; seg_break_de_mas?: number | null; seg_almuerzo_de_mas?: number | null }>) {
        const f = r.dia?.slice(0, 10);
        if (!f) continue;
        const banoDeMas = r.bano_excedido ? Math.max(0, Number(r.seg_bano ?? 0) - Number(r.bano_limite_seg ?? 0)) : 0;
        asegura(f).minutosPausaDeMas += (banoDeMas + Number(r.seg_break_de_mas ?? 0) + Number(r.seg_almuerzo_de_mas ?? 0)) / 60;
      }
      // capturas por día
      for (const c of (capturasRes.data ?? []) as Array<{ id: string; tipo: "pantalla" | "camara"; path: string; nas_path: string | null; en_nas: boolean; fuera_de_lugar: boolean | null; veredicto: string | null; created_at: string }>) {
        const f = diaDe(c.created_at);
        asegura(f).capturas.push({ id: c.id, tipo: c.tipo, path: c.path, nasPath: c.nas_path, enNas: c.en_nas === true, fueraDeLugar: c.fuera_de_lugar, veredicto: c.veredicto, createdAt: c.created_at });
      }

      // nota por día (solo faltas SERIAS cuentan)
      for (const d of dias.values()) {
        const faltasSerias = d.faltas.filter((x) => SERIAS.includes(x.tipo)).length;
        const conPausa = d.minutosPausaDeMas > 0 || (tiempoRes.data ?? []).some((r) => (r as { dia?: string }).dia?.slice(0, 10) === d.fecha);
        d.nota = calcularNota({
          horasHechas: d.horas,
          horasMeta: META_DIA,
          faltasSerias,
          minutosPausaDeMas: conPausa ? d.minutosPausaDeMas : undefined,
        });
      }

      const p = perfRes.data as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null } | null;
      return {
        nombre: p?.full_name?.trim() || "",
        avatarUrl: p?.avatar_url ?? null,
        avatarSeed: p?.avatar_seed ?? null,
        dias,
      };
    },
  });

  return { expediente: q.data ?? null, cargando: q.isLoading, error: q.error, desde, hasta, hoy: fechaBogota(new Date()) };
}
