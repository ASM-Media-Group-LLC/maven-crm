import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { CircleCheck, Clapperboard, History, KeyRound, Loader2, Mail, Send, UserX } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useToast } from "@/hooks/use-toast";
import { ETIQUETA_AGENCIA, esCampoFicha } from "@/lib/portal/ficha";
import {
  type AccionPortal,
  claveDeError,
  useAccesoPortal,
  useAccionPortal,
  useActividadPortal,
  usePuedeInvitarAlPortal,
} from "./useAccesoPortal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import AccesosOFCard, { type DatosDeFicha } from "./AccesosOFCard";

// PESTAÑA PORTAL del perfil de la creadora (lado de la agencia): si tiene acceso
// a su espacio, desde cuándo entra, quién la invitó y lo último que cambió. Dar,
// reenviar, cambiar el correo y quitar: solo con el permiso «Invitar al portal»
// (la edge portal-creadoras lo vuelve a comprobar).

interface Props {
  creatorId: string;
  /** El correo de su ficha como lo devuelve v_creators (enmascarado si no eres admin). */
  correoFicha: string | null;
  /** Correo, nombre, Instagram y WhatsApp de su ficha (v_creators: enmascarados si no eres admin). */
  ficha: DatosDeFicha;
  onVerHistorial: () => void;
}

