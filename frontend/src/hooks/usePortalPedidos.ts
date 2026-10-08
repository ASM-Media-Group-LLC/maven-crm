// Los personalizados de la creadora en su portal (fase 3; decisiones de Jhon,
// 06/10/2026). Todo pasa por la edge portal-contenido (pedidos.ts); las reglas
// las pone la base (portal_pedido, 20261009100000_portal_pedidos.sql).

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { llamarContenido } from "@/hooks/usePortalContenido";

export interface ArchivoDelPedido {
  id: string;
  nombre: string;
  mime: string | null;
  size: number | null;
  /** Una entrega suya: el archivo en SU Drive. */
  drive_item_id?: string;
}

export type EstadoDelPedido =
  | "solicitado" | "aprobado" | "en_produccion" | "listo" | "entregado" | "no_puede" | "denegado" | "reembolsado";

export interface PedidoDelPortal {
  id: string;
  estado: EstadoDelPedido;
  fan: string;
  descripcion: string;
  precio_usd: number | null;
  tipo: string | null;
  cantidad: string | null;
  pedido_el: string | null;
  para_el: string | null;
  motivo: string | null;
  creado: string;
  por_aprobar: boolean;
  se_puede_empezar: boolean;
  se_puede_entregar: boolean;
  se_puede_rechazar: boolean;
  referencias: ArchivoDelPedido[];
  entregas: ArchivoDelPedido[];
}

/** Lo que todavía le toca: por aprobar, por hacer y lo que está haciendo. */
export const ESTADOS_POR_HACER: EstadoDelPedido[] = ["solicitado", "aprobado", "en_produccion"];
export const porHacer = (ps: PedidoDelPortal[] | undefined) => (ps ?? []).filter((p) => ESTADOS_POR_HACER.includes(p.estado));

const clave = (creatorId: string) => ["portal", "pedidos", creatorId] as const;

export function usePedidosDelPortal(creatorId: string) {
  return useQuery({
    queryKey: clave(creatorId),
    enabled: !!creatorId,
    queryFn: async () => (await llamarContenido<{ pedidos: PedidoDelPortal[] }>(creatorId, "pedidos")).pedidos ?? [],
    staleTime: 30_000,
    // Un pedido nuevo le llega por la campana; esto lo pone en la lista sin recargar.
    refetchInterval: 120_000,
  });
}

/** El código que devuelve la edge (no_es_tuyo, por_aprobar, falta_motivo…). */
export function codigoDeError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  const codigo = m.match(/\b(no_existe|no_es_tuyo|por_aprobar|no_se_puede|falta_motivo|archivo_invalido|pedido_invalido)\b/);
  return codigo?.[1] ?? "error";
}

export function useAccionesDePedidos(creatorId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: clave(creatorId) });
  const carpeta = useCallback(
    async () => (await llamarContenido<{ carpeta: string }>(creatorId, "pedido_carpeta")).carpeta,
    [creatorId],
  );
  const referencia = useCallback(
    async (id: string) => (await llamarContenido<{ url: string }>(creatorId, "pedido_referencia", { id })).url,
    [creatorId],
  );
  // La entrega se ata cuando termina de subir (desde la cola del portal): no es
  // una mutación de esta pantalla, así que refresca la lista ella misma.
  const entregar = useCallback(async (pedido: string, archivo: string) => {
    const r = await llamarContenido<{ ok: boolean; estado: string }>(creatorId, "pedido_entregar", { pedido, archivo });
    await qc.invalidateQueries({ queryKey: clave(creatorId) });
    return r;
  }, [creatorId, qc]);
  return {
    empezar: useMutation({
      mutationFn: (pedido: string) => llamarContenido(creatorId, "pedido_empezar", { pedido }),
      onSettled: refrescar,
    }),
    noPuede: useMutation({
      mutationFn: (p: { pedido: string; motivo: string }) => llamarContenido(creatorId, "pedido_no_puede", p),
      onSettled: refrescar,
    }),
    entregar,
    carpeta,
    referencia,
  };
}
