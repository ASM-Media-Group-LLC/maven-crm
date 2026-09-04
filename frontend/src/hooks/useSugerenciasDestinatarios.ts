import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Sugerencias para el campo de destinatarios del Correo: compañeros del equipo,
// listas por rol (chatters@, equipo@…) y a quién ya le escribiste.

export type Sugerencia = {
  email: string;
  nombre: string;
  tipo: "persona" | "grupo" | "historial";
};

const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Separa direcciones escritas con coma, punto y coma o espacios. */
export function partirDirecciones(v: string): string[] {
  return v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function esCorreo(v: string): boolean {
  return ES_CORREO.test(v);
}

/** Saca los correos de un encabezado tipo `Nombre <a@b.com>, c@d.com`. */
function extraerDeEncabezado(raw: string | null): { email: string; nombre: string }[] {
  if (!raw) return [];
  const out: { email: string; nombre: string }[] = [];
  for (const parte of raw.split(",")) {
    const m = parte.match(/<([^>]+)>/);
    const email = (m ? m[1] : parte).trim().toLowerCase();
    if (!ES_CORREO.test(email)) continue;
    const nombre = m ? parte.slice(0, m.index).replace(/["']/g, "").trim() : "";
    out.push({ email, nombre: nombre || email.split("@")[0] });
  }
  return out;
}

/** Directorio (compañeros + listas por rol) mezclado con el historial propio.
 *  El historial manda: a quien ya le escribiste es lo más probable. */
export function useSugerenciasDestinatarios(): Sugerencia[] {
  const directorio = useQuery({
    queryKey: ["mail-directorio"],
    queryFn: async () => {
      // El RPC es nuevo y `integrations/supabase/types.ts` (generado, 567KB) no
      // lo conoce — nadie regenera ese archivo por una función suelta. Cast
      // acotado al nombre, no a todo el cliente.
      const { data, error } = (await supabase.rpc(
        "mail_recipient_directory" as never,
      )) as unknown as { data: Sugerencia[] | null; error: { message: string } | null };
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const historial = useQuery({
    queryKey: ["mail-historial-direcciones"],
    queryFn: async () => {
      // De la caché local de correo, que el usuario ya lee por RLS.
      const { data, error } = await supabase
        .from("mail_messages")
        .select("from_addr, to_addr, date")
        .order("date", { ascending: false })
        .limit(400);
      if (error) throw error;
      const vistos = new Map<string, string>();
      for (const m of data ?? []) {
        for (const d of [...extraerDeEncabezado(m.from_addr), ...extraerDeEncabezado(m.to_addr)]) {
          if (!vistos.has(d.email)) vistos.set(d.email, d.nombre);
        }
      }
      return [...vistos].map(([email, nombre]): Sugerencia => ({ email, nombre, tipo: "historial" }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const porEmail = new Map<string, Sugerencia>();
    for (const s of historial.data ?? []) porEmail.set(s.email, s);
    // El directorio pisa al historial solo para MEJORAR el nombre mostrado (ahí
    // está el nombre real del perfil, no el que puso el remitente).
    for (const s of directorio.data ?? []) {
      const previo = porEmail.get(s.email);
      porEmail.set(s.email, previo ? { ...s, tipo: previo.tipo } : s);
    }
    return [...porEmail.values()];
  }, [directorio.data, historial.data]);
}
