import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { latidoActivo } from "@/lib/coworkLatido";

// TODOS ADENTRO DE COWORK (Alvaro, 13/11/2026): «Nadie puede estar fuera de un
// cowork… y si no, que no puedan entrar». Abrir Maven es estar trabajando (y
// cobrando), así que quien debe estar en Cowork —todos menos admins, dueño, Luis,
// Daniel, Breyner y Vanessa (debe_estar_en_cowork en la base)— solo puede usar
// Maven mientras está en su sala. Si no, Maven lo manda a Cowork. Ya en la sala usa
// todo: la llamada sigue en la ventanita.

/** Rutas que siempre se pueden abrir: entrar a Cowork y las llamadas de Maven. */
export function rutaLibreDeCowork(ruta: string): boolean {
  return ruta.startsWith("/cowork") || ruta.startsWith("/meet") || ruta.startsWith("/call/");
}

export interface EstadoCowork { debe: boolean; presente: boolean }

/** ¿Hay que mandar a esta persona a Cowork? Sin datos (cargando o falló la
 *  consulta) NO se bloquea: un fallo de red no puede dejar a nadie afuera. */
export function debeIrACowork(estado: EstadoCowork | null, enSalaAqui: boolean, ruta: string): boolean {
  if (!estado || !estado.debe) return false;
  if (enSalaAqui || estado.presente) return false;
  return !rutaLibreDeCowork(ruta);
}

const CADA_MS = 20_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => Promise<{ data: any; error: unknown }> };

export function useCoworkObligatorio(): { estado: EstadoCowork | null; enSalaAqui: boolean } {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoCowork | null>(null);
  const [enSalaAqui, setEnSalaAqui] = useState(() => latidoActivo() !== null);

  useEffect(() => {
    if (!user) { setEstado(null); return; }
    let vivo = true;
    const leer = async () => {
      const { data, error } = await sinTipar.rpc("mi_cowork_estado");
      // Un fallo no es «no está»: se deja lo último que se supo.
      if (!vivo || error) return;
      const fila = Array.isArray(data) ? data[0] : null;
      if (fila) setEstado({ debe: fila.debe === true, presente: fila.presente === true });
    };
    void leer();
    const id = window.setInterval(() => { void leer(); }, CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user]);

  // En ESTA pestaña se sabe al instante si está en la sala (el latido corre).
  useEffect(() => {
    const id = window.setInterval(() => setEnSalaAqui(latidoActivo() !== null), 1_000);
    return () => window.clearInterval(id);
  }, []);

  return { estado, enSalaAqui };
}
