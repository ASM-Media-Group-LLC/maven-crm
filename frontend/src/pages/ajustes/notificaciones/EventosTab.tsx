import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Smartphone, Mail, Minus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { usePermissions } from "@/hooks/usePermissions";
import { CATALOGO_DE_EVENTOS, type CanalDeAviso, type ModuloDeAvisos } from "@/lib/catalogoDeEventos";
import { urlDeTab } from "./tabs";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// Qué eventos avisan y por dónde. Cada interruptor escribe una fila en
// notification_preferences que leen el servidor (campana, push y correo) y los
// hooks del cliente (sonido/tarjeta dentro de Maven). El catálogo dice qué
// canales aplican a cada evento; donde un canal no existe la celda queda vacía.
const CANALES: { canal: CanalDeAviso; label: TranslationKey; icon: typeof Bell; ayuda: TranslationKey }[] = [
  { canal: "in_app", label: "settings.notif.ev.inMaven", icon: Bell, ayuda: "settings.notif.ev.inMavenHelp" },
  { canal: "push", label: "settings.notif.ev.phone", icon: Smartphone, ayuda: "settings.notif.ev.phoneHelp" },
  { canal: "email", label: "settings.notif.ev.email", icon: Mail, ayuda: "settings.notif.ev.emailHelp" },
];

// El nombre del módulo se GUARDA en notification_preferences.module (es dato y
// no cambia); aquí solo se elige cómo se muestra. Uno que no esté en el mapa se
// muestra tal cual (los nombres propios: Messenger, Cowork, Closers).
const NOMBRE_DEL_MODULO: Record<string, TranslationKey> = {
  Correo: "settings.notif.ev.mod.mail",
  Bandeja: "settings.notif.ev.mod.inbox",
  Evaluador: "settings.notif.ev.mod.evaluator",
  Creadoras: "settings.notif.ev.mod.creators",
};
// En Maven y Celular son opt-out; el interruptor "Todo" del módulo mueve esos
// dos. El correo es opt-in y se prende evento por evento.
const CANALES_DE_TODO: CanalDeAviso[] = ["in_app", "push"];

const COLUMNAS =
  "grid grid-cols-[minmax(0,1fr),56px,56px,56px] md:grid-cols-[minmax(0,1fr),78px,78px,78px] gap-1 items-center";

const EventosTab = () => {
  const { user } = useAuth();
  const { preferences, isLoading, upsertPreference, upsertVarias, isCanalActivo } = useNotificationPreferences();
  const { settings } = useNotificationSettings();
  const { canAccess } = usePermissions();
  const { t } = useLanguage();
  const nombreDe = (modulo: string) => (NOMBRE_DEL_MODULO[modulo] ? t(NOMBRE_DEL_MODULO[modulo]) : modulo);

  const modulos = CATALOGO_DE_EVENTOS.filter((m) => m.permiso === null || canAccess(m.permiso));

  const cambiar = (modulo: string, type: string, canal: CanalDeAviso, activo: boolean) => {
    const columna = canal === "push" ? "channel_push" : canal === "email" ? "channel_email" : "channel_in_app";
    upsertPreference.mutate(
      { module: modulo, notification_type: type, [columna]: activo },
      { onError: () => toast.error(t("settings.notif.ev.couldNotSave")) },
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
        onSuccess: () =>
          toast.success(t(activo ? "settings.notif.ev.allOn" : "settings.notif.ev.allOff", { module: nombreDe(m.modulo) })),
        onError: () => toast.error(t("settings.notif.ev.couldNotSave")),
      },
    );
  };

  if (modulos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t("settings.notif.ev.noModules")}
        </CardContent>
      </Card>
    );
  }

  const apagados = preferences.filter((p) => p.channel_in_app === false || p.channel_push === false).length;
  const porCorreo = preferences.filter((p) => p.channel_email === true).length;

  return (
    <div className="space-y-4" data-cargando={isLoading || undefined}>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("settings.notif.ev.title")}</CardTitle>
          <CardDescription className="text-xs space-y-1">
            <span className="block">
              <Bell className="inline h-3 w-3 mr-1 -mt-0.5" />
              <strong>{t("settings.notif.ev.inMaven")}</strong>: {t("settings.notif.ev.inMavenLong")}
            </span>
            <span className="block">
              <Smartphone className="inline h-3 w-3 mr-1 -mt-0.5" />
              <strong>{t("settings.notif.ev.phone")}</strong>: {t("settings.notif.ev.phoneLong")}{" "}
              {settings.push_enabled ? (
                t("settings.notif.ev.pushOn")
              ) : (
                <>
                  {t("settings.notif.ev.pushOffBefore")}{" "}
                  <Link to={urlDeTab("canales")} className="underline underline-offset-2 hover:text-foreground">
                    {t("settings.notif.tab.channels")}
                  </Link>
                  .
                </>
              )}
            </span>
            <span className="block">
              <Mail className="inline h-3 w-3 mr-1 -mt-0.5" />
              <strong>{t("settings.notif.ev.email")}</strong>:{" "}
              {t("settings.notif.ev.emailLong", { email: user?.email ?? t("settings.notif.ev.yourMavenEmail") })}
            </span>
            {(apagados > 0 || porCorreo > 0) && (
              <span className="block text-muted-foreground/80">
                {apagados > 0 && t(apagados === 1 ? "settings.notif.ev.offOne" : "settings.notif.ev.offMany", { n: apagados })}
                {apagados > 0 && porCorreo > 0 && " · "}
                {porCorreo > 0 && t(porCorreo === 1 ? "settings.notif.ev.byEmailOne" : "settings.notif.ev.byEmailMany", { n: porCorreo })}
                .
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
                <CardTitle className="text-base">{nombreDe(m.modulo)}</CardTitle>
                <CardDescription className="text-xs">
                  {m.eventos.length === 1 ? t("settings.notif.ev.oneEvent") : t("settings.notif.ev.nEvents", { n: m.eventos.length })}
                </CardDescription>
              </div>
              <label
                className="flex items-center gap-2 shrink-0 cursor-pointer"
                title={t("settings.notif.ev.allHelp")}
              >
                <span className="text-xs text-muted-foreground">{t("settings.notif.ev.all")}</span>
                <Switch
                  checked={todoActivo(m)}
                  onCheckedChange={() => cambiarTodo(m)}
                  aria-label={t("settings.notif.ev.allAria", { module: nombreDe(m.modulo) })}
                />
              </label>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-3">
            <div className="grid gap-1">
              <div className={`${COLUMNAS} px-2`}>
                <span className="text-xs font-medium text-muted-foreground">{t("settings.notif.ev.event")}</span>
                {CANALES.map(({ canal, label, icon: Icon, ayuda }) => (
                  <div key={canal} className="flex items-center justify-center gap-1" title={t(ayuda)}>
                    <Icon className="h-3.5 w-3.5 md:h-3 md:w-3 text-muted-foreground" aria-label={t(label)} />
                    <span className="hidden md:inline text-[11px] font-medium text-muted-foreground">{t(label)}</span>
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
                          aria-label={`${e.label} · ${t(label)}`}
                        />
                      </div>
                    ) : (
                      <div
                        key={canal}
                        className="flex justify-center text-muted-foreground/40"
                        title={t("settings.notif.ev.naHelp")}
                        aria-label={t("settings.notif.ev.naAria", { event: e.label, channel: t(label) })}

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
