import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Smartphone, Minus } from "lucide-react";
import { toast } from "sonner";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { usePermissions } from "@/hooks/usePermissions";
import { CATALOGO_DE_EVENTOS, type CanalDeAviso, type ModuloDeAvisos } from "@/lib/catalogoDeEventos";

// Qué eventos avisan y por dónde. Cada interruptor escribe una fila en
// notification_preferences que leen el servidor (campana y push) y los hooks
// del cliente (sonido/tarjeta dentro de Maven). El catálogo dice qué canales
// aplican a cada evento; donde un canal no existe la celda queda vacía.
const CANALES: { canal: CanalDeAviso; label: string; icon: typeof Bell; ayuda: string }[] = [
  { canal: "in_app", label: "En Maven", icon: Bell, ayuda: "La campana y el aviso dentro de Maven" },
  { canal: "push", label: "Celular", icon: Smartphone, ayuda: "El teléfono, con Maven cerrada" },
];

const COLUMNAS = "grid grid-cols-[minmax(0,1fr),78px,78px] gap-1 items-center";

const EventosTab = () => {
  const { preferences, isLoading, upsertPreference, upsertVarias, isCanalActivo } = useNotificationPreferences();
  const { settings } = useNotificationSettings();
  const { canAccess } = usePermissions();

  const modulos = CATALOGO_DE_EVENTOS.filter((m) => m.permiso === null || canAccess(m.permiso));

  const cambiar = (modulo: string, type: string, canal: CanalDeAviso, activo: boolean) => {
    upsertPreference.mutate(
      { module: modulo, notification_type: type, [canal === "push" ? "channel_push" : "channel_in_app"]: activo },
      { onError: () => toast.error("No se pudo guardar la preferencia") },
    );
  };

  const todoActivo = (m: ModuloDeAvisos) =>
    m.eventos.every((e) => e.canales.every((c) => isCanalActivo(e.type, c)));

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
        onSuccess: () => toast.success(activo ? `${m.modulo}: todos los avisos encendidos` : `${m.modulo}: avisos apagados`),
        onError: () => toast.error("No se pudo guardar la preferencia"),
      },
    );
  };

  if (modulos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No tienes acceso a módulos con avisos configurables.
        </CardContent>
      </Card>
    );
  }

  const cuantasApagadas = preferences.filter((p) => p.channel_in_app === false || p.channel_push === false).length;

  return (
    <div className="space-y-4" data-cargando={isLoading || undefined}>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qué te avisa Maven y por dónde</CardTitle>
          <CardDescription className="text-xs space-y-1">
            <span className="block">
              <Bell className="inline h-3 w-3 mr-1 -mt-0.5" />
              <strong>En Maven</strong>: la campana y el aviso (sonido, tarjeta) con Maven abierta.
            </span>
            <span className="block">
              <Smartphone className="inline h-3 w-3 mr-1 -mt-0.5" />
              <strong>Celular</strong>: llega al teléfono aunque Maven esté cerrada.
              {settings.push_enabled
                ? " Lo tienes activo."
                : " Para que lleguen, activa el push en la pestaña Canales."}
            </span>
            {cuantasApagadas > 0 && (
              <span className="block text-muted-foreground/80">
                Todo viene encendido; tienes {cuantasApagadas} {cuantasApagadas === 1 ? "aviso apagado" : "avisos apagados"}.
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {modulos.map((m) => (
        <Card key={m.modulo} className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{m.modulo}</CardTitle>
                <CardDescription className="text-xs">
                  {m.eventos.length === 1 ? "1 evento" : `${m.eventos.length} eventos`}
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <span className="text-xs text-muted-foreground">Todo</span>
                <Switch
                  checked={todoActivo(m)}
                  onCheckedChange={() => cambiarTodo(m)}
                  aria-label={`Todos los avisos de ${m.modulo}`}
                />
              </label>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-3">
            <div className="grid gap-1">
              <div className={`${COLUMNAS} px-2`}>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Evento</span>
                {CANALES.map(({ canal, label, icon: Icon, ayuda }) => (
                  <div key={canal} className="flex items-center justify-center gap-1" title={ayuda}>
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              {m.eventos.map((e) => (
                <div
                  key={e.type}
                  className={`${COLUMNAS} rounded-md px-2 py-2 hover:bg-muted/50 transition-colors`}
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">{e.label}</span>
                    {e.descripcion && (
                      <span className="block text-xs text-muted-foreground mt-0.5">{e.descripcion}</span>
                    )}
                  </div>
                  {CANALES.map(({ canal, label }) =>
                    e.canales.includes(canal) ? (
                      <div key={canal} className="flex justify-center">
                        <Switch
                          checked={isCanalActivo(e.type, canal)}
                          onCheckedChange={(v) => cambiar(m.modulo, e.type, canal, v)}
                          aria-label={`${e.label} · ${label}`}
                        />
                      </div>
                    ) : (
                      <div
                        key={canal}
                        className="flex justify-center text-muted-foreground/40"
                        title="Este aviso no existe por este canal"
                        aria-label={`${e.label} · ${label}: no aplica`}
                      >
                        <Minus className="h-4 w-4" />
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default EventosTab;
