import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Loader2, Lock, Pause, Pencil, Play, Rocket, Send, TimerReset, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { CambiosDeFicha, FichaDelCliente, Invitacion } from "@/lib/plataforma";
import { porContestar, preguntasDe, type Pregunta } from "@/lib/plataforma/ficha";
import { correoValido, formatoUsd } from "@/lib/plataforma/planes";
import { cn } from "@/lib/utils";
import { usePlataforma } from "./contexto";
import { Chip, ErrorConReintento, fechaCorta, useTextoDeError } from "./piezas";

// PREPARAR AL CLIENTE (tanda 25/11): arriba del panel del cliente, solo para Maven.
//   · El Dueño (al que le llega la invitación).
//   · La ficha: Maven le pregunta a Alvaro con botones, una por una (plan, precio, días
//     de prueba y de gracia, setup y si ya se pagó, forma de cobro, silla extra,
//     montaje, contrato). Lo de dinero lo contesta solo Alvaro; Grace ve «Lo contesta
//     Alvaro».
//   · «Activar» no se puede apretar hasta que no falte nada (la base lo vuelve a revisar).
//     Al activar sale la invitación al Dueño, y el enlace queda a la vista para copiarlo
//     y mandarlo por WhatsApp si el correo no llega.
//   · Ya activo: pausar / reactivar, extender la prueba (Alvaro) y reenviar la invitación.