export default function PortalTabContent({ creatorId, correoFicha, ficha, onVerHistorial }: Props) {
  const { t } = useLanguage();
  const f = useFormato();
  const { toast } = useToast();
  const acceso = useAccesoPortal(creatorId);
  const actividad = useActividadPortal(creatorId);
  const puede = usePuedeInvitarAlPortal();
  const accion = useAccionPortal(creatorId);
  const [dialogo, setDialogo] = useState<"invitar" | "correo" | "quitar" | null>(null);
  const [correo, setCorreo] = useState("");

  const ejecutar = (a: AccionPortal, conCorreo?: string) =>
    accion.mutate(
      { accion: a, correo: conCorreo },
      {
        onSuccess: (r) => {
          setDialogo(null);
          setCorreo("");
          const visible = r.correo_visible ?? "";
          if (a === "quitar") toast({ title: t("portal.acceso.quitada") });
          else if (r.correo_enviado === false) toast({ title: t(a === "invitar" ? "portal.acceso.invitadaSinCorreo" : "portal.acceso.correoNoSalio"), variant: "destructive" });
          else if (a === "invitar") toast({ title: t("portal.acceso.invitada", { correo: visible }) });
          else if (a === "reenviar") toast({ title: t("portal.acceso.enlaceEnviado", { correo: visible }) });
          else toast({ title: t("portal.acceso.correoCambiado", { correo: visible }) });
        },
        onError: (e) => toast({ title: t(claveDeError(e)), variant: "destructive" }),
      },
    );

  if (acceso.isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3"><Skeleton className="h-4 w-64" /><Skeleton className="h-10 w-40" /></CardContent>
      </Card>
    );
  }
  if (acceso.isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("portal.acceso.errorCargar")}
          <div className="mt-3"><Button variant="outline" size="sm" onClick={() => acceso.refetch()}>{t("portal.shell.reintentar")}</Button></div>
        </CardContent>
      </Card>
    );
  }

  const cuenta = acceso.data;
  const estado = !cuenta
    ? { texto: t("portal.acceso.sinAcceso"), variante: "secondary" as const }
    : !cuenta.ultimo_acceso
      ? { texto: t("portal.acceso.pendiente"), variante: "outline" as const }
      : {
          texto: t("portal.acceso.activa", { cuando: formatDistanceToNow(new Date(cuenta.ultimo_acceso), { addSuffix: true, locale: f.fechas }) }),
          variante: "default" as const,
        };

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              {t("portal.acceso.titulo")}
            </CardTitle>
            <Badge variant={estado.variante}>{estado.texto}</Badge>
          </div>
          <CardDescription>{t("portal.acceso.descripcion")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {cuenta && (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("portal.acceso.correo")}</dt>
                <dd className="mt-0.5 break-all font-medium">{cuenta.correo_visible}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("portal.acceso.invitadaPor")}</dt>
                <dd className="mt-0.5 font-medium">
                  {t("portal.acceso.invitadaPorTexto", {
                    quien: cuenta.invitadaPorNombre ?? t("portal.acceso.alguien"),
                    fecha: format(new Date(cuenta.invitada_en), "d MMM yyyy", { locale: f.fechas }),
                  })}
                </dd>
              </div>
            </dl>
          )}

          {puede ? (
            <div className="flex flex-wrap gap-2">
              {!cuenta ? (
                <Button onClick={() => setDialogo("invitar")}>
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("portal.acceso.darAcceso")}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => ejecutar("reenviar")} disabled={accion.isPending}>
                    {accion.isPending && accion.variables?.accion === "reenviar"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {t("portal.acceso.reenviar")}
                  </Button>
                  <Button variant="outline" onClick={() => setDialogo("correo")} disabled={accion.isPending}>
                    {t("portal.acceso.cambiarCorreo")}
                  </Button>
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialogo("quitar")} disabled={accion.isPending}>
                    <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("portal.acceso.quitar")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("portal.acceso.sinPermiso")}</p>
          )}

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("portal.acceso.queHace")}</h3>
            <ul className="mt-2 space-y-2 text-sm">
              <li className="flex items-start gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t("portal.acceso.puedeFicha")}</li>
              {/* Ya funciona desde la fase 2 (#2029): se ve en la pestaña Contenido. */}
              <li className="flex items-start gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t("portal.acceso.puedeContenido")}</li>
              <li className="flex items-start gap-2 text-muted-foreground"><Clapperboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("portal.acceso.puedePedidos")}</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{t("portal.acceso.nuncaVe")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("portal.acceso.otraAgencia")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" aria-hidden="true" />
            {t("portal.acceso.ultimo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actividad.data && actividad.data.length > 0 ? (
            <ul className="space-y-3">
              {actividad.data.map((h) => {
                const campo = h.action.slice("portal:".length);
                return (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium">{t("portal.acceso.cambio", { campo: esCampoFicha(campo) ? t(ETIQUETA_AGENCIA[campo]) : campo })}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.created_at ? formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: f.fechas }) : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("portal.acceso.ultimoVacio")}</p>
          )}
          <Button variant="link" className="mt-3 h-auto px-0" onClick={onVerHistorial}>{t("portal.acceso.verHistorial")}</Button>
        </CardContent>
      </Card>

      {/* Los accesos de OnlyFans (08/10): a todo el ancho, debajo. */}
      <AccesosOFCard creatorId={creatorId} ficha={ficha} />

      {/* Darle acceso / cambiar el correo */}
      <Dialog open={dialogo === "invitar" || dialogo === "correo"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ejecutar(dialogo === "invitar" ? "invitar" : "cambiar_correo", correo.trim());
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t(dialogo === "invitar" ? "portal.acceso.dialogoTitulo" : "portal.acceso.dialogoCorreoTitulo")}</DialogTitle>
              <DialogDescription>{t(dialogo === "invitar" ? "portal.acceso.dialogoTexto" : "portal.acceso.dialogoCorreoTexto")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="portal-correo-creadora">{t(dialogo === "invitar" ? "portal.acceso.correoPersonal" : "portal.acceso.correoNuevo")}</Label>
              <Input
                id="portal-correo-creadora"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required={dialogo === "correo" || !correoFicha}
              />
              {dialogo === "invitar" && (
                <p className="text-xs text-muted-foreground">
                  {correoFicha ? t("portal.acceso.usarFicha", { correo: correoFicha }) : t("portal.acceso.sinCorreoFicha")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogo(null)}>{t("portal.acceso.cancelar")}</Button>
              <Button type="submit" disabled={accion.isPending}>
                {accion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t(dialogo === "invitar" ? "portal.acceso.enviar" : "portal.acceso.cambiarCorreo")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quitar el acceso */}
      <AlertDialog open={dialogo === "quitar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal.acceso.quitarTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>{t("portal.acceso.quitarTexto")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("portal.acceso.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                ejecutar("quitar");
              }}
            >
              {t("portal.acceso.quitar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
