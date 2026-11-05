import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, type Nota } from "@/lib/notaEmpleado";

// La gente de un TURNO del día (Alvaro, 04/11): para el drill-down del Historial.
// Por persona que trabajó en ese rango de horas: su nota del turno y sus factores
// (pantalla/cámara/atención). Respeta roles_calificados (a quién se le cuenta
// cámara/pantalla). Lo arma el RPC argos_momentos_turno.

export interface PersonaTurno {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  nota: Nota;
  pantallaPct: number | null;
  camaraPct: number | null;
  atencionPct: number | null;
}

interface FilaMom { user_id: string; mom_camara: number | string; mom_pantalla: number | string; juzgadas: number | string; juzgadas_ok: number | string; mom_cara_ok: number | string; mom_cara_medida: number | string; }

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
      const { data, error } = await db.rpc("argos_momentos_turno", { _dia: dia, _h_desde: hDesde, _h_hasta: hHasta });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaMom[];
      if (filas.length === 0) return [];

      const ids = [...new Set(filas.map((f) => f.user_id))];
      const [perfRes, rolesRes, cfgRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids),
        sinTipar.from("user_roles").select("user_id, role").in("user_id", ids),
        sinTipar.from("monitor_config").select("roles_calificados").eq("id", 1).maybeSingle(),
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
        const camara = Number(f.mom_camara), pantalla = Number(f.mom_pantalla);
        const caraOk = Number(f.mom_cara_ok), caraMedida = Number(f.mom_cara_medida);
        const juz = Number(f.juzgadas), juzOk = Number(f.juzgadas_ok);
        const calificado = esCalificado(f.user_id);
        const pantallaPct = calificado && camara > 0 ? Math.min(1, pantalla / camara) : undefined;
        const camaraPct = calificado && caraMedida > 0 ? caraOk / caraMedida : undefined;
        const atencionPct = juz > 0 ? juzOk / juz : undefined;
        const nota = calcularNota({ pantallaPct, camaraPct, atencionPct, horasHechas: 0, horasMeta: 8 });
        const perfil = perfilPor.get(f.user_id);
        return {
          userId: f.user_id,
          nombre: perfil?.full_name?.trim() || "",
          avatarUrl: perfil?.avatar_url ?? null,
          avatarSeed: perfil?.avatar_seed ?? null,
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
