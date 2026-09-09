import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Loader2, DoorClosed, Clock } from "lucide-react";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { LlamadaEnVentanaFlotante } from "@/components/LlamadaEnVentanaFlotante";
import { docPipSupported } from "@/pages/cowork/usePipWindow";
import { useMeetGuest } from "@/hooks/useMeetGuest";
import { normalizeRoomCode } from "@/lib/coworkRoomCode";

// Ruta PÚBLICA (/entrar/:code). Es el ÚNICO link que hace falta compartir de una
// reunión, porque atiende los dos casos como el modo "Trusted" de Google Meet:
//
//   · quien tiene cuenta en Maven (la "organización") no golpea: entra directo;
//   · quien no la tiene pone su nombre, pide entrada y espera que alguien de
//     adentro lo admita.
//
// El token de LiveKit del invitado lo emite la edge `meet-guest` recién cuando
// alguien lo admitió — nunca antes.
export default function MeetGuestPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const code = normalizeRoomCode(rawCode || "");
  const { status, error, roomName, guestName, call, knock, getToken } = useMeetGuest(code);
  const [name, setName] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  // El invitado colgó. Antes esto era `window.location.reload()`: la página se
  // recargaba, el invitado seguía admitido y volvía DERECHO a la llamada, así
  // que colgar se sentía como un refresco que no hacía nada (Jhon, 09/09).
  const [sali, setSali] = useState(false);

  useEffect(() => {
    if (code.length !== 6) {
      setCheckingSession(false);
      return;
    }
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (alive) setCheckingSession(false);
        return;
      }
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
            body: JSON.stringify({ action: "joinByCode", code }),
          }
        );
        const json = await res.json();
        if (!alive) return;
        if (res.ok && json.room) {
          const params = new URLSearchParams();
          if (json.room.isHost) params.set("admin", "1");
          params.set("name", json.room.name);
          navigate(
            `/call/${encodeURIComponent(json.room.livekit_room_name)}?${params.toString()}`,
            { replace: true }
          );
          return;
        }
      } catch {
        /* si falla, cae al formulario de invitado */
      }
      if (alive) setCheckingSession(false);
    })();
    return () => { alive = false; };
  }, [code, navigate]);

  if (checkingSession) {
    return (
      <Shell>
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </Shell>
    );
  }

  if (code.length !== 6) {
    return (
      <Shell>
        <p className="text-foreground font-semibold text-center">Ese enlace no es válido</p>
        <p className="text-sm text-muted-foreground text-center">
          Pide a quien te invitó que te comparta el enlace o el código de la reunión otra vez.
        </p>
      </Shell>
    );
  }

  // Admitido: la llamada es la misma vista que usa todo Maven, con el token que
  // emitió la edge tras la admisión (sin permisos de moderación).
  if (status === "admitted" && call && !sali) {
    return (
      <div className="h-screen w-screen bg-background">
        {/* Igual que en la videollamada: esta pestaña es solo la reunión, así
            que si el invitado se va a otro programa la pierde de vista. */}
        <LlamadaEnVentanaFlotante activa>
          <LiveKitCallView
            autoPip={!docPipSupported()}
            roomName={call.room}
            displayName={guestName || "Invitado"}
            callDisplayName={roomName || "Reunión"}
            isAdmin={false}
            getToken={getToken}
            initialMicOn={false}
            initialCamOn={false}
            onLeave={() => setSali(true)}
          />
        </LlamadaEnVentanaFlotante>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <Shell>
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-destructive/10">
          <DoorClosed className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-foreground font-semibold text-center">No te dejaron entrar</p>
        <p className="text-sm text-muted-foreground text-center">
          Contacta a quien te invitó si crees que fue un error.
        </p>
      </Shell>
    );
  }

  if (status === "ended") {
    return (
      <Shell>
        <p className="text-foreground font-semibold text-center">La reunión terminó</p>
        <p className="text-sm text-muted-foreground text-center">
          Ya no se puede entrar con este enlace.
        </p>
      </Shell>
    );
  }

  if (sali) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <DoorClosed className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-foreground font-semibold text-center">Saliste de la reunión</p>
        <p className="text-sm text-muted-foreground text-center">
          Ya podés cerrar esta pestaña.
        </p>
        {/* Sigue admitido, así que volver no exige golpear de nuevo ni que
            alguien lo apruebe otra vez. */}
        <Button className="mt-1 w-full" onClick={() => setSali(false)}>
          Volver a entrar
        </Button>
      </Shell>
    );
  }

  if (status === "pending" || status === "knocking") {
    return (
      <Shell>
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
          <Clock className="h-7 w-7 text-primary" />
        </div>
        <p className="text-foreground font-semibold text-center">Esperando que te dejen entrar</p>
        <p className="text-sm text-muted-foreground text-center">
          {roomName ? `Pediste entrar a "${roomName}".` : "Pediste entrar."} Alguien de la reunión
          tiene que aceptarte. No cierres esta página.
        </p>
        <Loader2 className="h-5 w-5 animate-spin text-primary/60 mt-1" />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
        <Video className="h-7 w-7 text-primary" />
      </div>
      <p className="text-foreground font-semibold text-center">Pedir entrada a la reunión</p>
      <p className="text-xs text-muted-foreground text-center">
        Código <span className="font-mono tracking-[0.2em]">{code}</span>
      </p>
      <div className="w-full flex flex-col gap-2 mt-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && knock(name.trim())}
          placeholder="Tu nombre"
          className="rounded-full text-center"
        />
        <Button
          onClick={() => knock(name.trim())}
          disabled={name.trim().length < 2}
          className="w-full rounded-full"
        >
          Pedir entrada
        </Button>
        <p className="text-[11px] text-muted-foreground/70 text-center">
          Tu nombre se muestra a quienes están en la reunión para que puedan aceptarte.
        </p>
        {/* Quien SÍ tiene cuenta no debería golpear como invitado: entra
            directo. El returnTo lo devuelve a ESTA página tras loguearse —
            y la verificación de sesión de arriba lo mete a la reunión sin
            más pasos (antes el login lo dejaba tirado en el dashboard). */}
        <Button
          variant="ghost"
          className="w-full rounded-full text-muted-foreground"
          onClick={() => navigate(`/login?returnTo=${encodeURIComponent(`/entrar/${code}`)}`)}
        >
          ¿Tienes cuenta en Maven? Inicia sesión
        </Button>
      </div>
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center gap-3 bg-card border border-border/50 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full shadow-sm">
        {children}
      </div>
    </div>
  );
}
