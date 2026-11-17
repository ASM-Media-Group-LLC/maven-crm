import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Loader2, LinkIcon, WifiOff, DoorClosed, CalendarClock } from "lucide-react";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { LlamadaEnVentanaFlotante } from "@/components/LlamadaEnVentanaFlotante";
import { docPipSupported } from "@/pages/cowork/usePipWindow";
import { useMeetLink } from "@/hooks/useMeetLink";
import { useLanguage } from "@/hooks/useLanguage";

// Ruta PÚBLICA (/unirse/<link>). El link directo de invitado (Alvaro,
// 17/11/2026): «el invitado sin cuenta abre un link, escribe su nombre y
// entra», sin clave y sin sala de espera, como Google Meet.
//
// Sirve igual para un Meet y para una llamada del Messenger: qué sala abre lo
// decide el servidor (edge meet-guest) a partir del link, nunca esta página.
// El invitado no recibe sesión de Supabase: solo un token de LiveKit de esa sala.
export default function MeetLinkPage() {
  const { t, language } = useLanguage();
  const { link: rawLink } = useParams<{ link: string }>();
  const link = (rawLink || "").trim();
  const { estado, error, nombreSala, agendadaPara, miNombre, llamada, revisar, entrar, getToken, salir } = useMeetLink(link);
  const [nombre, setNombre] = useState("");
  const [sali, setSali] = useState(false);

  const nombreOk = nombre.trim().length >= 2;
  const cuando = agendadaPara
    ? new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(new Date(agendadaPara))
    : null;

  if (estado === "adentro" && llamada) {
    return (
      <div className="h-screen w-screen bg-background">
        <LlamadaEnVentanaFlotante activa>
          <LiveKitCallView
            autoPip={!docPipSupported()}
            roomName={llamada.room}
            displayName={miNombre || nombre.trim()}
            callDisplayName={nombreSala || t("meet.guest.meetingFallback")}
            isAdmin={false}
            getToken={getToken}
            initialMicOn={false}
            initialCamOn={false}
            // El link interno de la sala no le sirve a un invitado: no se ofrece.
            hideShareLink
            onLeave={() => { setSali(true); void salir(); }}
          />
        </LlamadaEnVentanaFlotante>
      </div>
    );
  }

  if (estado === "revisando") {
    return <Marco><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></Marco>;
  }

  if (estado === "invalido") {
    return (
      <Marco>
        <Icono><LinkIcon className="h-7 w-7 text-muted-foreground" /></Icono>
        <p className="text-center font-semibold text-foreground">{t("meet.link.invalid")}</p>
        <p className="text-center text-sm text-muted-foreground">{error || t("meet.link.invalidHint")}</p>
      </Marco>
    );
  }

  if (estado === "error") {
    return (
      <Marco>
        <Icono><WifiOff className="h-7 w-7 text-muted-foreground" /></Icono>
        <p className="text-center font-semibold text-foreground">{t("meet.link.failed")}</p>
        <p className="text-center text-sm text-muted-foreground">{t("meet.link.failedHint")}</p>
        <Button variant="outline" className="mt-1 w-full rounded-full" onClick={() => void revisar()}>
          {t("meet.link.retry")}
        </Button>
      </Marco>
    );
  }

  return (
    <Marco>
      <Icono>
        {sali ? <DoorClosed className="h-7 w-7 text-primary" /> : <Video className="h-7 w-7 text-primary" />}
      </Icono>
      <p className="text-center font-semibold text-foreground">
        {sali ? t("meet.link.left") : t("meet.link.joinTitle")}
      </p>
      {nombreSala && (
        <p className="text-center text-sm text-muted-foreground">{t("meet.link.joinTo", { name: nombreSala })}</p>
      )}
      {cuando && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          {t("meet.link.scheduledFor", { when: cuando })}
        </p>
      )}
      <div className="mt-1 flex w-full flex-col gap-2">
        {!sali && (
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, 40))}
            onKeyDown={(e) => e.key === "Enter" && nombreOk && estado === "listo" && void entrar(nombre.trim())}
            placeholder={t("meet.link.yourName")}
            aria-label={t("meet.link.yourName")}
            autoFocus
            className="rounded-full text-center"
          />
        )}
        <Button
          onClick={() => { setSali(false); void entrar((miNombre || nombre).trim()); }}
          disabled={(!sali && !nombreOk) || estado === "entrando"}
          className="w-full gap-2 rounded-full"
        >
          {estado === "entrando" && <Loader2 className="h-4 w-4 animate-spin" />}
          {estado === "entrando" ? t("meet.link.joining") : sali ? t("meet.link.rejoin") : t("meet.link.join")}
        </Button>
        {!sali && <p className="text-center text-[11px] text-muted-foreground/70">{t("meet.link.nameHint")}</p>}
      </div>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </Marco>
  );
}

function Icono({ children }: { children: React.ReactNode }) {
  return <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">{children}</div>;
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="vidrio flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl px-6 py-8 md:px-10 md:py-10">
        {children}
      </div>
    </div>
  );
}
