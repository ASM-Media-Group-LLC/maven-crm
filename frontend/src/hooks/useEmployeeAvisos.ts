import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rangoDelMes, claveDeDia } from "@/lib/calendario";
import { SITUACION_POR_SLUG } from "@/lib/coworkAvisos";
import type { TranslationKey } from "@/lib/i18n";

// Los avisos que RECIBIÓ un empleado en un mes, agrupados por día — la materia
// prima del calendario del perfil. Leer avisos de otra persona (de sesiones que
// uno no hospedó) lo permite la policy avisos_select_supervisores; sin ella
// PostgREST devolvería [] aunque haya filas.

export interface AvisoRecibido {
  id: string;
  slug: string;
  /** Texto de la situación; null si el slug ya no existe en el catálogo. */
  etiqueta: TranslationKey | null;
  createdAt: Date;
  /** Quién lo mandó; null si no se pudo resolver el nombre. */
  senderName: string | null;
}

export interface EmployeeAvisosMes {
  /** Clave de día local (claveDeDia) → avisos de ese día, más nuevos primero. */
  porDia: Map<string, AvisoRecibido[]>;
  total: number;
}

interface FilaAviso {
  id: string;
  situacion: string;
  created_at: string;
  created_by: string | null;
}

export const useEmployeeAvisos = (employeeId: string | undefined, mes: Date) => {
  const monthKey = `${mes.getFullYear()}-${mes.getMonth()}`;
  return useQuery({
    queryKey: ["employee-avisos", employeeId, monthKey],
    enabled: !!employeeId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EmployeeAvisosMes> => {
      const { desde, hasta } = rangoDelMes(mes);
      // cowork_avisos no está en los tipos generados → cast establecido.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sinTipar = supabase as unknown as { from: (t: string) => any };
      const { data, error } = await sinTipar
        .from("cowork_avisos")
        .select("id, situacion, created_at, created_by")
        .eq("user_id", employeeId)
        .gte("created_at", desde.toISOString())
        .lte("created_at", hasta.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      const filas = (data ?? []) as FilaAviso[];

      // Nombres de quién avisó, en una sola consulta.
      const emisores = [...new Set(filas.map((f) => f.created_by).filter((x): x is string => !!x))];
      const nombres = new Map<string, string>();
      if (emisores.length) {
        const { data: perfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", emisores);
        for (const p of perfiles ?? []) {
          if (p.full_name) nombres.set(p.id, p.full_name);
        }
      }

      const porDia = new Map<string, AvisoRecibido[]>();
      for (const f of filas) {
        const sit = SITUACION_POR_SLUG[f.situacion];
        const createdAt = new Date(f.created_at);
        const aviso: AvisoRecibido = {
          id: f.id,
          slug: f.situacion,
          etiqueta: sit?.etiqueta ?? null,
          createdAt,
          senderName: f.created_by ? nombres.get(f.created_by) ?? null : null,
        };
        const dia = claveDeDia(createdAt);
        const ya = porDia.get(dia);
        if (ya) ya.push(aviso);
        else porDia.set(dia, [aviso]);
      }
      return { porDia, total: filas.length };
    },
  });
};
