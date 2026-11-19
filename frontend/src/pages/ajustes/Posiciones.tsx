import type * as React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Info, Minus, MoreHorizontal, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/useLanguage";
import { useEsDueno } from "@/hooks/useEsDueno";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CATALOGO_POSICIONES, type AlcanceDatos, type FilaCatalogo } from "@/lib/posiciones/catalogo";
import { useModalidades } from "@/hooks/usePausas";

// AJUSTES → POSICIONES (Alvaro, 18/11/2026): la estructura de Blu/Infloww
// (Settings → Role Settings) con el diseño de Maven. Lista de posiciones →
// «Ver permisos» → 2 interruptores + tablas Menús | Funciones | Datos que se
// guardan solas. Pestaña «Personas»: quién va en qué posición y los checks
// por persona. Es un BORRADOR (tablas *_borrador): nada de aquí cambia el
// acceso real de nadie hasta que Alvaro dé el «dale». Solo el dueño la ve.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Posicion {
  id: string; nombre: string; descripcion: string | null; activa: boolean;
  acceso_total: boolean; todas_creadoras: boolean;
  checks: Record<string, boolean>; alcances: Record<string, AlcanceDatos>; orden: number;
  /** La modalidad de pausa que trae el puesto (19/11/2026). */
  modalidad_id?: string | null;
}
interface Persona { id: string; full_name: string | null; avatar_url: string | null }
interface Marca { user_id: string; protegido: boolean; sin_camara: boolean; deshabilitada: boolean }
interface Asignacion { user_id: string; posicion_id: string }

const KEY = ["posiciones-borrador"];

function useDatos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const [pos, asig, gente, marcas] = await Promise.all([
        sinTipar.from("posiciones_borrador").select("*").order("orden").order("created_at"),
        sinTipar.from("posiciones_borrador_personas").select("user_id, posicion_id"),
        sinTipar.from("profiles").select("id, full_name, avatar_url").is("deleted_at", null).order("full_name"),
        sinTipar.from("personas_borrador_marcas").select("*"),
      ]);
      const err = pos.error || asig.error || gente.error || marcas.error;
      if (err) throw err;
      return {
        posiciones: (pos.data ?? []) as Posicion[],
        asignaciones: (asig.data ?? []) as Asignacion[],
        personas: (gente.data ?? []) as Persona[],
        marcas: (marcas.data ?? []) as Marca[],
      };
    },
  });
}

/** Check como el de Blu: ✓ completo, «–» cuando la sección o el grupo está
 *  marcado solo en parte. */
