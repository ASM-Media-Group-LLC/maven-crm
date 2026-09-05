import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { playCoordinatorRequestSound } from "@/lib/coordinatorRequestSound";
import { sonarUnaVezEntrePestanas } from "@/lib/sonarUnaVezEntrePestanas";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";

// Aviso de manos levantadas para el coordinador, EN CUALQUIER PARTE DE MAVEN.
//
// El sonido y la notificación ya existían, pero vivían dentro del dashboard de
// Cowork: al navegar a otra sección el componente se desmontaba y el coordinador
// dejaba de enterarse. Una persona pidiendo ayuda desde su sala no puede
// depender de qué pestaña esté mirando quien tiene que atenderla.
//
// Va montado por encima del router, así que corre mientras la sesión esté
// abierta. Solo actúa para quien PUEDE atender (host de una sesión activa): a un
// participante no le sirve de nada que le suene.

export function useCoworkRequestAlerts() {
  const { user } = useAuth();
  const { canAccess } = usePermissions();
  const { notify } = useBrowserNotifications();
  // null = todavía no sabemos qué había; la primera lectura solo toma la foto.
  // Sin esto, entrar a Maven con solicitudes viejas abiertas dispararía el
  // sonido de golpe por cosas que ya se conocían.
  const vistas = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user?.id || !canAccess("Cowork")) return;
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    const revisar = async () => {
      const { data: misSesiones } = await supabase
        .from("cowork_memberships")
        .select("session_id, cowork_sessions!inner(status)")
        .eq("user_id", user.id).eq("role", "host")
        .eq("cowork_sessions.status", "active");
      const ids = (misSesiones ?? []).map((m: { session_id: string }) => m.session_id);
      if (!ids.length || cancelado) return;

      const { data: abiertas } = await supabase
        .from("cowork_host_requests")
        .select("id, user_id, room_id, session_id")
        .in("session_id", ids)
        .eq("status", "open");
      if (cancelado) return;

      const actuales = new Set((abiertas ?? []).map((r) => r.id));
      if (vistas.current === null) { vistas.current = actuales; return; }

      const nuevas = (abiertas ?? []).filter((r) => !vistas.current!.has(r.id));
      vistas.current = actuales;
      if (!nuevas.length) return;

      // Mismo motivo que el ding de mensajes: este hook está montado por
      // encima del router, así que cada pestaña abierta lo tocaba.
      if (sonarUnaVezEntrePestanas("cowork-pedido", 1500)) playCoordinatorRequestSound();

      const [{ user_id, room_id }] = nuevas;
      const { data: perfil } = await supabase
        .from("profiles").select("full_name").eq("id", user_id).maybeSingle();
      const { data: sala } = room_id
        ? await supabase.from("cowork_rooms").select("name").eq("id", room_id).maybeSingle()
        : { data: null };
      const quien = perfil?.full_name || "Alguien";
      notify(
        nuevas.length > 1 ? `${nuevas.length} personas piden supervisor` : `${quien} pide supervisor`,
        sala?.name ? `Sala ${sala.name}` : "Cowork",
        () => window.focus(),
        false, // el sonido ya sonó arriba; el de mensajes sería otro y confunde
      );
    };

    void revisar();
    // Realtime para que llegue al instante, y un repaso periódico por si la
    // suscripción se cae sin avisar (pasa al dormir el equipo).
    canal = supabase
      .channel("cowork-alertas-globales")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "cowork_host_requests" },
        () => { void revisar(); })
      .subscribe();
    const id = window.setInterval(() => { void revisar(); }, 30_000);

    return () => {
      cancelado = true;
      window.clearInterval(id);
      if (canal) supabase.removeChannel(canal);
    };
  }, [user?.id, canAccess, notify]);
}
