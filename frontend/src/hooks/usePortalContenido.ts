import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminInvoke } from "@/lib/adminInvoke";
import { type PlanDeSubida, SubidaCancelada, SubidaFallida, subirPorPartes } from "@/lib/drive/subidaPorPartes";

// «Mi contenido» del portal de creadoras: su carpeta en el Drive de su agencia.
// Todo pasa por la edge portal-contenido (ella no es de la agencia: la RLS del
// Drive no la deja ver nada). Ver supabase/functions/portal-contenido/logica.ts.

export interface ItemDelPortal {
  id: string;
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  size: number | null;
  estado: "subiendo" | "listo";
  created_at: string;
  updated_at: string;
  mio: boolean;
  se_puede_borrar: boolean;
}

export interface ListaDelPortal {
  carpeta: string;
  raiz: string;
  ruta: { id: string; nombre: string }[];
  items: ItemDelPortal[];
}

export const llamarContenido = <T = Record<string, unknown>>(creatorId: string, accion: string, cuerpo: Record<string, unknown> = {}) =>
  adminInvoke<T>("portal-contenido", { accion, creator_id: creatorId, ...cuerpo });

const clave = (creatorId: string) => ["portal", "contenido", creatorId] as const;

export function useCarpetaDelPortal(creatorId: string, carpeta: string | null) {
  return useQuery({
    queryKey: [...clave(creatorId), "carpeta", carpeta],
    queryFn: () => llamarContenido<ListaDelPortal>(creatorId, "listar", { carpeta }),
    staleTime: 15_000,
  });
}

/** id → URL de la miniatura (las firma la edge; valen entre 6 y 12 h). */
export function useMiniaturasDelPortal(creatorId: string, items: ItemDelPortal[]) {
  const ids = items.filter((i) => i.tipo === "archivo" && i.estado === "listo").map((i) => i.id).slice(0, 200);
  return useQuery({
    queryKey: ["portal-miniaturas", creatorId, ids],
    enabled: ids.length > 0,
    staleTime: 3 * 3600 * 1000,
    queryFn: async () => (await llamarContenido<{ urls: Record<string, string> }>(creatorId, "miniaturas", { ids })).urls ?? {},
  });
}

export function useAccionesDelPortal(creatorId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: clave(creatorId) });
  // Estable: el visor lo tiene en las dependencias de su efecto, y la página se
  // redibuja con cada avance de una subida.
  const abrir = useCallback(
    (id: string, descargar = false) => llamarContenido<{ url: string }>(creatorId, "abrir", { id, descargar }).then((r) => r.url),
    [creatorId],
  );
  return {
    crearCarpeta: useMutation({
      mutationFn: (p: { carpeta: string; nombre: string }) => llamarContenido(creatorId, "crear_carpeta", p),
      onSettled: refrescar,
    }),
    renombrar: useMutation({
      mutationFn: (p: { id: string; nombre: string }) => llamarContenido(creatorId, "renombrar", p),
      onSettled: refrescar,
    }),
    borrar: useMutation({
      mutationFn: (id: string) => llamarContenido(creatorId, "borrar", { id }),
      onSettled: refrescar,
    }),
    abrir,
  };
}

// ─── Las subidas ─────────────────────────────────────────────────────────────
export type EstadoDeSubida = "esperando" | "subiendo" | "reintentando" | "sin_internet" | "lista" | "error" | "cancelada";

export interface Subida {
  clave: string;
  nombre: string;
  size: number;
  enviado: number;
  estado: EstadoDeSubida;
  error?: string;
  /** La entrega de un personalizado: el pedido al que se ata al terminar. */
  pedido?: string;
}

/** Qué hacer con el archivo apenas quedó subido (atar la entrega a su pedido). */
export interface AlTerminar {
  pedido: string;
  hacer: (itemId: string) => Promise<unknown>;
}

interface Pendiente {
  clave: string;
  archivo: File;
  carpeta: string;
  creatorId: string;
  alTerminar?: AlTerminar;
  /** Ya subido y confirmado, pero atarlo falló: reintentar solo vuelve a atar. */
  subido?: string;
}

/** La cola de subidas del portal: de a una, con reintentos, y la pantalla
 *  encendida mientras sube (si el celular se duerme, corta la subida). La monta
 *  PortalLayout, así sigue subiendo aunque ella cambie de pantalla en el portal. */