function Casilla({ className, checked, ...props }: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className={cn(
        "peer flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-muted-foreground/60 transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/25 data-[state=indeterminate]:text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {checked === "indeterminate" ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

function Letra({ nombre }: { nombre: string | null }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {(nombre ?? "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function Posiciones() {
  const { t } = useLanguage();
  const { esDueno, cargando } = useEsDueno();
  const datos = useDatos();
  const [pestana, setPestana] = useState<"posiciones" | "personas">("posiciones");
  const [abierta, setAbierta] = useState<string | null>(null);

  if (cargando) return null;
  if (esDueno !== true) {
    return <Page><div className="text-sm text-muted-foreground">{t("posiciones.soloDueno")}</div></Page>;
  }

  const posAbierta = datos.data?.posiciones.find((p) => p.id === abierta) ?? null;

  return (
    <Page>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-16 md:pr-16">
      {posAbierta ? (
        <PermisosDe pos={posAbierta} personas={datos.data!.personas} asignaciones={datos.data!.asignaciones} onVolver={() => setAbierta(null)} />
      ) : (
        <>
          <PageHeader
            title={t("posiciones.titulo")}
            subtitle={t("posiciones.sub")}
          />
            <div className="flex w-fit rounded-control border border-border p-0.5 text-sm">
            {(["posiciones", "personas"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPestana(p)}
                className={cn("rounded-control px-3 py-1.5 transition-colors", pestana === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
                {t(`posiciones.tab.${p}`)}
              </button>
            ))}
          </div>
          <AvisoBorrador />
          {datos.isError ? (
            <Card><CardContent className="flex items-center justify-between gap-3 p-5 text-sm">
              <span>{t("posiciones.error")}</span>
              <Button size="sm" variant="outline" onClick={() => void datos.refetch()}>{t("posiciones.reintentar")}</Button>
            </CardContent></Card>
          ) : !datos.data ? (
            <div className="h-40 animate-pulse rounded-panel bg-muted/40" />
          ) : pestana === "posiciones" ? (
            <ListaPosiciones datos={datos.data} onAbrir={setAbierta} />
          ) : (
            <ListaPersonas datos={datos.data} />
          )}
        </>
      )}
    </div>
    </Page>
  );
}

// Estado del cambio: borrador (nada manda) o ya mandan, con el regreso de 7 días.
function useEstadoPosiciones() {
  return useQuery({
    queryKey: ["posiciones-estado"],
    queryFn: async () => {
      const [flag, resp] = await Promise.all([
        sinTipar.from("app_flags").select("enabled").eq("key", "posiciones_mandan").maybeSingle(),
        sinTipar.from("posiciones_respaldo").select("id, created_at, restaurado_at").is("restaurado_at", null).order("id", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (flag.error) throw flag.error;
      if (resp.error) throw resp.error;
      const creado = resp.data?.created_at ? new Date(resp.data.created_at as string) : null;
      const hasta = creado ? new Date(creado.getTime() + 7 * 86_400_000) : null;
      return { mandan: !!flag.data?.enabled, creado, hasta: hasta && hasta > new Date() ? hasta : null };
    },
  });
}

function AvisoBorrador() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const estado = useEstadoPosiciones();
  const [confirmar, setConfirmar] = useState(false);
  const regresar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as unknown as { rpc: (f: string) => Promise<{ error: unknown }> }).rpc("posiciones_regresar");
      if (error) throw error;
    },
    onSuccess: () => { setConfirmar(false); toast.success(t("posiciones.regresar.listo")); void qc.invalidateQueries(); },
    onError: () => toast.error(t("posiciones.regresar.error")),
  });
  if (estado.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-control border border-border px-4 py-3 text-sm">
        <span>{t("posiciones.estado.error")}</span>
        <Button size="sm" variant="outline" onClick={() => void estado.refetch()}>{t("posiciones.reintentar")}</Button>
      </div>
    );
  }
  if (!estado.data?.mandan) {
    return (
      <div className="flex items-start gap-2 rounded-control border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("posiciones.borrador")}</span>
      </div>
    );
  }
  const fecha = (d: Date | null) => (d ? d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{t("posiciones.mandan")}</span>
        {estado.data.hasta && (
          <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}>{t("posiciones.regresar")}</Button>
        )}
      </div>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("posiciones.regresar.titulo", { fecha: fecha(estado.data.creado) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("posiciones.regresar.desc", { hasta: fecha(estado.data.hasta) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("posiciones.dialogo.cancelar")}</AlertDialogCancel>
            <AlertDialogAction disabled={regresar.isPending} onClick={(e) => { e.preventDefault(); regresar.mutate(); }}>
              {t("posiciones.regresar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Lista de posiciones (Role settings) ────────────────────────────────────

function ListaPosiciones({ datos, onAbrir }: { datos: NonNullable<ReturnType<typeof useDatos>["data"]>; onAbrir: (id: string) => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [aplicado, setAplicado] = useState("");
  const [estado, setEstado] = useState<"todas" | "activas" | "inactivas">("todas");
  const [dialogo, setDialogo] = useState<{ modo: "nueva" } | { modo: "editar"; pos: Posicion } | null>(null);
  const [borrar, setBorrar] = useState<Posicion | null>(null);

  const genteDe = useMemo(() => {
    const nombres = new Map(datos.personas.map((p) => [p.id, p.full_name ?? "?"]));
    const m = new Map<string, string[]>();
    for (const a of datos.asignaciones) {
      const n = nombres.get(a.user_id); if (!n) continue;
      m.set(a.posicion_id, [...(m.get(a.posicion_id) ?? []), n]);
    }
    return m;
  }, [datos]);

  const visibles = datos.posiciones.filter((p) =>
    (!aplicado || p.nombre.toLowerCase().includes(aplicado.toLowerCase())) &&
    (estado === "todas" || (estado === "activas" ? p.activa : !p.activa)));

  const cambiarEstado = useMutation({
    mutationFn: async (p: Posicion) => {
      const { error } = await sinTipar.from("posiciones_borrador").update({ activa: !p.activa, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t("posiciones.errorGuardar")),
  });
  const quitar = useMutation({
    mutationFn: async (p: Posicion) => {
      const { error } = await sinTipar.from("posiciones_borrador").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { setBorrar(null); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: () => toast.error(t("posiciones.errorGuardar")),
  });

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              {t("posiciones.porPosicion")}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="buscar-posicion" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setAplicado(texto)}
                  placeholder={t("posiciones.buscarPosicion")} className="pl-8" />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("posiciones.porEstado")}
              <select id="estado-posicion" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}
                className="h-10 rounded-control border border-input bg-background px-3 text-sm text-foreground">
                <option value="todas">{t("posiciones.estado.todas")}</option>
                <option value="activas">{t("posiciones.estado.activas")}</option>
                <option value="inactivas">{t("posiciones.estado.inactivas")}</option>
              </select>
            </label>
            <Button variant="outline" onClick={() => { setTexto(""); setAplicado(""); setEstado("todas"); }}>{t("posiciones.limpiar")}</Button>
            <Button variant="secondary" onClick={() => setAplicado(texto)}><Search className="mr-1.5 h-4 w-4" />{t("posiciones.buscar")}</Button>
            <Button className="ml-auto" onClick={() => setDialogo({ modo: "nueva" })}><Plus className="mr-1.5 h-4 w-4" />{t("posiciones.agregar")}</Button>
          </div>
          <div className="text-xs text-muted-foreground">{t("posiciones.total", { n: visibles.length })}</div>
          <div className="rounded-control border border-border max-md:border-0">
            <Table className="w-full text-sm">
              <TableHeader className="bg-muted/40 text-left text-xs text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-2.5 font-medium">{t("posiciones.col.posicion")}</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">{t("posiciones.col.descripcion")}</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">{t("posiciones.col.personas")}</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">{t("posiciones.col.estado")}</TableHead>
                  <TableHead className="px-4 py-2.5 text-right font-medium">{t("posiciones.col.acciones")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("posiciones.vacio")}</TableCell></TableRow>
                )}
                {visibles.map((p) => {
                  const gente = genteDe.get(p.id) ?? [];
                  return (
                    <TableRow key={p.id} className="border-t border-border align-middle">
                      <TableCell className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">{p.acceso_total && <ShieldCheck className="h-4 w-4 text-primary" />}{p.nombre}</span>
                      </TableCell>
                      <TableCell className="max-w-[260px] px-4 py-3 text-muted-foreground">{p.descripcion || "—"}</TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex max-w-[360px] flex-wrap gap-1">
                          {gente.slice(0, 3).map((n) => <span key={n} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">{n}</span>)}
                          {gente.length > 3 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">+{gente.length - 3}</span>}
                          {gente.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Switch checked={p.activa} onCheckedChange={() => cambiarEstado.mutate(p)} aria-label={t("posiciones.col.estado")} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="outline" className="h-8 w-8" aria-label={t("posiciones.accionesDe", { nombre: p.nombre })}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onAbrir(p.id)}>{t("posiciones.accion.permisos")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDialogo({ modo: "editar", pos: p })}>{t("posiciones.accion.editar")}</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setBorrar(p)}>{t("posiciones.accion.borrar")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {dialogo && <DialogoPosicion estado={dialogo} posiciones={datos.posiciones} onCerrar={() => setDialogo(null)} />}

      <AlertDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("posiciones.borrar.titulo", { nombre: borrar?.nombre ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("posiciones.borrar.desc", { n: borrar ? (genteDe.get(borrar.id)?.length ?? 0) : 0 })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("posiciones.dialogo.cancelar")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => borrar && quitar.mutate(borrar)}>
              {t("posiciones.accion.borrar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DialogoPosicion({ estado, posiciones, onCerrar }: {
  estado: { modo: "nueva" } | { modo: "editar"; pos: Posicion }; posiciones: Posicion[]; onCerrar: () => void;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const editando = estado.modo === "editar" ? estado.pos : null;
  const [nombre, setNombre] = useState(editando?.nombre ?? "");
  const [desc, setDesc] = useState(editando?.descripcion ?? "");
  const [copiar, setCopiar] = useState("");
  const guardar = useMutation({
    mutationFn: async () => {
      const ahora = new Date().toISOString();
      if (editando) {
        const { error } = await sinTipar.from("posiciones_borrador").update({ nombre: nombre.trim(), descripcion: desc.trim() || null, updated_at: ahora }).eq("id", editando.id);
        if (error) throw error;
        return;
      }
      const base = posiciones.find((p) => p.id === copiar);
      const { error } = await sinTipar.from("posiciones_borrador").insert({
        nombre: nombre.trim(), descripcion: desc.trim() || null,
        orden: Math.max(0, ...posiciones.map((p) => p.orden)) + 1,
        acceso_total: base?.acceso_total ?? false, todas_creadoras: base?.todas_creadoras ?? false,
        checks: base?.checks ?? {}, alcances: base?.alcances ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); onCerrar(); },
    onError: () => toast.error(t("posiciones.errorGuardar")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(editando ? "posiciones.dialogo.editar" : "posiciones.dialogo.nueva")}</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) guardar.mutate(); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-nombre">{t("posiciones.dialogo.nombre")}</Label>
            <Input id="pos-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-desc">{t("posiciones.dialogo.descripcion")}</Label>
            <Textarea id="pos-desc" value={desc} maxLength={300} rows={2} onChange={(e) => setDesc(e.target.value)} />
          </div>
          {!editando && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pos-copiar">{t("posiciones.dialogo.copiarDe")}</Label>
              <select id="pos-copiar" value={copiar} onChange={(e) => setCopiar(e.target.value)} className="h-10 rounded-control border border-input bg-background px-3 text-sm">
                <option value="">{t("posiciones.dialogo.ninguna")}</option>
                {posiciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>{t("posiciones.dialogo.cancelar")}</Button>
            <Button type="submit" disabled={!nombre.trim() || guardar.isPending}>{t("posiciones.dialogo.guardar")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permisos de una posición (Set permissions) ─────────────────────────────

function PermisosDe({ pos, personas, asignaciones, onVolver }: { pos: Posicion; personas: Persona[]; asignaciones: Asignacion[]; onVolver: () => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  // Como Blu: los grupos arrancan cerrados y se abren con la flecha.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const gente = asignaciones.filter((a) => a.posicion_id === pos.id).map((a) => personas.find((p) => p.id === a.user_id)?.full_name).filter(Boolean) as string[];

  // Autoguardado como Blu: cada check escribe al instante (optimista).
  const guardar = useMutation({
    mutationFn: async (cambio: Partial<Posicion>) => {
      const { error } = await sinTipar.from("posiciones_borrador").update({ ...cambio, updated_at: new Date().toISOString() }).eq("id", pos.id);
      if (error) throw error;
    },
    onMutate: async (cambio) => {
      await qc.cancelQueries({ queryKey: KEY });
      const antes = qc.getQueryData(KEY);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData(KEY, (d: any) => d && { ...d, posiciones: d.posiciones.map((p: Posicion) => (p.id === pos.id ? { ...p, ...cambio } : p)) });
      return { antes };
    },
    onError: (_e, _c, ctx) => { qc.setQueryData(KEY, ctx?.antes); toast.error(t("posiciones.errorGuardar")); },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const marcar = (claves: string[], v: boolean) => {
    const checks = { ...pos.checks };
    for (const k of claves) { if (v) checks[k] = true; else delete checks[k]; }
    guardar.mutate({ checks });
  };
  const on = (k: string) => pos.acceso_total || !!pos.checks[k];
  const estadoDe = (claves: string[]): boolean | "indeterminate" => {
    const n = claves.filter(on).length;
    return n === 0 ? false : n === claves.length ? true : "indeterminate";
  };
  const alternar = (id: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bloqueado = pos.acceso_total;
  const modalidades = useModalidades();

  return (
    <>
      <PageHeader
        title={t("posiciones.permisosDe", { nombre: pos.nombre })}
        subtitle={<span className="flex flex-wrap items-center gap-1"><Users className="h-4 w-4" />{gente.join(" · ") || "—"}</span>}
        actions={<Button variant="outline" onClick={onVolver}><ArrowLeft className="mr-1.5 h-4 w-4" />{t("posiciones.volver")}</Button>}
      />
      <AvisoBorrador />
      <div className="flex items-center gap-2 rounded-control border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />{t("posiciones.autoguardado")}
      </div>

      {([["acceso_total", "posiciones.accesoTotal", "posiciones.accesoTotalDesc"], ["todas_creadoras", "posiciones.todasCreadoras", "posiciones.todasCreadorasDesc"]] as const).map(([campo, tit, desc]) => (
        <label key={campo} className="flex cursor-pointer items-start gap-3 rounded-panel border border-border bg-card p-4">
          <Casilla className="mt-0.5" checked={pos[campo]} onCheckedChange={(v) => guardar.mutate({ [campo]: v === true } as Partial<Posicion>)} />
          <span>
            <span className="block text-sm font-semibold">{t(tit)}</span>
            <span className="block text-xs text-muted-foreground">{t(desc)}</span>
          </span>
        </label>
      ))}

      {/* La pausa que trae el puesto (19/11/2026): sale de las modalidades de la empresa. */}
      <div className="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-card p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("posiciones.pausa")}</span>
          <span className="block text-xs text-muted-foreground">{t("posiciones.pausaDesc")}</span>
        </span>
        <select
          className="h-9 rounded-control border border-input bg-background px-2 text-sm"
          value={pos.modalidad_id ?? ""}
          onChange={(e) => guardar.mutate({ modalidad_id: e.target.value || null })}
          aria-label={t("posiciones.pausa")}
        >
          <option value="">{t("posiciones.pausaSinDefinir")}</option>
          {(modalidades.data?.modalidades ?? []).filter((m) => m.activa || m.id === pos.modalidad_id).map((m) => (
            <option key={m.id} value={m.id}>{m.nombre} · {m.comida_min} + {m.bano_min} min</option>
          ))}
        </select>
      </div>

      {CATALOGO_POSICIONES.map((sec) => {
        const clavesSec = sec.grupos.flatMap((g) => g.filas.flatMap((f) => f.funciones.map((x) => x.clave)));
        return (
          <section key={sec.seccion} className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t(sec.etiqueta)}</h2>
            <div className={cn("overflow-x-auto rounded-panel border border-border bg-card", bloqueado && "opacity-60")}>
              <Table className="w-full min-w-[720px] text-sm">
                <TableHeader className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <TableRow>
                    <TableHead className="w-[28%] px-4 py-2.5 font-medium">{t("posiciones.col.menus")}</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">{t("posiciones.col.funciones")}</TableHead>
                    <TableHead className="w-[200px] px-4 py-2.5 font-medium">{t("posiciones.col.datos")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-t border-border">
                    <TableCell className="px-4 py-2.5">
                      <label className="flex items-center gap-2 font-medium">
                        <Casilla disabled={bloqueado} checked={estadoDe(clavesSec)} onCheckedChange={(v) => marcar(clavesSec, v === true)} />{t("posiciones.todo")}
                      </label>
                    </TableCell>
                    <TableCell className="px-4 py-2.5" colSpan={2}>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Casilla disabled={bloqueado} checked={estadoDe(clavesSec)} onCheckedChange={(v) => marcar(clavesSec, v === true)} />{t("posiciones.todo")}
                      </label>
                    </TableCell>
                  </TableRow>
                  {sec.grupos.map((g) => {
                    const id = `${sec.seccion}/${g.grupo}`;
                    const clavesG = g.filas.flatMap((f) => f.funciones.map((x) => x.clave));
                    const abierto = abiertos.has(id);
                    // Grupo de una sola fila: va directo, sin flecha (como «API keys» en Blu).
                    if (g.filas.length === 1) {
                      const f = g.filas[0];
                      return [<FilaPermiso key={`${id}/${f.fila}`} fila={{ ...f, etiqueta: g.etiqueta }} pos={pos} bloqueado={bloqueado} on={on} estadoDe={estadoDe} marcar={marcar} plano
                        alcance={(a) => guardar.mutate({ alcances: { ...pos.alcances, [f.fila]: a } })} />];
                    }
                    return [
                      <TableRow key={id} className="border-t border-border bg-muted/20">
                        <TableCell className="px-4 py-2.5">
                          <span className="flex items-center gap-2 font-medium">
                            <Casilla disabled={bloqueado} checked={estadoDe(clavesG)} onCheckedChange={(v) => marcar(clavesG, v === true)} aria-label={t(g.etiqueta)} />
                            <button type="button" onClick={() => alternar(id)} className="flex items-center gap-1 hover:text-primary" aria-expanded={abierto}>
                              {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{t(g.etiqueta)}
                            </button>
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground">—</TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground">—</TableCell>
                      </TableRow>,
                      ...(abierto ? g.filas.map((f) => (
                        <FilaPermiso key={`${id}/${f.fila}`} fila={f} pos={pos} bloqueado={bloqueado} on={on} estadoDe={estadoDe} marcar={marcar}
                          alcance={(a) => guardar.mutate({ alcances: { ...pos.alcances, [f.fila]: a } })} />
                      )) : []),
                    ];
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function FilaPermiso({ fila, pos, bloqueado, on, estadoDe, marcar, alcance, plano = false }: {
  fila: FilaCatalogo; pos: Posicion; bloqueado: boolean; plano?: boolean;
  on: (k: string) => boolean; estadoDe: (c: string[]) => boolean | "indeterminate";
  marcar: (c: string[], v: boolean) => void; alcance: (a: AlcanceDatos) => void;
}) {
  const { t } = useLanguage();
  const claves = fila.funciones.map((x) => x.clave);
  const alguna = claves.some(on);
  const actual: AlcanceDatos = pos.acceso_total ? "all" : (pos.alcances[fila.fila] ?? "all");
  return (
    <TableRow className="border-t border-border align-top">
      <TableCell className="px-4 py-3">
        <label className={cn("flex items-center gap-2", plano ? "font-medium" : "pl-6")}>
          <Casilla disabled={bloqueado} checked={estadoDe(claves)} onCheckedChange={(v) => marcar(claves, v === true)} />{t(fila.etiqueta)}
        </label>
      </TableCell>
      <TableCell className="px-4 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {fila.funciones.map((fn) => (
            <label key={fn.clave} className={cn("flex items-center gap-1.5", !on(fn.clave) && "text-muted-foreground")}>
              <Casilla disabled={bloqueado} checked={on(fn.clave)} onCheckedChange={(v) => marcar([fn.clave], v === true)} />
              {t(fn.etiqueta)}
              {fn.nueva && <span title={t("posiciones.nuevoAyuda")} className="rounded-control bg-warning/15 px-1.5 text-[10px] font-medium text-warning">{t("posiciones.nuevo")}</span>}
            </label>
          ))}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        {fila.datos === "no" ? (
          <span className="text-xs text-muted-foreground">{t("posiciones.datos.empresa")}</span>
        ) : (
          <div className={cn("flex flex-col gap-1 text-xs", !alguna && "opacity-50")} role="radiogroup" aria-label={t("posiciones.col.datos")}>
            {(["all", "subordinates", "self"] as const).map((a) => (
              <label key={a} className={cn("flex cursor-pointer items-center gap-2", actual === a && alguna ? "text-foreground" : "text-muted-foreground")}>
                <input type="radio" name={`alc-${pos.id}-${fila.fila}`} className="accent-[hsl(var(--primary))]" disabled={bloqueado || !alguna}
                  checked={actual === a} onChange={() => alcance(a)} />
                {t(`posiciones.datos.${a}`)}
              </label>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Personas: quién va en qué posición + checks por persona ────────────────

function ListaPersonas({ datos }: { datos: NonNullable<ReturnType<typeof useDatos>["data"]> }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState("");
  const marcas = new Map(datos.marcas.map((m) => [m.user_id, m]));
  const nombresPos = new Map(datos.posiciones.map((p) => [p.id, p.nombre]));
  const posDe = (uid: string) => datos.asignaciones.filter((a) => a.user_id === uid).map((a) => a.posicion_id);
  const visibles = datos.personas.filter((p) => !buscar || (p.full_name ?? "").toLowerCase().includes(buscar.toLowerCase()));

  const cambiarPos = useMutation({
    mutationFn: async ({ uid, pid, v }: { uid: string; pid: string; v: boolean }) => {
      const r = v
        ? await sinTipar.from("posiciones_borrador_personas").insert({ user_id: uid, posicion_id: pid })
        : await sinTipar.from("posiciones_borrador_personas").delete().eq("user_id", uid).eq("posicion_id", pid);
      if (r.error) throw r.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t("posiciones.errorGuardar")),
  });
  const cambiarMarca = useMutation({
    mutationFn: async ({ uid, campo, v }: { uid: string; campo: "protegido" | "sin_camara" | "deshabilitada"; v: boolean }) => {
      const actual = marcas.get(uid);
      const fila = { user_id: uid, protegido: actual?.protegido ?? false, sin_camara: actual?.sin_camara ?? false, deshabilitada: actual?.deshabilitada ?? false, [campo]: v, updated_at: new Date().toISOString() };
      const { error } = await sinTipar.from("personas_borrador_marcas").upsert(fila);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t("posiciones.errorGuardar")),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="buscar-persona" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t("posiciones.personas.buscar")} className="pl-8" />
          </div>
          <span className="text-xs text-muted-foreground">{t("posiciones.personas.total", { n: visibles.length })}</span>
        </div>
        <div className="divide-y divide-border rounded-control border border-border text-sm">
          <div className="hidden grid-cols-[1.1fr_1.4fr_1.5fr] gap-4 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>{t("posiciones.personas.col.persona")}</span>
            <span>{t("posiciones.personas.col.posiciones")}</span>
            <span>{t("posiciones.personas.col.marcas")}</span>
          </div>
              {visibles.map((p) => {
                const mias = posDe(p.id);
                const m = marcas.get(p.id);
                return (
                  <div key={p.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.1fr_1.4fr_1.5fr] md:gap-4">
                    <div><span className="flex items-center gap-2 font-medium"><Letra nombre={p.full_name} />{p.full_name}</span></div>
                    <div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" aria-label={t("posiciones.personas.asignar", { nombre: p.full_name ?? "" })}
                            className="flex max-w-[320px] flex-wrap items-center gap-1 rounded-control border border-dashed border-border px-2 py-1 text-left hover:border-primary/50">
                            {mias.length === 0
                              ? <span className="text-xs text-muted-foreground">{t("posiciones.personas.sinPosicion")}</span>
                              : mias.map((pid) => <span key={pid} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{nombresPos.get(pid)}</span>)}
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-2">
                          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                            {datos.posiciones.map((pos) => (
                              <label key={pos.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                                <Casilla checked={mias.includes(pos.id)} onCheckedChange={(v) => cambiarPos.mutate({ uid: p.id, pid: pos.id, v: v === true })} />
                                {pos.nombre}
                              </label>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <div className="flex flex-col gap-1.5 text-xs">
                        {([["protegido", "posiciones.personas.protegido"], ["sin_camara", "posiciones.personas.sinCamara"], ["deshabilitada", "posiciones.personas.deshabilitada"]] as const).map(([campo, k]) => (
                          <label key={campo} className={cn("flex cursor-pointer items-center gap-2", !m?.[campo] && "text-muted-foreground")}>
                            <Casilla checked={!!m?.[campo]} onCheckedChange={(v) => cambiarMarca.mutate({ uid: p.id, campo, v: v === true })} />{t(k)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </CardContent>
    </Card>
  );
}
