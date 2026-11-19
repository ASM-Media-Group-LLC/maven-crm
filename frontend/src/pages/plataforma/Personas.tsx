import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, History, Loader2, MoreHorizontal, Search, Send, ShieldCheck, Trash2, UserCog, UserPlus, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { claveDeError, type Persona, type RolDePersona } from "@/lib/plataforma";
import { correoValido } from "@/lib/plataforma/planes";
import { cn } from "@/lib/utils";
import { usePlataforma } from "./contexto";
import { Cargando, Chip, ErrorConReintento, Inicial, fechaCorta, haceCuanto, useTextoDeError } from "./piezas";

// LA GENTE DEL CLIENTE (Equipo.tsx + AddEmployeeDialog + ManagePersonDialog de
// Lumina): lista con rol, estado, última actividad y nota de Argos; «Agregar
// persona» (se bloquea con el plan lleno); «Gestionar» (reenviar invitación,
// cambiar rol, quitar) e «Historial».

const ROLES: { k: RolDePersona; icono: typeof ShieldCheck }[] = [
  { k: "empleado", icono: Headphones },
  { k: "supervisor", icono: UserCog },
  { k: "admin", icono: ShieldCheck },
];

export function ListaDePersonas({ org, ocupadas, paquete, puedeEditar }: { org: string; ocupadas: number; paquete: number; puedeEditar: boolean }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const [q, setQ] = useState("");
  const [agregar, setAgregar] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [gestionar, setGestionar] = useState<Persona | null>(null);
  const personas = useQuery({ queryKey: ["plataforma", "personas", org], queryFn: () => p.datos.personas(org) });

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    const orden: Record<RolDePersona, number> = { admin: 0, supervisor: 1, empleado: 2 };
    return (personas.data ?? [])
      .filter((x) => !s || x.nombre.toLowerCase().includes(s) || x.correo.toLowerCase().includes(s))
      .sort((a, b) => Number(b.en_vivo) - Number(a.en_vivo) || orden[a.rol] - orden[b.rol] || a.nombre.localeCompare(b.nombre));
  }, [personas.data, q]);
  const lleno = paquete > 0 && ocupadas >= paquete;

  return (
    <section className="vidrio p-5" data-personas>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-base font-semibold">{t("plataforma.personas.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("plataforma.personas.sub", { n: ocupadas, total: paquete })}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("plataforma.personas.buscar")} className="w-52 pl-9" aria-label={t("plataforma.personas.buscar")} />
        </div>
        <Button variant="outline" onClick={() => setHistorial(true)}><History className="mr-1.5 h-4 w-4" />{t("plataforma.historial.boton")}</Button>
        {puedeEditar && (
          <Button onClick={() => setAgregar(true)} data-agregar-persona>
            <UserPlus className="mr-1.5 h-4 w-4" />{t("plataforma.personas.agregar")}
          </Button>
        )}
      </div>
      {lleno && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{t("plataforma.personas.llenoAviso", { total: paquete })}
        </div>
      )}

      {personas.isLoading ? <Cargando /> : personas.error ? (
        <ErrorConReintento error={personas.error} onReintentar={() => personas.refetch()} />
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{q ? t("plataforma.personas.sinCoincidencias") : t("plataforma.personas.vacio")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">{t("plataforma.personas.col.persona")}</th>
                <th className="pb-2 font-medium">{t("plataforma.personas.col.rol")}</th>
                <th className="pb-2 font-medium">{t("plataforma.personas.col.estado")}</th>
                <th className="pb-2 font-medium">{t("plataforma.personas.col.actividad")}</th>
                <th className="pb-2 font-medium">{t("plataforma.personas.col.nota")}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.user_id} className="border-t border-border/50">
                  <td className="py-2.5">
                    <div className="flex items-center gap-3">
                      <Inicial nombre={x.nombre} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{x.nombre}</div>
                        <div className="truncate text-xs text-muted-foreground">{x.correo}</div>
                      </div>
                    </div>
                  </td>
                  <td><Chip tono={x.rol === "empleado" ? "neutro" : "acento"}>{t(`plataforma.rol.${x.rol}`)}</Chip></td>
                  <td>
                    {x.en_vivo ? <Chip tono="bien" punto>{t("plataforma.estado.enVivo")}</Chip>
                      : x.estado === "invitada" ? <Chip tono="alerta" punto>{t("plataforma.estado.invitada")}</Chip>
                      : x.estado === "pausada" ? <Chip punto>{t("plataforma.estado.pausada")}</Chip>
                      : <Chip punto>{t("plataforma.estado.activa")}</Chip>}
                  </td>
                  <td className="text-xs text-muted-foreground">{x.estado === "invitada" ? t("plataforma.personas.sinEntrar") : haceCuanto(x.ultima_actividad, t)}</td>
                  <td>
                    {x.nota_argos == null ? <span className="text-xs text-muted-foreground">—</span> : (
                      <div className="flex items-center gap-2">
                        <span className="w-7 text-right font-semibold tabular-nums">{x.nota_argos}</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span className={cn("block h-full rounded-full", x.nota_argos >= 80 ? "bg-emerald-500" : x.nota_argos >= 65 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${x.nota_argos}%` }} />
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    {puedeEditar && (
                      <Button size="sm" variant="ghost" onClick={() => setGestionar(x)} aria-label={t("plataforma.persona.gestionarDe", { nombre: x.nombre })}>
                        <MoreHorizontal className="mr-1 h-4 w-4" />{t("plataforma.persona.gestionar")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {agregar && <AgregarPersonaDialogo org={org} ocupadas={ocupadas} paquete={paquete} onClose={() => setAgregar(false)} />}
      {gestionar && <GestionarPersonaDialogo org={org} persona={gestionar} onClose={() => setGestionar(null)} />}
      {historial && <HistorialDialogo org={org} onClose={() => setHistorial(false)} />}
    </section>
  );
}

export function AgregarPersonaDialogo({ org, ocupadas, paquete, onClose }: { org: string; ocupadas: number; paquete: number; onClose: () => void }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<RolDePersona>("empleado");
  const [idioma, setIdioma] = useState<"es" | "en">(language === "es" ? "es" : "en");
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () => p.datos.agregarPersona(org, { nombre: nombre.trim(), correo: correo.trim(), rol, idioma }),
    onSuccess: (x) => { toast.success(t("plataforma.persona.creada", { correo: x.correo })); qc.invalidateQueries({ queryKey: ["plataforma"] }); onClose(); },
    onError: (e) => {
      const clave = claveDeError(e);
      setError(clave === "plan_lleno" ? t("plataforma.error.plan_lleno_detalle", { n: ocupadas, total: paquete })
        : clave ? t(`plataforma.error.${clave}` as TranslationKey) : t("plataforma.error.generico"));
    },
  });
  const enviar = () => {
    setError(null);
    if (nombre.trim().length < 2) { setError(t("plataforma.persona.faltaNombre")); return; }
    if (!correoValido(correo)) { setError(t("plataforma.error.correo_invalido")); return; }
    crear.mutate();
  };
  const pastilla = (on: boolean) => cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
    on ? "border-primary/60 bg-muted/60" : "border-border/70 bg-background/40 hover:bg-muted/40");

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !crear.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-dialogo="agregar">
        <DialogHeader>
          <DialogTitle>{t("plataforma.personas.agregar")}</DialogTitle>
          <DialogDescription>{t("plataforma.persona.agregarSub")}</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert" data-error>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-n">{t("plataforma.campo.nombreCompleto")}</Label>
              <Input id="ap-n" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-c">{t("plataforma.campo.correoUsuario")}</Label>
              <Input id="ap-c" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("plataforma.campo.rol")}</Label>
            <div className="grid gap-2">
              {ROLES.map((r) => (
                <button key={r.k} type="button" onClick={() => setRol(r.k)} className={pastilla(rol === r.k)}>
                  <r.icono className="mt-0.5 h-4 w-4 text-primary" />
                  <span><span className="block text-sm font-medium">{t(`plataforma.rol.${r.k}`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`plataforma.rol.${r.k}Desc`)}</span></span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("plataforma.campo.idioma")}</Label>
            <div className="flex gap-2">
              {(["es", "en"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setIdioma(l)} className={cn(pastilla(idioma === l), "py-2 text-sm")}>{t(`plataforma.idioma.${l}`)}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={crear.isPending}>{t("plataforma.cancelar")}</Button>
            <Button onClick={enviar} disabled={crear.isPending}>
              {crear.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {t("plataforma.persona.crearEInvitar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GestionarPersonaDialogo({ org, persona, onClose }: { org: string; persona: Persona; onClose: () => void }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const [vista, setVista] = useState<"menu" | "rol" | "quitar">("menu");
  const [rol, setRol] = useState<RolDePersona>(persona.rol);
  const listo = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["plataforma"] }); onClose(); };

  const reenviar = useMutation({ mutationFn: () => p.datos.reenviarInvitacion(org, persona.user_id), onSuccess: () => listo(t("plataforma.persona.reenviada")), onError: (e) => toast.error(textoError(e)) });
  const cambiar = useMutation({ mutationFn: () => p.datos.cambiarRol(org, persona.user_id, rol), onSuccess: () => listo(t("plataforma.persona.rolCambiado")), onError: (e) => toast.error(textoError(e)) });
  const quitar = useMutation({ mutationFn: () => p.datos.quitarPersona(org, persona.user_id), onSuccess: () => listo(t("plataforma.persona.quitada")), onError: (e) => toast.error(textoError(e)) });
  const ocupado = reenviar.isPending || cambiar.isPending || quitar.isPending;
  const opcion = "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-left text-sm hover:bg-muted/50";

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !ocupado) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3"><Inicial nombre={persona.nombre} />{persona.nombre}</DialogTitle>
          <DialogDescription>{persona.correo} · {t(`plataforma.rol.${persona.rol}`)} · {t("plataforma.persona.desde", { fecha: fechaCorta(persona.desde, language) })}</DialogDescription>
        </DialogHeader>
        {vista === "menu" && (
          <div className="flex flex-col gap-2">
            <button type="button" className={opcion} onClick={() => reenviar.mutate()} disabled={ocupado}>
              {reenviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}{t("plataforma.persona.reenviar")}
            </button>
            <button type="button" className={opcion} onClick={() => setVista("rol")}><UserCog className="h-4 w-4 text-primary" />{t("plataforma.persona.cambiarRol")}</button>
            <button type="button" className={cn(opcion, "text-red-600 dark:text-red-300")} onClick={() => setVista("quitar")}><Trash2 className="h-4 w-4" />{t("plataforma.persona.quitar")}</button>
          </div>
        )}
        {vista === "rol" && (
          <div className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <button key={r.k} type="button" onClick={() => setRol(r.k)} className={cn(opcion, rol === r.k && "border-primary/60 bg-muted/60")}>
                <r.icono className="h-4 w-4 text-primary" />
                <span><span className="block font-medium">{t(`plataforma.rol.${r.k}`)}</span><span className="block text-xs text-muted-foreground">{t(`plataforma.rol.${r.k}Desc`)}</span></span>
              </button>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setVista("menu")}>{t("plataforma.atras")}</Button>
              <Button onClick={() => cambiar.mutate()} disabled={ocupado || rol === persona.rol}>{t("plataforma.persona.guardarRol")}</Button>
            </div>
          </div>
        )}
        {vista === "quitar" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t("plataforma.persona.quitarConfirma", { nombre: persona.nombre })}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVista("menu")}>{t("plataforma.atras")}</Button>
              <Button variant="destructive" onClick={() => quitar.mutate()} disabled={ocupado}>{t("plataforma.persona.siQuitar")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ACCIONES_CONOCIDAS = new Set([
  "cliente_creado", "cliente_activado", "invitacion_mandada", "persona_agregada", "persona_quitada", "rol_cambiado",
  "argos_recargado", "argos_pausado", "cobro_fallido", "marca_cambiada", "pasado_a_demo", "marcado_cliente", "link_de_tarjeta_enviado",
]);

export function HistorialDialogo({ org, onClose }: { org: string; onClose: () => void }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const h = useQuery({ queryKey: ["plataforma", "historial", org], queryFn: () => p.datos.historial(org) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("plataforma.historial.titulo")}</DialogTitle>
          <DialogDescription>{t("plataforma.historial.sub")}</DialogDescription>
        </DialogHeader>
        {h.isLoading ? <Cargando /> : h.error ? <ErrorConReintento error={h.error} onReintentar={() => h.refetch()} /> : (h.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("plataforma.historial.vacio")}</p>
        ) : (
          <ol className="flex flex-col">
            {h.data!.map((e) => {
              const d = e.detalle as Record<string, string | number | undefined>;
              const clave = (ACCIONES_CONOCIDAS.has(e.accion) ? `plataforma.historial.accion.${e.accion}` : "plataforma.historial.accion.otra") as TranslationKey;
              return (
                <li key={e.id} className="flex gap-3 border-t border-border/50 py-2.5 first:border-t-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{t(clave, { nombre: String(d.nombre ?? ""), correo: String(d.correo ?? ""), usd: String(d.usd ?? ""), rol: d.rol ? t(`plataforma.rol.${d.rol as RolDePersona}`) : "", accion: e.accion })}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.actor_nombre ?? t(`plataforma.historial.actor.${e.actor_tipo}`)} · {fechaCorta(e.at, language)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
