import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, Eye, EyeOff, FileSpreadsheet, KeyRound, Loader2, Pencil, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useToast } from "@/hooks/use-toast";
import {
  type AccesosOF,
  type CambiosAccesos,
  claveDeErrorAccesos,
  type EventoAcceso,
  pedirClave,
  useAccesosOF,
  useGuardarAccesosOF,
} from "@/hooks/useAccesosOF";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import ImportarAccesosDialog from "./ImportarAccesosDialog";

// ACCESOS DE ONLYFANS en la pestaña Portal (Jhon, 08/10): lo que antes llegaba
// por el Formulario de accesos de Google. Los datos de contacto salen de la
// ficha; los de OnlyFans, de la edge creadora-accesos. TODA la tarjeta es solo
// para admins (PortalTabContent ni la monta para el resto, y la edge contesta
// solo_admin). La contraseña se pide al verla o copiarla, y cada vez queda
// anotado; acá vive en el estado del componente unos segundos y nunca en la caché.

const MOSTRAR_CLAVE_MS = 30_000;

export interface DatosDeFicha {
  correo: string | null;
  nombre: string | null;
  instagram: string | null;
  whatsapp: string | null;
}

const enmascarado = (v: string | null) => !!v && v.includes("•");

function useCopiar() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(null), 1500);
    return () => window.clearTimeout(id);
  }, [copiado]);
  const copiar = async (clave: string, texto: string, aviso?: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      if (aviso) toast({ title: aviso });
    } catch {
      toast({ title: t("portal.accesos.error.generico"), variant: "destructive" });
    }
  };
  return { copiado, copiar };
}

function Dato({ etiqueta, valor, copiable, idCopia, copiado, onCopiar }: {
  etiqueta: string;
  valor: string | null;
  copiable: boolean;
  idCopia: string;
  copiado: string | null;
  onCopiar: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
        <dd className={cn("mt-0.5 truncate font-medium", !valor && "font-normal text-muted-foreground")}>{valor || t("portal.accesos.sinDato")}</dd>
      </div>
      {valor && copiable && (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onCopiar} aria-label={t("portal.accesos.copiar", { que: etiqueta })}>
          {copiado === idCopia ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </Button>
      )}
    </div>
  );
}

