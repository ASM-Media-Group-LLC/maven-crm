import type { ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

// Piezas comunes del área del NAS (/oficina/espacio-nas): la lectura de una RPC
// de solo admin, la sección con sus tres estados (cargando / falló con
// Reintentar / contenido) y la fila con barrita. Un fallo se dice como fallo,
// nunca como «no hay nada».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

/** Lo que una sección necesita de su consulta (así se puede dibujar con datos fijos). */
export type EstadoDe<T> = Pick<UseQueryResult<T>, "data" | "isLoading" | "isError"> & { refetch: () => unknown };

/** Lee una RPC del NAS (solo dueño/admin). `args` va en la llave del caché. */
export function useRpcNas<T>(rpc: string, on: boolean, args?: Record<string, unknown>): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ["espacio-nas", rpc, args ?? null],
    enabled: on,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc(rpc, args);
      if (error) throw new Error(error.message);
      return data as T;
    },
  });
}

/** Una sección con su estado: cargando, falló (con reintentar) o el contenido. */
export function Seccion<T>({ icono: Icono, titulo, nota, q, children }: {
  icono: typeof HardDrive; titulo: string; nota?: ReactNode; q: EstadoDe<T>; children: (d: T) => ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="vidrio sube p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
        {titulo}
      </h2>
      {nota && <div className="mb-3 max-w-3xl text-xs text-muted-foreground">{nota}</div>}
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{t("dashboard.centro.nas.fallo")}</span>
          <button type="button" onClick={() => void q.refetch()} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" />{t("dashboard.centro.nas.reintentar")}
          </button>
        </div>
      ) : children(q.data)}
    </section>
  );
}

/** Fila de lista con barrita apagada (mismo lenguaje que el bloque del Centro). */
export function Fila({ nombre, detalle, valor, pct }: { nombre: ReactNode; detalle?: ReactNode; valor: string; pct: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-sm">{nombre}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{valor}</span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/45" style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} />
      </div>
      {detalle && <span className="col-span-2 -mt-0.5 text-[10px] text-muted-foreground tabular-nums">{detalle}</span>}
    </li>
  );
}
