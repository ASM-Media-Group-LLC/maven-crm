import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Building2, KeyRound, LogOut, User as UserIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import FormContrasena from "./FormContrasena";

// Ajustes del portal, armado como Ajustes de Maven (Jhon, 08/10: «esta parte se
// ve bien fea»): a la izquierda el riel con las secciones y, al final del riel,
// cerrar sesión (siempre lo último, Jhon 06/10); a la derecha la sección, que
// ocupa todo el ancho. Antes eran tarjetas sueltas en dos columnas, con media
// tarjeta vacía en un monitor ancho y «Cerrar sesión» flotando abajo.
//
// «Mi cuenta» lleva lo mismo que la de Maven (perfil, contraseña y la MISMA
// tarjeta de Apariencia del equipo); en pantalla ancha, perfil y contraseña a
// la izquierda y Apariencia a la derecha.

type Seccion = "cuenta" | "agencias";
const SECCIONES: Seccion[] = ["cuenta", "agencias"];

export default function PortalAjustes() {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pedida = params.get("seccion") as Seccion | null;
  const activa: Seccion = pedida && SECCIONES.includes(pedida) ? pedida : "cuenta";

  const ir = (s: Seccion) => {
    const siguiente = new URLSearchParams(params);
    if (s === "cuenta") siguiente.delete("seccion");
    else siguiente.set("seccion", s);
    setParams(siguiente, { replace: true });
  };

  const salir = async () => {
    await signOut();
    navigate("/portal/entrar", { replace: true });
  };

  const pestanas = [
    { key: "cuenta" as const, label: t("portal.ajustes.tabCuenta"), icon: UserIcon },
    { key: "agencias" as const, label: t("portal.ajustes.tabAgencias"), icon: Building2 },
  ];

  return (
    // En el celular el riel se apila arriba como tira; desde md es columna.
    // <Page> sin scroll ni padding: el riel va pegado al menú y cada lado
    // pone su scroll y su aire.
    <Page scroll={false} padded={false}>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
      <aside className="sub-rail w-full shrink-0 border-b bg-card/40 p-3 md:w-64 md:border-b-0 md:border-r md:p-4">
        <div className="md:sticky md:top-4">
          <div className="hidden px-2 pb-3 text-xs font-semibold text-foreground/70 md:block">{t("portal.ajustes.conectada")}</div>
          <nav className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
            {pestanas.map(({ key, label, icon: Icono }) => (
              <button
                key={key}
                type="button"
                onClick={() => ir(key)}
                aria-current={activa === key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-auto shrink-0 items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2.5 text-sm sidebar-glass-hover md:w-full",
                  activa === key && "sidebar-glass-active font-medium",
                )}
              >
                <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>

          {/* Cerrar sesión: la última opción del riel, separada porque es una
              acción y no una sección (igual que en Ajustes de Maven). En el
              celular el riel queda ARRIBA, así que ahí va al final de la página. */}
          <div className="mt-4 hidden border-t border-border/60 pt-4 md:block">
            <BotonSalir onClick={salir} />
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1 p-4 sm:p-6 md:overflow-y-auto lg:p-8">
        {activa === "cuenta" ? <MiCuenta /> : <Agencias />}
        <div className="mt-6 border-t border-border/60 pt-4 md:hidden">
          <BotonSalir onClick={salir} />
        </div>
      </section>
    </div>
    </Page>
  );
}

function BotonSalir({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <LogOut className="h-4 w-4 shrink-0 transition-colors group-hover:text-destructive" aria-hidden="true" />
      <span className="truncate">{t("portal.shell.salir")}</span>
    </button>
  );
}

function MiCuenta() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activa } = usePortal();
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const nombre = nombreParaMostrar(activa);

  return (
    <div className="space-y-4">
      <PageHeader title={t("portal.ajustes.tabCuenta")} subtitle={t("portal.ajustes.cuentaTexto")} />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {/* Su perfil: la tarjeta de «Mi cuenta» de Maven, con la foto de su ficha. */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full">
                  <UserAvatar name={nombre} src={activa.foto} seed={activa.creator_id} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{nombre}</div>
                  <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("portal.ajustes.correoTexto")} {t("portal.ajustes.fotoTexto")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t("portal.ajustes.seguridad")}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.ajustes.seguridadTexto")}</p>
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
                <Button variant="outline" className="mt-4 min-h-11 border-border" onClick={() => setCambiandoClave(true)}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("portal.ajustes.cambiarContrasena")}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <TarjetaDeApariencia conDensidad={false} />
      </div>
    </div>
  );
}

function Agencias() {
  const { t } = useLanguage();
  const { fichas, activa, elegir } = usePortal();
  return (
    <div className="space-y-4">
      <PageHeader title={t("portal.ajustes.agencias")} subtitle={t("portal.ajustes.agenciasTexto")} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fichas.map((f) => {
          const esta = f.creator_id === activa.creator_id;
          return (
            <li key={f.creator_id}>
              <Card className={cn("h-full", esta && "border-primary/40")}>
                <CardContent className="flex h-full items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.agencia}</span>
                  {esta ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t("portal.ajustes.agenciaActiva")}</span>
                  ) : (
                    <Button variant="outline" size="sm" className="min-h-9 shrink-0 border-border" onClick={() => elegir(f.creator_id)}>
                      {t("portal.ajustes.usarAgencia")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