export function useSubidasDelPortal() {
  const qc = useQueryClient();
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const cola = useRef<Pendiente[]>([]);
  // Los archivos de lo que falló, para volver a intentarlo sin elegirlos de nuevo.
  const fallidas = useRef(new Map<string, Pendiente>());
  const corriendo = useRef(false);
  const actual = useRef<{ clave: string; control: AbortController; id: string | null } | null>(null);

  const cambiar = (c: string, cambio: Partial<Subida>) =>
    setSubidas((ss) => ss.map((s) => (s.clave === c ? { ...s, ...cambio } : s)));

  const procesar = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    let pantalla: { release: () => Promise<void> } | null = null;
    try {
      pantalla = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request("screen") ?? null;
    } catch {
      pantalla = null; // sin permiso o sin soporte: sube igual
    }
    try {
      while (cola.current.length) {
        const p = cola.current.shift()!;
        const control = new AbortController();
        actual.current = { clave: p.clave, control, id: null };
        cambiar(p.clave, { estado: "subiendo" });
        try {
          if (!p.subido) {
            const plan = await llamarContenido<PlanDeSubida & { id: string }>(p.creatorId, "subir_iniciar", {
              carpeta: p.carpeta, nombre: p.archivo.name, size: p.archivo.size, mime: p.archivo.type || null,
            });
            actual.current.id = plan.id;
            const recibo = await subirPorPartes(p.archivo, plan, {
              signal: control.signal,
              onProgreso: (n) => cambiar(p.clave, { enviado: n }),
              onEstado: (e) => cambiar(p.clave, {
                estado: "reintento" in e ? "reintentando" : "sinInternet" in e ? "sin_internet" : "subiendo",
              }),
            });
            await llamarContenido(p.creatorId, "subir_confirmar", { id: plan.id, recibo });
            p.subido = plan.id;
            // Ya está en su Drive: si lo que sigue falla, NO se borra.
            actual.current.id = null;
          }
          // La entrega de un pedido: se ata al terminar. Si falla, el archivo
          // queda en su Drive y «Reintentar» vuelve a atarlo sin volver a subirlo.
          if (p.alTerminar) {
            try {
              await p.alTerminar.hacer(p.subido);
            } catch (e) {
              fallidas.current.set(p.clave, p);
              cambiar(p.clave, { estado: "error", enviado: p.archivo.size, error: (e as Error)?.message || "no_se_ato_al_pedido" });
              continue;
            }
          }
          cambiar(p.clave, { estado: "lista", enviado: p.archivo.size });
        } catch (e) {
          const id = actual.current?.id;
          // Lo que quedó a medias no ocupa lugar: la ficha «subiendo» se borra.
          if (id) void llamarContenido(p.creatorId, "borrar", { id }).catch(() => {});
          if (e instanceof SubidaCancelada) cambiar(p.clave, { estado: "cancelada" });
          else {
            fallidas.current.set(p.clave, p);
            cambiar(p.clave, { estado: "error", error: e instanceof SubidaFallida ? e.codigo : (e as Error)?.message ?? "" });
          }
        } finally {
          actual.current = null;
          void qc.invalidateQueries({ queryKey: clave(p.creatorId) });
        }
      }
    } finally {
      corriendo.current = false;
      await pantalla?.release().catch(() => {});
    }
  }, [qc]);

  const agregar = useCallback((archivos: File[], carpeta: string, creatorId: string, alTerminar?: AlTerminar) => {
    const nuevas = archivos.map((archivo) => ({ clave: `${Date.now()}-${Math.random().toString(36).slice(2)}`, archivo, carpeta, creatorId, alTerminar }));
    cola.current.push(...nuevas);
    setSubidas((ss) => [...ss, ...nuevas.map((n) => ({
      clave: n.clave, nombre: n.archivo.name, size: n.archivo.size, enviado: 0, estado: "esperando" as const, pedido: alTerminar?.pedido,
    }))]);
    void procesar();
  }, [procesar]);

  const cancelar = useCallback((c: string) => {
    if (actual.current?.clave === c) actual.current.control.abort();
    const antes = cola.current.length;
    cola.current = cola.current.filter((p) => p.clave !== c);
    if (cola.current.length !== antes) cambiar(c, { estado: "cancelada" });
  }, []);

  const reintentar = useCallback((c: string) => {
    const p = fallidas.current.get(c);
    if (!p) return;
    fallidas.current.delete(c);
    cola.current.push(p);
    cambiar(c, { estado: "esperando", enviado: p.subido ? p.archivo.size : 0, error: undefined });
    void procesar();
  }, [procesar]);

  const limpiar = useCallback(() => {
    fallidas.current.clear();
    setSubidas((ss) => ss.filter((s) => !["lista", "cancelada", "error"].includes(s.estado)));
  }, []);

  const activas = subidas.some((s) => ["esperando", "subiendo", "reintentando", "sin_internet"].includes(s.estado));
  // Salir con subidas en curso: el navegador pregunta.
  useEffect(() => {
    if (!activas) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [activas]);

  return { subidas, agregar, cancelar, reintentar, limpiar, activas };
}

export type SubidasDelPortal = ReturnType<typeof useSubidasDelPortal>;
export const SubidasContext = createContext<SubidasDelPortal | null>(null);
export function useSubidas(): SubidasDelPortal {
  const ctx = useContext(SubidasContext);
  if (!ctx) throw new Error("useSubidas va dentro de PortalLayout");
  return ctx;
}