export function PendientesDelCliente({ org }: { org: string; marca?: unknown }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const d = useQuery({ queryKey: ["plataforma", "ficha", org], queryFn: () => p.datos.fichaDe(org) });
  const [abierta, setAbierta] = useState<Pregunta["k"] | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["plataforma"] });

  const guardar = useMutation({
    mutationFn: (c: CambiosDeFicha) => p.datos.guardarFicha(org, c),
    onSuccess: () => { setAbierta(null); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const activar = useMutation({
    mutationFn: () => p.datos.activarOrganizacion(org),
    onSuccess: (r) => {
      setConfirmar(false);
      setInvitacion(r);
      toast.success(r.invitado && r.correo_enviado ? t("plataforma.pend.activadoInvitado", { correo: r.invitado }) : t("plataforma.pend.activado"));
      refrescar();
    },
    onError: (e) => toast.error(textoError(e)),
  });
  const reenviar = useMutation({
    mutationFn: () => p.datos.reenviarInvitacionDueno(org),
    onSuccess: (r) => { setInvitacion(r); toast.success(r.correo_enviado ? t("plataforma.persona.reenviada") : t("plataforma.ficha.enlaceListo")); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const pausar = useMutation({
    mutationFn: (motivo: string) => p.datos.pausarOrganizacion(org, motivo),
    onSuccess: () => { toast.success(t("plataforma.ficha.pausado")); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const reactivar = useMutation({
    mutationFn: () => p.datos.reactivarOrganizacion(org),
    onSuccess: () => { toast.success(t("plataforma.ficha.reactivado")); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });
  const extender = useMutation({
    mutationFn: (dias: number) => p.datos.extenderPrueba(org, dias),
    onSuccess: () => { toast.success(t("plataforma.ficha.extendida")); refrescar(); },
    onError: (e) => toast.error(textoError(e)),
  });

  if (d.isLoading) return null;
  if (d.error) return <ErrorConReintento error={d.error} onReintentar={() => d.refetch()} />;
  const f = d.data!;
  const prep = f.estado === "preparacion";
  const soloMirar = !!p.verComo;
  const preguntas = preguntasDe(f);
  const puedoContestar = (q: Pregunta) => !soloMirar && (!q.dinero || f.ve_dinero);
  // «Una por una»: abierta la que eligió, o la primera por contestar que puedo contestar.
  const siguiente = preguntas.find((q) => porContestar(q, f.faltan) && puedoContestar(q))?.k ?? null;
  const actual = abierta ?? (prep ? siguiente : null);
  const listo = f.faltan.length === 0;

  return (
    <section className={cn("vidrio p-5", prep && "border-warning/40")} data-preparar-cliente data-estado={f.estado}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{prep ? t("plataforma.ficha.tituloPrep", { nombre: f.nombre }) : t("plataforma.ficha.titulo")}</h2>
            <Chip tono={f.estado === "activa" ? "bien" : f.estado === "preparacion" ? "alerta" : "mal"} punto>{t(`plataforma.ficha.estado.${f.estado}` as TranslationKey)}</Chip>
            {f.es_demo && <Chip>{t("plataforma.ficha.demo")}</Chip>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{prep ? t("plataforma.ficha.subPrep") : t("plataforma.ficha.sub")}</p>
        </div>
        {prep && (
          <div className="text-sm tabular-nums text-muted-foreground" data-faltan={f.faltan.length}>
            {listo ? <span className="font-medium text-success">{t("plataforma.ficha.todoListo")}</span> : t("plataforma.ficha.faltan", { n: f.faltan.length })}
          </div>
        )}
      </div>

      <Dueno f={f} org={org} soloMirar={soloMirar} />

      <div className="flex flex-col">
        {preguntas.map((q) => (
          <FilaPregunta
            key={q.k} q={q} f={f}
            abierta={actual === q.k && puedoContestar(q)}
            puedo={puedoContestar(q)}
            onAbrir={() => setAbierta(q.k)}
            onCerrar={() => setAbierta(null)}
            onGuardar={(c) => guardar.mutate(c)}
            guardando={guardar.isPending}
          />
        ))}
      </div>

      {prep && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
          {!listo && <span className="mr-auto text-xs text-muted-foreground">{t("plataforma.ficha.activarBloqueado")}</span>}
          {listo && confirmar && f.dueno ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>{t("plataforma.no")}</Button>
              <Button size="sm" onClick={() => activar.mutate()} disabled={activar.isPending || soloMirar} data-confirmar-activar>
                {activar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t("plataforma.pend.siInvitar", { correo: f.dueno.correo })}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setConfirmar(true)} disabled={!listo || soloMirar} data-activar>
              {listo ? <Rocket className="mr-1.5 h-3.5 w-3.5" /> : <Lock className="mr-1.5 h-3.5 w-3.5" />}{t("plataforma.pend.activarBoton")}
            </Button>
          )}
        </div>
      )}

      {!prep && !soloMirar && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4" data-acciones-cliente>
          {f.ve_dinero && f.prueba_hasta && (
            <span className="mr-auto text-xs text-muted-foreground">{t("plataforma.ficha.pruebaHasta", { fecha: fechaCorta(f.prueba_hasta, language) })}</span>
          )}
          {f.dueno && (
            <Button size="sm" variant="outline" onClick={() => reenviar.mutate()} disabled={reenviar.isPending}>
              {reenviar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}{t("plataforma.persona.reenviar")}
            </Button>
          )}
          {f.ve_dinero && f.estado !== "archivada" && [7, 14, 30].map((n) => (
            <Button key={n} size="sm" variant="outline" onClick={() => extender.mutate(n)} disabled={extender.isPending}>
              <TimerReset className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.ficha.extender", { n })}
            </Button>
          ))}
          {f.estado === "activa" && (
            <Button size="sm" variant="outline" onClick={() => { const m = window.prompt(t("plataforma.ficha.motivoPausa")); if (m !== null) pausar.mutate(m); }} disabled={pausar.isPending}>
              <Pause className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.ficha.pausar")}
            </Button>
          )}
          {f.estado === "pausada" && (
            <Button size="sm" onClick={() => reactivar.mutate()} disabled={reactivar.isPending}>
              <Play className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.ficha.reactivar")}
            </Button>
          )}
        </div>
      )}

      {invitacion && <CajaDeInvitacion inv={invitacion} />}
    </section>
  );
}

/** El enlace de la invitación, para copiarlo (por si el correo no llega). */
function CajaDeInvitacion({ inv }: { inv: Invitacion }) {
  const { t } = useLanguage();
  if (!inv.enlace) {
    return <p className="mt-3 rounded-xl border border-warning/40 px-3 py-2 text-xs" data-invitacion-fallo>{t("plataforma.ficha.invitacionFallo")}</p>;
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(inv.enlace!); toast.success(t("plataforma.ficha.copiado")); }
    catch { toast.error(t("plataforma.error.generico")); }
  };
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3" data-invitacion>
      <p className="text-xs">
        {inv.correo_enviado ? t("plataforma.ficha.correoSalio", { correo: inv.invitado ?? "" }) : t("plataforma.ficha.correoNoSalio")}
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly value={inv.enlace} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={t("plataforma.ficha.enlace")} />
        <Button size="sm" variant="outline" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.ficha.copiar")}</Button>
      </div>
    </div>
  );
}

/** El Dueño del cliente: quién es, si ya entró, y ponerlo (o cambiarlo) antes de activar. */
function Dueno({ f, org, soloMirar }: { f: FichaDelCliente; org: string; soloMirar: boolean }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(f.dueno?.nombre ?? "");
  const [correo, setCorreo] = useState(f.dueno?.correo ?? "");
  const poner = useMutation({
    mutationFn: () => p.datos.ponerDueno(org, nombre.trim(), correo.trim()),
    onSuccess: () => { setEditando(false); toast.success(t("plataforma.ficha.duenoPuesto")); qc.invalidateQueries({ queryKey: ["plataforma"] }); },
    onError: (e) => toast.error(textoError(e)),
  });
  const prep = f.estado === "preparacion";
  const mostrarFormulario = (editando || !f.dueno) && prep && !soloMirar;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border/60 py-2.5" data-item="dueno" data-hecho={!!f.dueno}>
      <Marca hecho={!!f.dueno} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", f.dueno ? "text-muted-foreground" : "font-medium")}>{t("plataforma.ficha.p.dueno")}</div>
        {f.dueno && !editando && (
          <div className="break-words text-xs text-muted-foreground">
            {f.dueno.nombre} · {f.dueno.correo}
            {!prep && ` · ${f.dueno.entro_at ? t("plataforma.ficha.entro", { fecha: fechaCorta(f.dueno.entro_at, language) }) : t("plataforma.ficha.noHaEntrado")}`}
          </div>
        )}
        {mostrarFormulario && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (nombre.trim().length < 2 || !correoValido(correo)) { toast.error(t("plataforma.nuevo.faltanDatos")); return; } poner.mutate(); }}>
            <div className="flex flex-col gap-1"><Label className="text-xs" htmlFor="pd-n">{t("plataforma.campo.nombre")}</Label><Input id="pd-n" className="h-8 w-44" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs" htmlFor="pd-c">{t("plataforma.campo.correo")}</Label><Input id="pd-c" className="h-8 w-56" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} /></div>
            <Button size="sm" type="submit" disabled={poner.isPending}>{poner.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCog className="mr-1.5 h-3.5 w-3.5" />}{t("plataforma.guardar")}</Button>
            {f.dueno && <Button size="sm" type="button" variant="ghost" onClick={() => setEditando(false)}>{t("plataforma.cancelar")}</Button>}
          </form>
        )}
      </div>
      {f.dueno && prep && !editando && !soloMirar && (
        <Button size="sm" variant="ghost" onClick={() => { setNombre(f.dueno!.nombre); setCorreo(f.dueno!.correo); setEditando(true); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.ficha.cambiar")}</Button>
      )}
    </div>
  );
}

function Marca({ hecho }: { hecho: boolean }) {
  return (
    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
      hecho ? "border-success/50 bg-success/15 text-success" : "border-muted-foreground/40 text-transparent")}>
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}

/** Lo que dice la ficha hoy para esa pregunta (o null si no está contestada / no se ve). */
function respuestaDe(q: Pregunta, f: FichaDelCliente, t: (k: TranslationKey, v?: Record<string, string | number>) => string, idioma: string): string | null {
  const fi = f.ficha, pl = f.plan ?? {};
  switch (q.k) {
    case "plan": return pl.nombre && pl.personas ? `${t(`plataforma.plan.${pl.nombre}` as TranslationKey)} · ${t("plataforma.plan.hasta", { n: pl.personas })}` : null;
    case "precio": return pl.precio_usd !== undefined ? `${formatoUsd(pl.precio_usd)}${t("plataforma.porMes")}` : null;
    case "dias_prueba": return fi.dias_prueba === undefined ? null : fi.dias_prueba === 0 ? t("plataforma.ficha.op.sinPrueba") : t("plataforma.ficha.op.dias", { n: fi.dias_prueba });
    case "dias_gracia": return fi.dias_gracia === undefined ? null : fi.dias_gracia === 0 ? t("plataforma.ficha.op.sinGracia") : t("plataforma.ficha.op.dias", { n: fi.dias_gracia });
    case "setup": return fi.setup_usd === undefined ? null : fi.setup_usd === 0 ? t("plataforma.ficha.op.sinSetup") : formatoUsd(fi.setup_usd);
    case "setup_estado": return fi.setup_estado === "pagado" || fi.setup_estado === "regalado" ? t(`plataforma.ficha.setup.${fi.setup_estado}` as TranslationKey) : null;
    case "forma_cobro": return fi.forma_cobro ? t(`plataforma.ficha.cobro.${fi.forma_cobro}` as TranslationKey) : null;
    case "silla_extra": return fi.silla_extra_usd === undefined ? null : t("plataforma.ficha.op.sillaExtra", { usd: formatoUsd(fi.silla_extra_usd) });
    case "montaje": return fi.montaje ? t(fi.montaje === "maven" ? "plataforma.ficha.op.montajeMaven" : "plataforma.ficha.op.montajeCliente") : null;
    case "contrato": return fi.pide_contrato === undefined ? null : t(fi.pide_contrato ? "plataforma.ficha.op.contratoSi" : "plataforma.ficha.op.contratoNo");
    case "contrato_firmado": return fi.contrato_firmado_at ? fechaCorta(fi.contrato_firmado_at, idioma) : null;
  }
}

function FilaPregunta({ q, f, abierta, puedo, onAbrir, onCerrar, onGuardar, guardando }: {
  q: Pregunta; f: FichaDelCliente; abierta: boolean; puedo: boolean;
  onAbrir: () => void; onCerrar: () => void; onGuardar: (c: CambiosDeFicha) => void; guardando: boolean;
}) {
  const { t, language } = useLanguage();
  const respuesta = respuestaDe(q, f, t, language);
  const [otro, setOtro] = useState("");
  const falta = porContestar(q, f.faltan);
  const oculta = q.dinero && !f.ve_dinero;

  const guardarOtro = () => {
    if (!q.otro) return;
    const n = Number(otro.replace(/[^\d.]/g, ""));
    if (otro.trim() === "" || !Number.isFinite(n) || n < q.otro.min || n > q.otro.max) {
      toast.error(t("plataforma.ficha.numeroInvalido", { min: q.otro.min, max: q.otro.max }));
      return;
    }
    const dinero = q.otro.campo === "precio_usd" || q.otro.campo === "setup_usd" || q.otro.campo === "silla_extra_usd";
    onGuardar({ ...(q.otro.extra ?? {}), [q.otro.campo]: dinero ? n : Math.round(n) } as CambiosDeFicha);
    setOtro("");
  };

  return (
    <div className="border-t border-border/60 py-2.5" data-item={q.k} data-hecho={!falta} data-abierta={abierta}>
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <Marca hecho={!falta} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm", falta ? "font-medium" : "text-muted-foreground")}>{t(`plataforma.ficha.p.${q.k}` as TranslationKey)}</div>
          {oculta ? <div className="text-xs text-muted-foreground">{t("plataforma.ficha.loContestaAlvaro")}</div>
            : respuesta ? <div className="break-words text-xs text-muted-foreground">{respuesta}</div> : null}
        </div>
        {!abierta && puedo && (
          <Button size="sm" variant={falta ? "outline" : "ghost"} onClick={onAbrir}>
            {!falta && <Pencil className="mr-1.5 h-3.5 w-3.5" />}{falta ? t("plataforma.ficha.contestar") : t("plataforma.ficha.cambiar")}
          </Button>
        )}
      </div>
      {abierta && (
        <div className="mt-2.5 flex flex-col gap-2.5 pl-9" data-opciones={q.k}>
          <p className="text-xs text-muted-foreground">{t(`plataforma.ficha.ayuda.${q.k}` as TranslationKey)}</p>
          <div className="flex flex-wrap gap-2">
            {q.opciones.map((o) => (
              <Button key={o.etiqueta + JSON.stringify(o.cambios)} size="sm" variant={o.recomendada ? "default" : "outline"} disabled={guardando} onClick={() => onGuardar(o.cambios)}>
                {t(o.etiqueta as TranslationKey, o.vars)}{o.recomendada ? ` · ${t("plataforma.ficha.recomendado")}` : ""}
              </Button>
            ))}
          </div>
          {q.otro && (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); guardarOtro(); }}>
              <Input className="h-8 w-44" inputMode="decimal" value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={t(`plataforma.ficha.otro.${q.otro.campo}` as TranslationKey)} aria-label={t(`plataforma.ficha.otro.${q.otro.campo}` as TranslationKey)} />
              <Button size="sm" type="submit" variant="outline" disabled={guardando}>{guardando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{t("plataforma.guardar")}</Button>
            </form>
          )}
          {!falta && <div><Button size="sm" variant="ghost" onClick={onCerrar}>{t("plataforma.cancelar")}</Button></div>}
        </div>
      )}
    </div>
  );
}
