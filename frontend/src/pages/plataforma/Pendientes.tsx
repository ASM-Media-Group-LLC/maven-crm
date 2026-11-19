import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, ImagePlus, Loader2, Rocket, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { MarcaOrganizacion } from "@/lib/plataforma";
import { LOGO_MAX_BYTES } from "@/lib/plataforma/planes";
import { cn } from "@/lib/utils";
import { usePlataforma } from "./contexto";
import { Chip, ErrorConReintento, LogoDeCliente, fechaCorta, useTextoDeError } from "./piezas";

// PENDIENTES DEL CLIENTE (ClientChecklist.tsx de Lumina, con Stripe): arriba del
// panel del cliente, solo para la plataforma. Lo que falta para que arranque, con
// su botón al lado. «Activar» pide confirmar «Sí, invitar a <correo>»: hasta
// entonces nadie de ese cliente recibe correos. Se esconde cuando todo está listo.

export function PendientesDelCliente({ org, marca }: { org: string; marca: MarcaOrganizacion & { nombreCliente: string } }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [confirmar, setConfirmar] = useState(false);
  const [marcaAbierta, setMarcaAbierta] = useState(false);
  const d = useQuery({ queryKey: ["plataforma", "pendientes", org], queryFn: () => p.datos.pendientesDe(org) });
  const refrescar = () => qc.invalidateQueries({ queryKey: ["plataforma"] });

  const activar = useMutation({
    mutationFn: () => p.datos.activarOrganizacion(org),
    onSuccess: (r) => { toast.success(r.invitado ? t("plataforma.pend.activadoInvitado", { correo: r.invitado }) : t("plataforma.pend.activado")); setConfirmar(false); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const reenviar = useMutation({
    mutationFn: () => p.datos.reenviarInvitacion(org, d.data!.lider!.user_id),
    onSuccess: () => { toast.success(t("plataforma.persona.reenviada")); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const tarjeta = useMutation({
    mutationFn: () => p.datos.enviarLinkDeTarjeta(org),
    onSuccess: (r) => { toast.success(t("plataforma.pend.linkEnviado", { correo: r.correo })); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });

  if (d.isLoading) return null;
  if (d.error) return <ErrorConReintento error={d.error} onReintentar={() => d.refetch()} />;
  const x = d.data!;
  const prep = x.estado === "preparacion";
  const esDueno = p.yo?.tipo === "dueno";
  const soloMirar = !!p.verComo;

  type Item = { k: string; hecho: boolean; titulo: TranslationKey; sub?: string; accion?: ReactNode };
  const items: Item[] = [
    { k: "lider", hecho: !!x.lider, titulo: "plataforma.pend.lider", sub: x.lider ? `${x.lider.nombre} · ${x.lider.correo}` : undefined },
    { k: "marca", hecho: x.marca, titulo: "plataforma.pend.marca",
      accion: <Button size="sm" variant="outline" onClick={() => setMarcaAbierta(true)}><ImagePlus className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.pend.ponerMarca")}</Button> },
    { k: "plan", hecho: x.plan, titulo: "plataforma.pend.plan" },
    { k: "tarjeta", hecho: x.tarjeta, titulo: "plataforma.pend.tarjeta", sub: x.sin_tarjeta ? t("plataforma.pend.sinTarjeta") : undefined,
      accion: esDueno ? <Button size="sm" variant="outline" onClick={() => tarjeta.mutate()} disabled={tarjeta.isPending}>
        {tarjeta.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}{t("plataforma.pend.mandarLink")}</Button> : undefined },
    { k: "activar", hecho: !prep, titulo: "plataforma.pend.activar",
      sub: !prep ? fechaCorta(x.activada_at, language) : t("plataforma.pend.activarAyuda"),
      accion: !x.lider ? undefined : confirmar ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>{t("plataforma.no")}</Button>
          <Button size="sm" onClick={() => activar.mutate()} disabled={activar.isPending} data-confirmar-activar>
            {activar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            {t("plataforma.pend.siInvitar", { correo: x.lider.correo })}
          </Button>
        </span>
      ) : <Button size="sm" onClick={() => setConfirmar(true)}><Rocket className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.pend.activarBoton")}</Button> },
    { k: "entro", hecho: !!x.lider?.entro_at, titulo: "plataforma.pend.entro",
      sub: x.lider?.entro_at ? fechaCorta(x.lider.entro_at, language) : undefined,
      accion: !prep && x.lider ? <Button size="sm" variant="outline" onClick={() => reenviar.mutate()} disabled={reenviar.isPending}>
        <Send className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.persona.reenviar")}</Button> : undefined },
    { k: "cobro", hecho: !!x.primer_cobro_at, titulo: "plataforma.pend.cobro",
      sub: x.primer_cobro_at ? fechaCorta(x.primer_cobro_at, language) : undefined },
  ];
  const hechos = items.filter((i) => i.hecho).length;
  if (hechos === items.length) return null;

  return (
    <section className={cn("vidrio p-5", prep && "border-warning/40")} data-pendientes>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{t("plataforma.pend.titulo")}</h2>
            {prep && <Chip tono="alerta" punto>{t("plataforma.chip.preparacion")}</Chip>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{prep ? t("plataforma.pend.subPrep") : t("plataforma.pend.sub")}</p>
        </div>
        <div className="text-sm tabular-nums text-muted-foreground"><span className="text-lg font-semibold text-foreground">{hechos}</span> / {items.length}</div>
      </div>
      <div className="flex flex-col">
        {items.map((i) => (
          <div key={i.k} className="flex flex-wrap items-center gap-3 border-t border-border/60 py-2.5 sm:flex-nowrap" data-item={i.k} data-hecho={i.hecho}>
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              i.hecho ? "border-success/50 bg-success/15 text-success" : "border-muted-foreground/40 text-transparent")}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-sm", i.hecho ? "text-muted-foreground" : "font-medium")}>{t(i.titulo)}</div>
              {i.sub && <div className="break-words text-xs text-muted-foreground">{i.sub}</div>}
            </div>
            {!i.hecho && i.accion && !soloMirar && <div className="w-full shrink-0 pl-9 sm:w-auto sm:pl-0">{i.accion}</div>}
          </div>
        ))}
      </div>
      {marcaAbierta && <DialogoMarca org={org} marca={marca} onClose={() => setMarcaAbierta(false)} />}
    </section>
  );
}

function DialogoMarca({ org, marca, onClose }: { org: string; marca: MarcaOrganizacion & { nombreCliente: string }; onClose: () => void }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [nombre, setNombre] = useState(marca.nombre || marca.nombreCliente);
  const [logo, setLogo] = useState<string | null>(marca.logo_url ?? null);
  const [color, setColor] = useState(marca.color || "#334155");
  const guardar = useMutation({
    mutationFn: () => p.datos.cambiarMarca(org, { nombre: nombre.trim(), logo_url: logo, color }),
    onSuccess: () => { toast.success(t("plataforma.marca.guardada")); qc.invalidateQueries({ queryKey: ["plataforma"] }); onClose(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const elegir = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { toast.error(t("plataforma.marca.tipo")); return; }
    if (f.size > LOGO_MAX_BYTES) { toast.error(t("plataforma.marca.grande")); return; }
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plataforma.pend.ponerMarca")}</DialogTitle>
          <DialogDescription>{t("plataforma.marca.ayuda", { marca: nombre || "…" })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label htmlFor="pm-n">{t("plataforma.marca.nombre")}</Label>
          <Input id="pm-n" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <div className="flex items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm hover:bg-muted/40">
              <ImagePlus className="h-4 w-4 text-primary" />{logo ? t("plataforma.marca.cambiarLogo") : t("plataforma.marca.subirLogo")}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
            </label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t("plataforma.marca.color")} className="h-10 w-12 cursor-pointer rounded-control border border-border bg-transparent" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60"><LogoDeCliente nombre={nombre || "?"} logo={logo} color={color} alto="h-[100px]" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t("plataforma.cancelar")}</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !nombre.trim()}>{t("plataforma.guardar")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
