import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { invitadosNuevos } from "@/lib/avisoDeInvitado";
import { playCoordinatorRequestSound } from "@/lib/coordinatorRequestSound";
import { sonarUnaVezEntrePestanas } from "@/lib/sonarUnaVezEntrePestanas";

interface GuestRequest {
  id: string;
  guest_name: string;
  status: string;
  created_at: string;
}

// Panel flotante dentro de una llamada de Meet: muestra a los invitados SIN
// cuenta que están golpeando, para que alguien de adentro los deje entrar.
//
// Quién puede admitir: cualquiera con cuenta en Maven que esté en la reunión —
// el mismo criterio de Google, donde a un externo solo lo admite alguien de la
// organización. La decisión se ejecuta en la edge, que es la que además emite el
// token del invitado; acá solo se dispara.
export default function MeetGuestGate({ livekitRoom }: { livekitRoom: string }) {
  const [meetRoomId, setMeetRoomId] = useState<string | null>(null);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  // Los que ya conocíamos. `null` = todavía no miramos: la primera foto no suena.
  const vistas = useRef<Set<string> | null>(null);

  // Resolvemos la reunión desde el nombre de sala de LiveKit (es lo único que
  // conoce la página de llamada).
  useEffect(() => {
    if (!livekitRoom.startsWith("meet_")) return;
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // un invitado no admite a otro invitado
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-room`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: "resolve", livekitRoom }),
          }
        );
        const json = await res.json();
        if (alive && res.ok) setMeetRoomId(json.room?.id ?? null);
      } catch {
        /* si no resuelve, el panel simplemente no aparece */
      }
    })();
    return () => { alive = false; };
  }, [livekitRoom]);

  const fetchPending = useCallback(async (roomId: string) => {
    // El turno de "primera mirada" se reclama ACÁ, antes de esperar. Si se
    // decidiera al volver la respuesta, una consulta que se adelanta se
    // declararía la primera, no sonaría, y ese invitado no haría sonar nada
    // nunca: el montaje dispara una consulta y enseguida se suscribe al
    // realtime, así que las dos corren juntas.
    const esPrimeraMirada = vistas.current === null;
    if (esPrimeraMirada) vistas.current = new Set();

    const { data, error } = await supabase
      .from("meet_guest_requests")
      .select("id, guest_name, status, created_at")
      .eq("meet_room_id", roomId).eq("status", "pending")
      .order("created_at", { ascending: true });

    // ⚠️ supabase-js NO lanza: ante un 5xx, la red caída o un hipo de
    // PostgREST devuelve `data: null`. Tomarlo como "no hay nadie esperando"
    // vaciaba la memoria, y al siguiente sondeo el MISMO invitado volvía a
    // contar como nuevo: un timbre cada 5 segundos con wifi inestable, que es
    // justo lo que este archivo existe para evitar. No sabemos nada: no se
    // toca nada.
    if (error) {
      if (esPrimeraMirada) vistas.current = null;   // el turno queda libre
      return;
    }

    const filas = (data as GuestRequest[]) || [];
    setRequests(filas);

    // Y SUENA. Antes el aviso era solo visual (Jhon, 09/09/2026): si estabas
    // mirando otra pestaña, alguien podía quedarse golpeando sin que te
    // enteraras. Es el mismo timbre que usa Cowork cuando alguien pide
    // supervisor — "alguien necesita que lo atiendas" — y el panel de al lado
    // aclara enseguida cuál de los dos es.
    const { nuevos, vistas: ahora } = invitadosNuevos(
      vistas.current ?? new Set(), filas.map((f) => f.id), esPrimeraMirada,
    );
    vistas.current = ahora;
    if (!nuevos.length) return;
    // Con la reunión abierta en dos pestañas, el timbre sonaría dos veces. La
    // clave lleva la reunión adentro para que dos reuniones distintas sí suenen.
    sonarUnaVezEntrePestanas(`meet-invitado-${roomId}`, 1500, () => playCoordinatorRequestSound());
  }, []);

  useEffect(() => {
    if (!meetRoomId) return;
    // Otra reunión, otra memoria. Sin esto, pasar de una reunión a otra sin
    // desmontar arrastraba los ids de la anterior: ninguno coincide con los de
    // la nueva, así que TODOS los que ya estaban esperando contaban como nuevos
    // y sonaba de golpe al entrar.
    vistas.current = null;
    fetchPending(meetRoomId);

    const channel = supabase.channel(`meet-guests-${meetRoomId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "meet_guest_requests",
        filter: `meet_room_id=eq.${meetRoomId}`,
      }, () => fetchPending(meetRoomId))
      .subscribe();

    // Respaldo del realtime: re-consulta cada 5s. El invitado espera contra un
    // panel que TIENE que ver su solicitud; si el canal se cae (pasa bajo
    // carga), el polling garantiza que igual aparezca. Es una fila por
    // reunión, cuesta nada.
    const poll = window.setInterval(() => fetchPending(meetRoomId), 5000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [meetRoomId, fetchPending]);

  const decide = async (request: GuestRequest, admit: boolean) => {
    setDeciding(request.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-room`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "decideGuest", requestId: request.id, admit }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo decidir");
      toast.success(admit ? `${request.guest_name} puede entrar` : `${request.guest_name} fue rechazado`);
      if (meetRoomId) fetchPending(meetRoomId);
    } catch (e) {
      toast.error((e as Error).message || "No se pudo decidir");
    } finally {
      setDeciding(null);
    }
  };

  if (!requests.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[130] w-72 flex flex-col gap-2">
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2.5 shadow-lg"
        >
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 shrink-0">
            <UserPlus className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{request.guest_name}</div>
            <div className="text-[11px] text-muted-foreground">quiere entrar · sin cuenta</div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
            title="Rechazar"
            disabled={deciding === request.id}
            onClick={() => decide(request, false)}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8 rounded-full"
            title="Admitir"
            disabled={deciding === request.id}
            onClick={() => decide(request, true)}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
