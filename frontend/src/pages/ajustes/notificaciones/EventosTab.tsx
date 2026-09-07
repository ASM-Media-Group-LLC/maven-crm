import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Bell, Smartphone, Mail, Check, MessageCircle, Video, Inbox, PhoneCall, ClipboardCheck, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { usePermissions } from "@/hooks/usePermissions";
import { CATALOGO_DE_EVENTOS, type CanalDeAviso, type ModuloDeAvisos } from "@/lib/catalogoDeEventos";
import { urlDeTab } from "./tabs";

// Qué eventos avisan y por dónde. Cada chip escribe una fila en
// notification_preferences que leen el servidor (campana, push y correo) y los
// hooks del cliente (sonido/tarjeta dentro de Maven).
//
// Composición: una tarjeta por módulo, en cuadrícula, y por evento una fila con
// CHIPS de canal (En Maven · Celular · Correo). Solo se dibujan los canales que
// existen para ese evento; el activo se tiñe con el acento, el apagado queda en
// contorno. Antes eran tres columnas de interruptores por fila: 42 círculos
// azules iguales sin dónde posar la vista (Jhon, 07/09/2026: "se ve incluso
// más feo"). Los chips llevan su propio nombre, así que no hace falta un
// encabezado de columnas repetido.
const CANALES: { canal: CanalDeAviso; label: string; icon: LucideIcon; ayuda: string }[] = [
  { canal: "in_app", label: "En Maven", icon: Bell, ayuda: "La campana y el aviso (sonido, tarjeta) con Maven abierta." },
  { canal: "push", label: "Celular", icon: Smartphone, ayuda: "Llega al teléfono aunque Maven esté cerrada." },
  { canal: "email", label: "Correo", icon: Mail, ayuda: "Al correo de tu cuenta. Viene apagado; se prende evento por evento." },
];
// En Maven y Celular son opt-out; el interruptor "Todo" del módulo mueve esos
// dos. El correo es opt-in y se prende evento por evento.
const CANALES_DE_TODO: CanalDeAviso[] = ["in_app", "push"];

const ICONO_DEL_MODULO: Record<string, LucideIcon> = {
  Messenger: MessageCircle,
  Correo: Mail,
  Cowork: Video,
  Bandeja: Inbox,
  Closers: PhoneCall,
  Evaluador: ClipboardCheck,
  Creadoras: Sparkles,
};

function ChipCanal({
  canal, activo, onChange, evento,
}: { canal: CanalDeAviso; activo: boolean; onChange: (v: boolean) => void; evento: string }) {
  const def = CANALES.find((c) => c.canal === canal)!;
  const Icon = def.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={`${evento} · ${def.label}`}
      title={def.ayuda}
      onClick={() => onChange(!activo)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        activo
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {activo ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      <span>{def.label}</span>
    </button>
  );
}

const EventosTab = () => {
  const { user } = useAuth();
  const { preferences, isLoading, upsertPreference, upsertVarias, isCanalActivo } = useNotificationPreferences();
  const { settings } = useNotificationSettings();
  const { canAccess } = usePermissions();

  const modulos = CATALOGO_DE_EVENTOS.filter((m) => m.permiso === null || canAccess(m.permiso));

  const cambiar = (modulo: string, type: string, canal: CanalDeAviso, activo: boolean) => {
    const columna = canal === "push" ? "channel_push" : canal === "email" ? "channel_email" : "channel_in_app";
    upsertPreference.mutate(
      { module: modulo, notification_type: type, [columna]: activo },
      { onError: () => toast.error("No se pudo guardar la preferencia") },
    );
  };

  const todoActivo = (m: ModuloDeAvisos) =>
    m.eventos.every((e) => e.canales.filter((c) => CANALES_DE_TODO.includes(c)).every((c) => isCanalActivo(e.type, c)));

  const cambiarTodo = (m: ModuloDeAvisos) => {
    const activo = !todoActivo(m);
    upsertVarias.mutate(
      m.eventos.map((e) => ({
        module: m.modulo,
        notification_type: e.type,
        channel_in_app: e.canales.includes("in_app") ? activo : true,
        channel_push: e.canales.includes("push") ? activo : true,
      })),
      {
        onSuccess: () => toast.success(activo ? `${m.modulo}: avisos encendidos` : `${m.modulo}: avisos apagados`),
        onError: () => toast.error("No se pudo guardar la preferencia"),
      },
    );
  };

  if (modulos.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground text-sm">
        No tienes acceso a módulos con avisos configurables.
      </Card>
    );
  }

  const apagados = preferences.filter((p) => p.channel_in_app === false || p.channel_push === false).length;
  const porCorreo = preferences.filter((p) => p.channel_email === true).length;

  return (
    <div className="space-y-4" data-cargando={isLoading || undefined}>
      {/* Leyenda en una línea: qué significa cada chip. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {CANALES.map(({ canal, label, icon: Icon, ayuda }) => (
          <span key={canal} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">{label}</span>
            <span className="hidden sm:inline">
              · {canal === "email" && user?.email ? `a ${user.email}, apagado por defecto` : ayuda.replace(/\.$/, "")}
            </span>
          </span>
        ))}
        {(apagados > 0 || porCorreo > 0) && (
          <span className="ml-auto text-muted-foreground/80">
            {apagados > 0 && `${apagados} ${apagados === 1 ? "apagado" : "apagados"}`}
            {apagados > 0 && porCorreo > 0 && " · "}
            {porCorreo > 0 && `${porCorreo} por correo`}
          </span>
        )}
      </div>

      {!settings.push_enabled && (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs">
          <Smartphone className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            El celular todavía no recibe avisos: activa el push en{" "}
            <Link to={urlDeTab("canales")} className="font-medium underline underline-offset-2">
              Canales
            </Link>
            .
          </span>
        </div>
      )}

      {/* Columnas fluidas (no grid): las tarjetas tienen alturas muy distintas
          (Cowork 5 eventos, Correo 1) y en una cuadrícula quedaban huecos. */}
      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3 [column-fill:balance]">
        {modulos.map((m) => {
          const Icono = ICONO_DEL_MODULO[m.modulo] ?? Bell;
          return (
            <Card key={m.modulo} className="mb-4 p-0 break-inside-avoid">
              <header className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icono className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-semibold leading-tight">{m.modulo}</h3>
                  <p className="text-xs text-muted-foreground">
                    {m.eventos.length === 1 ? "1 evento" : `${m.eventos.length} eventos`}
                  </p>
                </div>
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  title="Prende o apaga En Maven y Celular de todos los eventos del módulo. El correo no se toca."
                >
                  <span className="text-xs text-muted-foreground">Todo</span>
                  <Switch
                    className="scale-90"
                    checked={todoActivo(m)}
                    onCheckedChange={() => cambiarTodo(m)}
                    aria-label={`Todos los avisos de ${m.modulo}`}
                  />
                </label>
              </header>
              <ul className="divide-y divide-border/60 border-t border-border/60">
                {m.eventos.map((e) => (
                  <li key={e.type} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-[10rem] flex-1">
                      <span className="block text-sm font-medium leading-tight">{e.label}</span>
                      {e.descripcion && (
                        <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">{e.descripcion}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CANALES.filter((c) => e.canales.includes(c.canal)).map(({ canal }) => (
                        <ChipCanal
                          key={canal}
                          canal={canal}
                          evento={e.label}
                          activo={isCanalActivo(e.type, canal)}
                          onChange={(v) => cambiar(m.modulo, e.type, canal, v)}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default EventosTab;
