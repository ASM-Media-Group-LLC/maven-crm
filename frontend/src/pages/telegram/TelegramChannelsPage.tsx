// Telegram — Cuentas (S0 del canal Telegram).
// Por ahora: el frame + entrada para VINCULAR una cuenta en el gateway (igual que
// WhatsApp linkea al panel del gateway de Baileys). El gateway de Telegram es un
// userbot MTProto (login por teléfono + código). La bandeja y el botón de chatear
// llegan en los próximos slices (S1 gateway multi-cuenta+envío → S2 tablas tg_* →
// S3 botón + inbox). No hay tablas tg_* todavía: esta pantalla es el punto de entrada.
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Button } from "@/components/ui/button";
import { ExternalLink, Radio, MessageSquarePlus, Inbox } from "lucide-react";

// Panel del gateway de Telegram (Dokploy) — ahí se vincula la cuenta (teléfono + código).
// El gateway de Telegram se sirve por HTTP (nip.io sin TLS) — verificado en vivo.
const TG_GATEWAY_MANAGER = "http://telegram-gw.147.93.3.97.nip.io/manager";

const TelegramChannelsPage = () => {
  return (
    <div className="space-y-5 px-6 py-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TelegramIcon className="h-6 w-6 text-sky-500" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Telegram</h1>
          <p className="text-xs text-muted-foreground">
            Canal de contacto por Telegram — cuentas y conexión. <span className="text-sky-500 font-medium">Beta</span>
          </p>
        </div>
      </div>

      {/* Conectar cuenta */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-semibold">Conectá una cuenta de Telegram</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          La cuenta se vincula en el <b>panel del gateway</b> (igual que el QR de WhatsApp, pero acá es por
          <b> teléfono + código</b> que te llega a la app de Telegram). Es una cuenta de usuario (MTProto),
          así que puede unirse a canales y conversar — no es un bot.
        </p>
        <Button asChild size="sm">
          <a href={TG_GATEWAY_MANAGER} target="_blank" rel="noreferrer">
            Abrir panel del gateway <ExternalLink className="h-4 w-4 ml-1" />
          </a>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Hoy el gateway soporta <b>una cuenta</b> (la que ya usa Promolog para leer canales). El soporte
          multi-cuenta + envío es el próximo paso.
        </p>
      </div>

      {/* Qué sigue */}
      <div className="rounded-lg border border-dashed p-5 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Próximos pasos</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <MessageSquarePlus className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
            <span><b>Botón de Telegram</b> al lado del de WhatsApp en Contactos y Creadoras, para abrir un chat.</span>
          </li>
          <li className="flex items-start gap-2">
            <Inbox className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
            <span><b>Bandeja de Telegram</b> dentro de Maven (recibir/responder), como la de WhatsApp.</span>
          </li>
          <li className="flex items-start gap-2">
            <Radio className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
            <span><b>Multi-cuenta + envío</b> en el gateway (vincular varios números).</span>
          </li>
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Ojo: como en WhatsApp, una cuenta de Telegram se puede restringir si se usa para contacto en frío
          masivo. Pensado para conversaciones tibias / entrantes.
        </p>
      </div>
    </div>
  );
};

export default TelegramChannelsPage;
