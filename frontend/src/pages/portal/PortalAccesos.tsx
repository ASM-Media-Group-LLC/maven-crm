import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useToast } from "@/hooks/use-toast";
import { usePortal } from "@/hooks/usePortal";
import { claveDeErrorAccesos, useGuardarMisAccesos, useMisAccesos } from "@/hooks/useAccesosOF";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// «MIS ACCESOS» del portal (Jhon, 08/10): reemplaza el Formulario de accesos de
// Google. La creadora llena y cambia el correo, el usuario y la contraseña de
// su OnlyFans y si tiene doble verificación. La contraseña nunca se le devuelve:
// ve que está guardada y desde cuándo, y escribe una nueva si la cambió. En su
// agencia solo la ven los admins (edge creadora-accesos).
//
// Es la PRIMERA parte de «Mi ficha», no una pestaña aparte (Jhon, 08/10).
// ⚠️ Cada vez que alguien de la agencia ve la contraseña queda anotado, pero eso
// es para la agencia: a ella no se le dice (Jhon, 08/10).

/** Cuántas de las cuatro respuestas de accesos están puestas (para la pestaña). */
export function accesosListos(d: { of_correo: string | null; of_usuario: string | null; tiene_clave: boolean; doble_verificacion: boolean | null } | undefined): number {
  if (!d) return 0;
  return [!!d.of_correo, !!d.of_usuario, d.tiene_clave, d.doble_verificacion !== null].filter(Boolean).length;
}

export function SeccionDeAccesos() {
  const { t } = useLanguage();
  const f = useFormato();
  const { toast } = useToast();
  const { activa } = usePortal();
  const q = useMisAccesos(activa.creator_id);
  const guardar = useGuardarMisAccesos(activa.creator_id);
  const [correo, setCorreo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [doble, setDoble] = useState<boolean | null>(null);

  // Lo guardado, cuando llega (y al cambiar de agencia).
  useEffect(() => {
    if (!q.data) return;
    setCorreo(q.data.of_correo ?? "");
    setUsuario(q.data.of_usuario ?? "");
    setDoble(q.data.doble_verificacion);
    setClave("");
  }, [q.data]);

  const cambios = (() => {
    const d = q.data;
    const c: { of_correo?: string | null; of_usuario?: string | null; clave?: string; doble_verificacion?: boolean | null } = {};
    if ((correo.trim() || null) !== (d?.of_correo ?? null)) c.of_correo = correo.trim() || null;
    if ((usuario.trim() || null) !== (d?.of_usuario ?? null)) c.of_usuario = usuario.trim() || null;
    if (clave) c.clave = clave;
    if (doble !== (d?.doble_verificacion ?? null)) c.doble_verificacion = doble;
    return c;
  })();
  const hayCambios = Object.keys(cambios).length > 0;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hayCambios) return;
    guardar.mutate(cambios, {
      onSuccess: () => toast({ title: t("portal.misAccesos.guardados") }),
      onError: (err) => toast({ title: t(claveDeErrorAccesos(err)), variant: "destructive" }),
    });
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t("portal.misAccesos.texto")}</p>
      <div className="mt-4 max-w-3xl">
        <Card>
          <CardContent className="p-6">
            {q.isLoading ? (
              <div className="space-y-4"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
            ) : q.isError ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t("portal.misAccesos.errorCargar")}
                <div className="mt-3"><Button variant="outline" size="sm" className="border-border" onClick={() => q.refetch()}>{t("portal.shell.reintentar")}</Button></div>
              </div>
            ) : (
              <form onSubmit={enviar} className="space-y-5" autoComplete="off">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mis-of-correo">{t("portal.misAccesos.ofCorreo")}</Label>
                    <Input id="mis-of-correo" type="email" inputMode="email" autoComplete="email" className="min-h-11" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mis-of-usuario">{t("portal.misAccesos.ofUsuario")}</Label>
                    <Input id="mis-of-usuario" autoComplete="username" className="min-h-11" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mis-of-clave">{t("portal.misAccesos.clave")}</Label>
                  <div className="relative">
                    <Input id="mis-of-clave" type={verClave ? "text" : "password"} autoComplete="new-password" className="min-h-11 pr-11"
                      value={clave} onChange={(e) => setClave(e.target.value)}
                      placeholder={q.data?.tiene_clave ? "••••••••••" : undefined} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                      onClick={() => setVerClave((v) => !v)} aria-label={t(verClave ? "portal.accesos.ocultar" : "portal.accesos.mostrar")}>
                      {verClave ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {q.data?.tiene_clave
                      ? t("portal.misAccesos.claveGuardada", {
                          cuando: q.data.clave_cambiada_en ? formatDistanceToNow(new Date(q.data.clave_cambiada_en), { addSuffix: true, locale: f.fechas }) : "",
                        })
                      : t("portal.misAccesos.claveVacia")}
                  </p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t("portal.misAccesos.doble")}</legend>
                  <div className="flex gap-2">
                    {([[true, "portal.accesos.si"], [false, "portal.accesos.no"]] as const).map(([v, k]) => (
                      <Button key={String(v)} type="button" variant={doble === v ? "default" : "outline"}
                        className={cn("min-h-11 min-w-20", doble !== v && "border-border")} onClick={() => setDoble(v)} aria-pressed={doble === v}>
                        {t(k)}
                      </Button>
                    ))}
                  </div>
                </fieldset>

                <Button type="submit" className="min-h-11" disabled={!hayCambios || guardar.isPending}>
                  {guardar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />}
                  {t("portal.misAccesos.guardar")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("portal.misAccesos.seguridad")}
        </p>
      </div>
    </div>
  );
}
