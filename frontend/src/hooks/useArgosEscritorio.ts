// Guarda lo que manda la app de computador para Argos: qué app y qué página
// estuvo al frente y cuánto rato sin tocar nada (tabla argos_uso_apps). En el
// navegador no hace nada. Lo monta AppShell, así corre en toda la app.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { escritorio, filasDeUso, type TramoDeApp } from "@/lib/escritorio";

export function useArgosEscritorio() {
  const { user } = useAuth();
  useEffect(() => {
    const app = escritorio();
    if (!app || !user || typeof app.alUsoDeApps !== "function") return;
    // Si un envío falla (sin red), se guarda para el siguiente; tope para no crecer sin fin.
    let pendientes: ReturnType<typeof filasDeUso> = [];
    return app.alUsoDeApps(async (lote: TramoDeApp[]) => {
      const filas = [...pendientes, ...filasDeUso(lote, app.plataforma)].slice(-600);
      pendientes = [];
      if (!filas.length) return;
      const { error } = await supabase.from("argos_uso_apps" as never).insert(filas.map((f) => ({ ...f, user_id: user.id })) as never);
      if (error) pendientes = filas;
    });
  }, [user]);
}
