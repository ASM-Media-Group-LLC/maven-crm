import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Info, MoreHorizontal, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
    return <div className="p-8 text-sm text-muted-foreground">{t("posiciones.soloDueno")}</div>;
  }

  const posAbierta = datos.data?.posiciones.find((p) => p.id === abierta) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      {posAbierta ? (
        <PermisosDe pos={posAbierta} personas={datos.data!.personas} asignaciones={datos.data!.asignaciones} onVolver={() => setAbierta(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("posiciones.titulo")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("posiciones.sub")}</p>
            </div>
            <div className="flex rounded-lg border border-border p-0.5 text-sm">
              {(["posiciones", "personas"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPestana(p)}
                  className={cn("rounded-md px-3 py-1.5 transition-colors", pestana === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {t(`posiciones.tab.${p}`)}
                </button>
              ))}
            </div>
          </div>
          <AvisoBorrador />
          {datos.isError ? (
            <Card><CardContent className="flex items-center justify-between gap-3 p-5 text-sm">
              <span>{t("posiciones.error")}</span>
              <Button size="sm" variant="outline" onClick={() => void datos.refetch()}>{t("posiciones.reintentar")}</Button>
            </CardContent></Card>
          ) : !datos.data ? (
            <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
          ) : pestana === "posiciones" ? (
            <ListaPosiciones datos={datos.data} onAbrir={setAbierta} />
          ) : (
            <ListaPersonas datos={datos.data} />
          )}
        </>
      )}
    </div>
  );
}

