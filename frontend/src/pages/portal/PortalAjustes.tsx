import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, KeyRound, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { nombreParaMostrar, usePortal } from "@/hooks/usePortal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/UserAvatar";
import { TarjetaDeApariencia } from "@/components/ajustes/TarjetaDeApariencia";
import FormContrasena from "./FormContrasena";

// Ajustes del portal, como «Mi cuenta» de Maven (Jhon, 06/10): su tarjeta con
// foto, nombre y correo; la MISMA tarjeta de Apariencia del equipo (tema, skins
// y preferencias, que se guardan en su perfil y la siguen a otro celular); sus
// agencias y, siempre al final, cerrar sesión.

export default function PortalAjustes() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { fichas, activa, elegir } = usePortal();
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const nombre = nombreParaMostrar(activa);

  const salir = async () => {
    await signOut();
    navigate("/portal/entrar", { replace: true });
  };

  return (
    <Page>
      <PageHeader title={t("portal.ajustes.titulo")} />

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* Su cuenta: la tarjeta de «Mi cuenta» de Maven, con la foto de su ficha. */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full">
                  <UserAvatar name={nombre} src={activa.foto} seed={activa.creator_id} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{nombre}</div>
                  <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("portal.ajustes.correoTexto")}</p>
                </div>
              </div>
              {cambiandoClave ? (
                <div className="mt-5 border-t border-border pt-5">
                  <FormContrasena
                    onListo={() => {
                      setCambiandoClave(false);
                      toast({ title: t("portal.contrasena.lista") });
                    }}
                  />
                </div>
              ) : (
                <Button variant="outline" className="mt-5 min-h-11" onClick={() => setCambiandoClave(true)}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("portal.ajustes.cambiarContrasena")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t("portal.ajustes.agencias")}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.ajustes.agenciasTexto")}</p>
                </div>
              </div>
              <ul className="space-y-2">
                {fichas.map((f) => {
                  const esta = f.creator_id === activa.creator_id;
                  return (
                    <li key={f.creator_id} className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-medium">{f.agencia}</span>
                      {esta ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t("portal.ajustes.agenciaActiva")}</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="min-h-9 shrink-0" onClick={() => elegir(f.creator_id)}>
                          {t("portal.ajustes.usarAgencia")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <TarjetaDeApariencia conDensidad={false} />
      </div>

      {/* Cerrar sesión, siempre lo último (Jhon, 06/10), como en Ajustes de Maven. */}
      <Button variant="outline" className="mt-4 min-h-11 w-full text-destructive hover:text-destructive lg:w-auto lg:px-8" onClick={salir}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("portal.shell.salir")}
      </Button>
    </Page>
  );
}