export default function AccesosOFCard({ creatorId, ficha }: { creatorId: string; ficha: DatosDeFicha }) {
  const { t } = useLanguage();
  const f = useFormato();
  const { toast } = useToast();
  const q = useAccesosOF(creatorId);
  const { copiado, copiar } = useCopiar();
  const [clave, setClave] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState<"ver" | "copiar" | null>(null);
  const [editando, setEditando] = useState(false);
  const [importando, setImportando] = useState(false);

  // La contraseña a la vista se esconde sola.
  useEffect(() => {
    if (!clave) return;
    const id = window.setTimeout(() => setClave(null), MOSTRAR_CLAVE_MS);
    return () => window.clearTimeout(id);
  }, [clave]);

  const hace = (iso: string | null | undefined) =>
    iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: f.fechas }) : "";

  const traerClave = async (para: "ver" | "copiar") => {
    setPidiendo(para);
    try {
      const c = await pedirClave(creatorId, para);
      if (para === "ver") setClave(c);
      else await copiar("clave", c, t("portal.accesos.claveCopiada"));
      void q.refetch();
    } catch (e) {
      toast({ title: t(claveDeErrorAccesos(e)), variant: "destructive" });
    } finally {
      setPidiendo(null);
    }
  };

  if (q.isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader><Skeleton className="h-6 w-56" /></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></CardContent>
      </Card>
    );
  }
  if (q.isError) {
    return (
      <Card className="lg:col-span-2">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t(claveDeErrorAccesos(q.error))}
          <div className="mt-3"><Button variant="outline" size="sm" className="border-border" onClick={() => q.refetch()}>{t("portal.shell.reintentar")}</Button></div>
        </CardContent>
      </Card>
    );
  }

  const a: AccesosOF | null = q.data?.accesos ?? null;
  const actualizado = a?.actualizado_en
    ? t(
        a.actualizado_desde === "creadora" ? "portal.accesos.actualizadoCreadora"
          : a.actualizado_desde === "importador" ? "portal.accesos.actualizadoImportador"
          : "portal.accesos.actualizadoEquipo",
        { cuando: hace(a.actualizado_en) },
      )
    : null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            {t("portal.accesos.titulo")}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-9 border-border" onClick={() => setImportando(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.accesos.importar")}
            </Button>
            <Button variant="outline" size="sm" className="min-h-9 border-border" onClick={() => setEditando(true)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.accesos.editar")}
            </Button>
          </div>
        </div>
        <CardDescription>{t("portal.accesos.descripcion")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-6 md:grid-cols-2">
          {/* De su ficha: lo mismo que se ve arriba en el perfil, a mano para copiar. */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("portal.accesos.deLaFicha")}</h3>
            <dl>
              {([
                ["correo", t("portal.accesos.correo"), ficha.correo],
                ["nombre", t("portal.accesos.nombre"), ficha.nombre],
                ["instagram", t("portal.accesos.instagram"), ficha.instagram],
                ["whatsapp", t("portal.accesos.whatsapp"), ficha.whatsapp],
              ] as const).map(([id, etiqueta, valor]) => (
                <Dato key={id} idCopia={id} etiqueta={etiqueta} valor={valor} copiable={!enmascarado(valor)}
                  copiado={copiado} onCopiar={() => valor && void copiar(id, valor)} />
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("portal.accesos.deOnlyFans")}</h3>
            {!a ? (
              <p className="py-2 text-sm text-muted-foreground">{t("portal.accesos.vacio")}</p>
            ) : (
              <dl>
                <Dato idCopia="of_correo" etiqueta={t("portal.accesos.ofCorreo")} valor={a.of_correo} copiable={!enmascarado(a.of_correo)}
                  copiado={copiado} onCopiar={() => a.of_correo && void copiar("of_correo", a.of_correo)} />
                <Dato idCopia="of_usuario" etiqueta={t("portal.accesos.ofUsuario")} valor={a.of_usuario} copiable
                  copiado={copiado} onCopiar={() => a.of_usuario && void copiar("of_usuario", a.of_usuario)} />

                {/* La contraseña: se pide al verla o copiarla, y cada vez queda anotado. */}
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t("portal.accesos.clave")}</dt>
                    <dd className="mt-0.5 truncate font-medium">
                      {!a.tiene_clave ? (
                        <span className="font-normal text-muted-foreground">{t("portal.accesos.sinClave")}</span>
                      ) : (
                        <span className="font-mono">{clave ?? "••••••••••"}</span>
                      )}
                    </dd>
                    {a.tiene_clave && a.clave_cambiada_en && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.accesos.claveCambiada", { cuando: hace(a.clave_cambiada_en) })}</p>
                    )}
                  </div>
                  {a.tiene_clave && (
                    <div className="flex shrink-0 items-center">
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={!!pidiendo}
                        onClick={() => (clave ? setClave(null) : void traerClave("ver"))}
                        aria-label={t(clave ? "portal.accesos.ocultar" : "portal.accesos.mostrar")}>
                        {pidiendo === "ver" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : clave ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={!!pidiendo}
                        onClick={() => void traerClave("copiar")} aria-label={t("portal.accesos.copiar", { que: t("portal.accesos.clave") })}>
                        {pidiendo === "copiar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : copiado === "clave" ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <dt className="text-xs text-muted-foreground">{t("portal.accesos.doble")}</dt>
                  <dd>
                    {a.doble_verificacion === null ? (
                      <span className="text-sm text-muted-foreground">{t("portal.accesos.sinDato")}</span>
                    ) : (
                      <Badge variant={a.doble_verificacion ? "default" : "secondary"}>
                        {t(a.doble_verificacion ? "portal.accesos.si" : "portal.accesos.no")}
                      </Badge>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        </div>

        {actualizado && <p className="text-xs text-muted-foreground">{actualizado}</p>}

        {(q.data?.eventos.length ?? 0) > 0 && (
          <div className="border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("portal.accesos.registro")}
              <span className="text-xs font-normal text-muted-foreground">· {t("portal.accesos.registroTexto")}</span>
            </h3>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {q.data!.eventos.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{textoDeEvento(e, t)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{hace(e.en)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {editando && a !== undefined && (
        <EditarAccesosDialog creatorId={creatorId} accesos={a} onCerrar={() => setEditando(false)} />
      )}
      {importando && <ImportarAccesosDialog onCerrar={() => setImportando(false)} />}
    </Card>
  );
}

function textoDeEvento(e: EventoAcceso, t: ReturnType<typeof useLanguage>["t"]): string {
  const quien = e.quien || t("portal.accesos.alguien");
  if (e.accion === "guardar") {
    return e.desde === "creadora" ? t("portal.accesos.evento.guardar_creadora") : t("portal.accesos.evento.guardar_equipo", { quien });
  }
  return t(`portal.accesos.evento.${e.accion}` as const, { quien });
}

function EditarAccesosDialog({ creatorId, accesos, onCerrar }: { creatorId: string; accesos: AccesosOF | null; onCerrar: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarAccesosOF(creatorId);
  const [correo, setCorreo] = useState(accesos?.of_correo ?? "");
  const [usuario, setUsuario] = useState(accesos?.of_usuario ?? "");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [borrarClave, setBorrarClave] = useState(false);
  const [doble, setDoble] = useState<"si" | "no" | "">(
    accesos?.doble_verificacion === true ? "si" : accesos?.doble_verificacion === false ? "no" : "",
  );

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const cambios: CambiosAccesos = {
      of_correo: correo.trim() || null,
      of_usuario: usuario.trim() || null,
      doble_verificacion: doble === "" ? null : doble === "si",
    };
    if (borrarClave) cambios.clave = null;
    else if (clave) cambios.clave = clave;
    guardar.mutate(cambios, {
      onSuccess: () => {
        toast({ title: t("portal.accesos.guardados") });
        onCerrar();
      },
      onError: (err) => toast({ title: t(claveDeErrorAccesos(err)), variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>{t("portal.accesos.editarTitulo")}</DialogTitle>
            <DialogDescription>{t("portal.accesos.editarTexto")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="acc-of-correo">{t("portal.accesos.ofCorreo")}</Label>
            <Input id="acc-of-correo" type="email" inputMode="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-of-usuario">{t("portal.accesos.ofUsuario")}</Label>
            <Input id="acc-of-usuario" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-of-clave">{t("portal.accesos.claveNueva")}</Label>
            <div className="relative">
              <Input id="acc-of-clave" type={verClave ? "text" : "password"} autoComplete="new-password" value={clave}
                onChange={(e) => setClave(e.target.value)} disabled={borrarClave} className="pr-11" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                onClick={() => setVerClave((v) => !v)} aria-label={t(verClave ? "portal.accesos.ocultar" : "portal.accesos.mostrar")}>
                {verClave ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("portal.accesos.claveNuevaAyuda")}</p>
            {accesos?.tiene_clave && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={borrarClave} onCheckedChange={(v) => setBorrarClave(v === true)} />
                {t("portal.accesos.borrarClave")}
              </label>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("portal.accesos.doble")}</legend>
            <div className="flex flex-wrap gap-2">
              {([["si", "portal.accesos.si"], ["no", "portal.accesos.no"], ["", "portal.accesos.sinDato"]] as const).map(([v, k]) => (
                <Button key={v || "nada"} type="button" size="sm" variant={doble === v ? "default" : "outline"}
                  className={cn("min-h-9", doble !== v && "border-border")} onClick={() => setDoble(v)} aria-pressed={doble === v}>
                  {t(k)}
                </Button>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>{t("portal.accesos.cancelar")}</Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("portal.accesos.guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