function AvisoBorrador() {
  const { t } = useLanguage();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{t("posiciones.borrador")}</span>
    </div>
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
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("posiciones.col.posicion")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("posiciones.col.descripcion")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("posiciones.col.personas")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("posiciones.col.estado")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("posiciones.col.acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("posiciones.vacio")}</td></tr>
                )}
                {visibles.map((p) => {
                  const gente = genteDe.get(p.id) ?? [];
                  return (
                    <tr key={p.id} className="border-t border-border align-middle">
                      <td className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">{p.acceso_total && <ShieldCheck className="h-4 w-4 text-primary" />}{p.nombre}</span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-muted-foreground">{p.descripcion || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-[360px] flex-wrap gap-1">
                          {gente.slice(0, 3).map((n) => <span key={n} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">{n}</span>)}
                          {gente.length > 3 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">+{gente.length - 3}</span>}
                          {gente.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Switch checked={p.activa} onCheckedChange={() => cambiarEstado.mutate(p)} aria-label={t("posiciones.col.estado")} />
                      </td>
                      <td className="px-4 py-3 text-right">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              <select id="pos-copiar" value={copiar} onChange={(e) => setCopiar(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
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
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
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
  const alternar = (id: string) => setCerrados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bloqueado = pos.acceso_total;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("posiciones.permisosDe", { nombre: pos.nombre })}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" />{gente.join(" · ") || "—"}</p>
        </div>
        <Button variant="outline" onClick={onVolver}><ArrowLeft className="mr-1.5 h-4 w-4" />{t("posiciones.volver")}</Button>
      </div>
      <AvisoBorrador />
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />{t("posiciones.autoguardado")}
      </div>

      {([["acceso_total", "posiciones.accesoTotal", "posiciones.accesoTotalDesc"], ["todas_creadoras", "posiciones.todasCreadoras", "posiciones.todasCreadorasDesc"]] as const).map(([campo, tit, desc]) => (
        <label key={campo} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Checkbox className="mt-0.5" checked={pos[campo]} onCheckedChange={(v) => guardar.mutate({ [campo]: v === true } as Partial<Posicion>)} />
          <span>
            <span className="block text-sm font-semibold">{t(tit)}</span>
            <span className="block text-xs text-muted-foreground">{t(desc)}</span>
          </span>
        </label>
      ))}

      {CATALOGO_POSICIONES.map((sec) => {
        const clavesSec = sec.grupos.flatMap((g) => g.filas.flatMap((f) => f.funciones.map((x) => x.clave)));
        return (
          <section key={sec.seccion} className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t(sec.etiqueta)}</h2>
            <div className={cn("overflow-x-auto rounded-xl border border-border bg-card", bloqueado && "opacity-60")}>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-[28%] px-4 py-2.5 font-medium">{t("posiciones.col.menus")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("posiciones.col.funciones")}</th>
                    <th className="w-[200px] px-4 py-2.5 font-medium">{t("posiciones.col.datos")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <label className="flex items-center gap-2 font-medium">
                        <Checkbox disabled={bloqueado} checked={estadoDe(clavesSec)} onCheckedChange={(v) => marcar(clavesSec, v === true)} />{t("posiciones.todo")}
                      </label>
                    </td>
                    <td className="px-4 py-2.5" colSpan={2}>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox disabled={bloqueado} checked={estadoDe(clavesSec)} onCheckedChange={(v) => marcar(clavesSec, v === true)} />{t("posiciones.todo")}
                      </label>
                    </td>
                  </tr>
                  {sec.grupos.map((g) => {
                    const id = `${sec.seccion}/${g.grupo}`;
                    const clavesG = g.filas.flatMap((f) => f.funciones.map((x) => x.clave));
                    const abierto = !cerrados.has(id);
                    return [
                      <tr key={id} className="border-t border-border bg-muted/20">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 font-medium">
                            <Checkbox disabled={bloqueado} checked={estadoDe(clavesG)} onCheckedChange={(v) => marcar(clavesG, v === true)} aria-label={t(g.etiqueta)} />
                            <button type="button" onClick={() => alternar(id)} className="flex items-center gap-1 hover:text-primary" aria-expanded={abierto}>
                              {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{t(g.etiqueta)}
                            </button>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">—</td>
                        <td className="px-4 py-2.5 text-muted-foreground">—</td>
                      </tr>,
                      ...(abierto ? g.filas.map((f) => (
                        <FilaPermiso key={`${id}/${f.fila}`} fila={f} pos={pos} bloqueado={bloqueado} on={on} estadoDe={estadoDe} marcar={marcar}
                          alcance={(a) => guardar.mutate({ alcances: { ...pos.alcances, [f.fila]: a } })} />
                      )) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function FilaPermiso({ fila, pos, bloqueado, on, estadoDe, marcar, alcance }: {
  fila: FilaCatalogo; pos: Posicion; bloqueado: boolean;
  on: (k: string) => boolean; estadoDe: (c: string[]) => boolean | "indeterminate";
  marcar: (c: string[], v: boolean) => void; alcance: (a: AlcanceDatos) => void;
}) {
  const { t } = useLanguage();
  const claves = fila.funciones.map((x) => x.clave);
  const alguna = claves.some(on);
  const actual: AlcanceDatos = pos.acceso_total ? "all" : (pos.alcances[fila.fila] ?? "all");
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <label className="flex items-center gap-2 pl-6">
          <Checkbox disabled={bloqueado} checked={estadoDe(claves)} onCheckedChange={(v) => marcar(claves, v === true)} />{t(fila.etiqueta)}
        </label>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {fila.funciones.map((fn) => (
            <label key={fn.clave} className={cn("flex items-center gap-1.5", !on(fn.clave) && "text-muted-foreground")}>
              <Checkbox disabled={bloqueado} checked={on(fn.clave)} onCheckedChange={(v) => marcar([fn.clave], v === true)} />
              {t(fn.etiqueta)}
              {fn.nueva && <span title={t("posiciones.nuevoAyuda")} className="rounded bg-amber-500/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">{t("posiciones.nuevo")}</span>}
            </label>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
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
      </td>
    </tr>
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("posiciones.personas.col.persona")}</th>
                <th className="px-4 py-2.5 font-medium">{t("posiciones.personas.col.posiciones")}</th>
                <th className="px-4 py-2.5 font-medium">{t("posiciones.personas.col.marcas")}</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const mias = posDe(p.id);
                const m = marcas.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium"><Letra nombre={p.full_name} />{p.full_name}</span></td>
                    <td className="px-4 py-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" aria-label={t("posiciones.personas.asignar", { nombre: p.full_name ?? "" })}
                            className="flex max-w-[320px] flex-wrap items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-left hover:border-primary/50">
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
                                <Checkbox checked={mias.includes(pos.id)} onCheckedChange={(v) => cambiarPos.mutate({ uid: p.id, pid: pos.id, v: v === true })} />
                                {pos.nombre}
                              </label>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5 text-xs">
                        {([["protegido", "posiciones.personas.protegido"], ["sin_camara", "posiciones.personas.sinCamara"], ["deshabilitada", "posiciones.personas.deshabilitada"]] as const).map(([campo, k]) => (
                          <label key={campo} className={cn("flex cursor-pointer items-center gap-2", !m?.[campo] && "text-muted-foreground")}>
                            <Checkbox checked={!!m?.[campo]} onCheckedChange={(v) => cambiarMarca.mutate({ uid: p.id, campo, v: v === true })} />{t(k)}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
