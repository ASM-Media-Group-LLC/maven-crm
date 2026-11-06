import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, fraccionJornada, type Nota } from "@/lib/notaEmpleado";
import { cargarExoneracion, esExento } from "@/lib/exoneracionCamara";
import { cargarHorarios, horarioDe } from "@/lib/horarioEmpleado";

// La gente de un TURNO del día (Alvaro, 04/11; nota v2 05/11): para el drill-down
// del Historial. Por persona que trabajó en ese rango de horas: su nota del turno
// y sus factores. Pantalla/cámara se miden en SEGUNDOS sobre el turno completo
// (no un ratio) con el RPC argos_dia_personas, así las horas quedan metidas y medio
// turno ≈ 50. Respeta roles_calificados (a quién se le cuenta cámara/pantalla).

export interface PersonaTurno {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  equipo: string;
  nota: Nota;
  pantallaPct: number | null;
  camaraPct: number | null;
  atencionPct: number | null;
}

// El EQUIPO de una persona a partir de su puesto (los UUIDs del campo cowork.equipo
// son salas, no equipos). Se agrupa en los equipos reales de la agencia.
const EQUIPO_POR_ROL: Record<string, string> = {
  "Chatter": "Chatters", "Chatter Supervisor": "Chatters",
  "PR": "PR", "Warming": "Warming",
  "Coordinador": "Editores", "Coordinador Supervisor": "Editores",
  "Finanzas": "Finanzas", "Closer": "Closers",
  "Operations Sales": "Operaciones", "admin": "Admin",
  "HHRR": "RRHH", "RRHH": "RRHH",
};
export function equipoDeRoles(roles: Set<string> | undefined): string {
  if (roles) for (const r of roles) { const e = EQUIPO_POR_ROL[r]; if (e) return e; }
  return "Otros";
}

interface FilaDia {
  user_id: string;
  seg_activo: number | string; seg_sin_pantalla: number | string;
  seg_sin_camara: number | string; seg_fuera_camara: number | string;
  juzgadas: number | string; juzgadas_ok: number | string;
}

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useTurnoPersonas(dia: string, hDesde: number, hHasta: number, habilitado: boolean) {
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["argos-turno-personas", dia, hDesde, hHasta],
    staleTime: 60_000,
    queryFn: async (): Promise<PersonaTurno[]> => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_dia_personas", { _dia: dia, _h_desde: hDesde, _h_hasta: hHasta });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaDia[];
      if (filas.length === 0) return [];
      const horasJornada = Math.max(1, hHasta - hDesde);

      const ids = [...new Set(filas.map((f) => f.user_id))];
      const [perfRes, rolesRes, cfgRes, exo, horarios] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids),
        sinTipar.from("user_roles").select("user_id, role").in("user_id", ids),
        sinTipar.from("monitor_config").select("roles_calificados").eq("id", 1).maybeSingle(),
        cargarExoneracion(ids),
        cargarHorarios(ids),
      ]);
      const perfilPor = new Map(((perfRes.data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>).map((p) => [p.id, p]));
      const rolesPor = new Map<string, Set<string>>();
      for (const r of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
        const s = rolesPor.get(r.user_id) ?? new Set<string>();
        s.add(r.role);
        rolesPor.set(r.user_id, s);
      }
      const rolesCalif: string[] | null = (cfgRes.data as { roles_calificados: string[] | null } | null)?.roles_calificados ?? null;
      const esCalificado = (id: string): boolean => {
        if (!rolesCalif || rolesCalif.length === 0) return true;
        const roles = rolesPor.get(id);
        if (!roles) return false;
        for (const r of roles) if (rolesCalif.includes(r)) return true;
        return false;
      };

      const personas: PersonaTurno[] = filas.map((f) => {
        // Segundos sobre el turno: pantalla compartida = activo + sin_cámara +
        // fuera_cámara; cámara bien = activo + sin_pantalla. El denominador es la
        // jornada menos la pausa libre (dentro de fraccionJornada).
        const segPantalla = Number(f.seg_activo) + Number(f.seg_sin_camara) + Number(f.seg_fuera_camara);
        const segCamara = Number(f.seg_activo) + Number(f.seg_sin_pantalla);
        const juz = Number(f.juzgadas), juzOk = Number(f.juzgadas_ok);
        // Calificado en cámara/pantalla si su rol se califica Y no está exonerado.
        const calificado = esCalificado(f.user_id) && !esExento(exo, f.user_id, rolesPor.get(f.user_id));
        // Denominador: el turno menos el baño+comida de esa persona (no cuenta en contra).
        const exentoSeg = horarioDe(horarios, f.user_id).exentoSeg;
        const pantallaPct = calificado ? fraccionJornada(segPantalla, horasJornada, exentoSeg) : undefined;
        const camaraPct = calificado ? fraccionJornada(segCamara, horasJornada, exentoSeg) : undefined;
        const atencionPct = juz > 0 ? juzOk / juz : undefined;
        const nota = calcularNota({ pantallaPct, camaraPct, atencionPct });
        const perfil = perfilPor.get(f.user_id);
        return {
          userId: f.user_id,
          nombre: perfil?.full_name?.trim() || "",
          avatarUrl: perfil?.avatar_url ?? null,
          avatarSeed: perfil?.avatar_seed ?? null,
          equipo: equipoDeRoles(rolesPor.get(f.user_id)),
          nota,
          pantallaPct: pantallaPct == null ? null : Math.round(pantallaPct * 100),
          camaraPct: camaraPct == null ? null : Math.round(camaraPct * 100),
          atencionPct: atencionPct == null ? null : Math.round(atencionPct * 100),
        };
      });

      // De PEOR a mejor (los sin nota, al final).
      personas.sort((a, b) => {
        if (a.nota.valor == null) return 1;
        if (b.nota.valor == null) return -1;
        return a.nota.valor - b.nota.valor;
      });
      return personas;
    },
  });

  return { personas: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null };
}
