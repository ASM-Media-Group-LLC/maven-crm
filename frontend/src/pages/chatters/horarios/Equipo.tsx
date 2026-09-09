import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, X, Loader2, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TurnoBadge } from "./MiSemana";
import { useChattersCatalogo, useCreadorasCatalogo, useDescansos, useMutacionesHorarios, useNombres, useRoster } from "./useHorarios";
import { AGENCIAS, DIAS_CORTOS, TURNOS, type Agency, type Descanso, type Grupo, type GrupoCreadora, type Miembro, type Shift, diaSemanaDe, etiquetaDia, etiquetaSemana, fechaDe, lunesDe, sumarDias, urlCreadora } from "./types";

const NADIE = "__nadie__";

// EQUIPO: la grilla que arma el supervisor. Grupo × día; cada celda es el
// descanso de esa persona esa semana. Reemplaza el copiar columnas del Excel.
export default function Equipo({ puedeGestionar, hoy = new Date() }: { puedeGestionar: boolean; hoy?: Date }) {
  const [agency, setAgency] = useState<Agency>(() => (localStorage.getItem("maven.horarios.agencia") === "massive" ? "massive" : "plus"));
  const [semana, setSemana] = useState(() => lunesDe(hoy));
  const { grupos, miembros, creadoras, cargando } = useRoster(agency);
  const descansos = useDescansos(semana, semana, agency);
  const nombres = useNombres([...miembros.map((m) => m.identity_id), ...(descansos.data ?? []).flatMap((d) => [d.identity_id ?? "", d.covered_by_identity_id ?? ""])]);
  const [editando, setEditando] = useState<Grupo | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState(false);
  const mut = useMutacionesHorarios();
  const { toast } = useToast();

  const elegirAgencia = (a: Agency) => { setAgency(a); try { localStorage.setItem("maven.horarios.agencia", a); } catch { /* noop */ } };
  const filas = descansos.data ?? [];
  const esSemanaActual = semana === lunesDe(hoy);
  const diaHoy = esSemanaActual ? diaSemanaDe(hoy) : -1;
  const semanaVacia = filas.filter((d) => d.identity_id).length === 0;

  const porGrupo = useMemo(() => grupos.map((g) => ({
    grupo: g,
    miembros: miembros.filter((m) => m.group_id === g.id).sort((a, b) => a.shift.localeCompare(b.shift) || (nombres[a.identity_id] ?? "").localeCompare(nombres[b.identity_id] ?? "")),
    creadoras: creadoras.filter((c) => c.group_id === g.id),
  })), [grupos, miembros, creadoras, nombres]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
          {AGENCIAS.map((a) => (
            <button key={a.id} type="button" onClick={() => elegirAgencia(a.id)}
              className={cn("rounded-full px-3.5 py-1 text-sm transition-colors", agency === a.id ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center rounded-full border">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <button type="button" className="px-2 text-sm font-medium tabular-nums hover:underline" onClick={() => setSemana(lunesDe(hoy))} title="Volver a la semana actual">
            {etiquetaSemana(semana)}{esSemanaActual && <span className="ml-1.5 text-[10px] font-medium uppercase text-primary">actual</span>}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {puedeGestionar && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setNuevoGrupo(true)}><Plus className="h-4 w-4" /> Grupo</Button>
            <CopiarSemana agency={agency} semana={semana} deshabilitado={!semanaVacia} onCopiar={async (rotar) => {
              try {
                const n = await mut.copiarSemana.mutateAsync({ agency, to_week: semana, rotar });
                toast({ title: `Semana copiada: ${n} descansos${rotar ? " (rotados un día)" : ""}` });
              } catch (e) { toast({ title: "No se pudo copiar", description: (e as Error).message, variant: "destructive" }); }
            }} />
          </div>
        )}
      </div>

      {cargando || descansos.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay grupos de {agency === "plus" ? "Plus" : "Massive"}.</div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium w-[150px]">Grupo</th>
                <th className="px-3 py-2.5 text-left font-medium">Chatter</th>
                <th className="px-3 py-2.5 text-left font-medium w-[70px]">Turno</th>
                {DIAS_CORTOS.map((d, i) => (
                  <th key={d} className={cn("px-2 py-2.5 text-center font-medium", i === diaHoy && "text-primary")}>{d} {fechaDe(sumarDias(semana, i)).getDate()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porGrupo.map(({ grupo, miembros: ms, creadoras: cs }) => (
                ms.length === 0 ? (
                  <tr key={grupo.id} className="border-t">
                    <CeldaGrupo grupo={grupo} creadoras={cs} puedeGestionar={puedeGestionar} onEditar={() => setEditando(grupo)} rowSpan={1} />
                    <td colSpan={9} className="px-3 py-3 text-muted-foreground">Sin chatters asignados.</td>
                  </tr>
                ) : ms.map((m, idx) => {
                  const mio = filas.find((d) => d.identity_id === m.identity_id);
                  return (
                    <tr key={m.id} className={cn("border-t", idx === 0 && "border-t-2")}>
                      {idx === 0 && <CeldaGrupo grupo={grupo} creadoras={cs} puedeGestionar={puedeGestionar} onEditar={() => setEditando(grupo)} rowSpan={ms.length} />}
                      <td className="px-3 py-2">
                        <div className="font-semibold">{nombres[m.identity_id] ?? "…"}</div>
                        {m.is_supernumerary && <div className="text-[11px] text-muted-foreground">Supernumerario</div>}
                      </td>
                      <td className="px-3 py-2"><TurnoBadge shift={m.shift} /></td>
                      {DIAS_CORTOS.map((_, i) => (
                        <CeldaDia key={i} miembro={m} weekday={i} semana={semana} agency={agency} descanso={mio?.weekday === i ? mio : null}
                          esHoy={i === diaHoy} puedeGestionar={puedeGestionar} nombres={nombres} miembros={miembros}
                          onFijar={(p) => mut.fijarDescanso.mutate({ week_start: semana, agency, weekday: i, shift: m.shift, identity_id: m.identity_id, ...p })}
                          onQuitar={() => mio && mut.quitarDescanso.mutate(mio.id)} />
                      ))}
                    </tr>
                  );
                })
              ))}
              <NotasDia semana={semana} agency={agency} filas={filas} puedeGestionar={puedeGestionar} diaHoy={diaHoy}
                onFijar={(weekday, shift, note) => mut.fijarNotaDia.mutate({ week_start: semana, agency, weekday, shift, note })} />
            </tbody>
          </table>
        </div>
      )}

      {editando && <EditarGrupo grupo={editando} miembros={miembros.filter((m) => m.group_id === editando.id)} creadoras={creadoras.filter((c) => c.group_id === editando.id)} nombres={nombres} onClose={() => setEditando(null)} />}
      {nuevoGrupo && (
        <NuevoGrupo agency={agency} siguiente={grupos.length + 1} onClose={() => setNuevoGrupo(false)}
          onCrear={async (name) => { await mut.crearGrupo.mutateAsync({ agency, name, sort_order: grupos.length + 1 }); setNuevoGrupo(false); }} />
      )}
    </div>
  );
}

function CeldaGrupo({ grupo, creadoras, puedeGestionar, onEditar, rowSpan }: { grupo: Grupo; creadoras: GrupoCreadora[]; puedeGestionar: boolean; onEditar: () => void; rowSpan: number }) {
  return (
    <td rowSpan={rowSpan} className="px-3 py-2 align-top border-r bg-muted/20">
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="font-display font-bold">{grupo.name}</div>
          <div className="text-[11px] text-muted-foreground">{creadoras.length} creadora{creadoras.length === 1 ? "" : "s"}{grupo.lead_name ? ` · ${grupo.lead_name}` : ""}</div>
        </div>
        {puedeGestionar && <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={onEditar} aria-label={`Editar ${grupo.name}`}><Pencil className="h-3.5 w-3.5" /></Button>}
      </div>
      <ul className="mt-2 space-y-0.5">
        {creadoras.slice(0, 6).map((c) => {
          const url = urlCreadora(c);
          return <li key={c.id} className="font-mono text-[11px] text-muted-foreground truncate">{url ? <Link to={url} className="hover:underline hover:text-foreground">@{c.creator_handle}</Link> : `@${c.creator_handle}`}</li>;
        })}
        {creadoras.length > 6 && <li className="text-[11px] text-muted-foreground">+{creadoras.length - 6} más</li>}
      </ul>
    </td>
  );
}

function CeldaDia({ miembro, weekday, semana, agency, descanso, esHoy, puedeGestionar, nombres, miembros, onFijar, onQuitar }: {
  miembro: Miembro; weekday: number; semana: string; agency: Agency; descanso: Descanso | null; esHoy: boolean; puedeGestionar: boolean;
  nombres: Record<string, string>; miembros: Miembro[];
  onFijar: (p: { covered_by_identity_id: string | null; note: string | null }) => void; onQuitar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cubre, setCubre] = useState<string>(descanso?.covered_by_identity_id ?? NADIE);
  const [nota, setNota] = useState(descanso?.note ?? "");
  // Candidatos a cubrir: los demás chatters del mismo turno en la agencia.
  const candidatos = miembros.filter((m) => m.identity_id !== miembro.identity_id && m.shift === miembro.shift);

  const contenido = descanso ? (
    <span className="inline-flex flex-col items-center rounded-md bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300 leading-tight">
      <span className="inline-flex items-center gap-1"><CalendarOff className="h-3 w-3" /> Descansa</span>
      {descanso.covered_by_identity_id && <span className="font-normal text-muted-foreground">cubre {(nombres[descanso.covered_by_identity_id] ?? "…").split(" ")[0]}</span>}
      {descanso.note && <span className="font-normal text-muted-foreground truncate max-w-[110px]">{descanso.note}</span>}
    </span>
  ) : <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" aria-label="Trabaja" />;

  if (!puedeGestionar) return <td className={cn("px-2 py-2 text-center", esHoy && "bg-primary/5")}>{contenido}</td>;

  return (
    <td className={cn("px-1 py-1 text-center", esHoy && "bg-primary/5")}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setCubre(descanso?.covered_by_identity_id ?? NADIE); setNota(descanso?.note ?? ""); } }}>
        <PopoverTrigger asChild>
          <button type="button" className="w-full rounded-md px-1 py-1.5 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`${nombres[miembro.identity_id] ?? ""} · ${etiquetaDia(semana, weekday)}`}>{contenido}</button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 space-y-3">
          <div>
            <p className="text-sm font-semibold">{nombres[miembro.identity_id] ?? "…"}</p>
            <p className="text-xs text-muted-foreground">{etiquetaDia(semana, weekday)} · {TURNOS[miembro.shift].label} · {agency === "plus" ? "Plus" : "Massive"}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quién cubre</Label>
            <Select value={cubre} onValueChange={setCubre}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NADIE}>Nadie todavía</SelectItem>
                {candidatos.map((c) => <SelectItem key={c.id} value={c.identity_id}>{nombres[c.identity_id] ?? "…"}{c.is_supernumerary ? " · supernumerario" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nota</Label>
            <Input className="h-9" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: “No descanso”, “cambio con…”" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="rounded-full" onClick={() => { onFijar({ covered_by_identity_id: cubre === NADIE ? null : cubre, note: nota.trim() || null }); setOpen(false); }}>
              {descanso ? "Guardar" : "Marcar descanso"}
            </Button>
            {descanso && <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => { onQuitar(); setOpen(false); }}><Trash2 className="h-3.5 w-3.5 mr-1" /> Quitar</Button>}
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
}

// Fila de notas del día por turno ("Cierre de mes: sin descansos").
function NotasDia({ semana, agency, filas, puedeGestionar, diaHoy, onFijar }: { semana: string; agency: Agency; filas: Descanso[]; puedeGestionar: boolean; diaHoy: number; onFijar: (weekday: number, shift: Shift, note: string | null) => void }) {
  const notas = filas.filter((d) => d.identity_id === null);
  return (
    <tr className="border-t-2 bg-muted/20">
      <td className="px-3 py-2 text-xs font-medium text-muted-foreground border-r" colSpan={3}>Notas del día</td>
      {DIAS_CORTOS.map((_, i) => {
        const del = notas.filter((n) => n.weekday === i);
        return (
          <td key={i} className={cn("px-1 py-1 text-center align-top", i === diaHoy && "bg-primary/5")}>
            {puedeGestionar ? (
              <NotaPopover semana={semana} weekday={i} agency={agency} notas={del} onFijar={(shift, note) => onFijar(i, shift, note)} />
            ) : del.map((n) => <div key={n.id} className="text-[11px] text-muted-foreground">{TURNOS[n.shift].label}: {n.note}</div>)}
          </td>
        );
      })}
    </tr>
  );
}

function NotaPopover({ semana, weekday, agency, notas, onFijar }: { semana: string; weekday: number; agency: Agency; notas: Descanso[]; onFijar: (shift: Shift, note: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState<Shift>("am");
  const [texto, setTexto] = useState("");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTexto(notas.find((n) => n.shift === shift)?.note ?? ""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full min-h-[28px] rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:bg-muted/70">
          {notas.length === 0 ? <span className="opacity-40">+</span> : notas.map((n) => <div key={n.id} className="truncate">{TURNOS[n.shift].label}: {n.note}</div>)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <p className="text-sm font-semibold">{etiquetaDia(semana, weekday)} · {agency === "plus" ? "Plus" : "Massive"}</p>
        <Select value={shift} onValueChange={(v) => { setShift(v as Shift); setTexto(notas.find((n) => n.shift === v)?.note ?? ""); }}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(TURNOS) as Shift[]).map((s) => <SelectItem key={s} value={s}>{TURNOS[s].label}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="h-9" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="“Cierre de mes: sin descansos”" />
        <div className="flex gap-2">
          <Button size="sm" className="rounded-full" onClick={() => { onFijar(shift, texto.trim() || null); setOpen(false); }}>Guardar</Button>
          {notas.some((n) => n.shift === shift) && <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => { onFijar(shift, null); setOpen(false); }}>Quitar</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CopiarSemana({ agency, semana, deshabilitado, onCopiar }: { agency: Agency; semana: string; deshabilitado: boolean; onCopiar: (rotar: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [rotar, setRotar] = useState(true);
  const [pendiente, setPendiente] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" className="rounded-full gap-1.5" disabled={deshabilitado} title={deshabilitado ? "Esta semana ya tiene descansos cargados" : undefined}><Copy className="h-4 w-4" /> Copiar semana anterior</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-semibold">Copiar descansos de {agency === "plus" ? "Plus" : "Massive"}</p>
          <p className="text-xs text-muted-foreground">De la semana del {etiquetaSemana(sumarDias(semana, -7))} a la del {etiquetaSemana(semana)}.</p>
        </div>
        <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
          <Switch checked={rotar} onCheckedChange={setRotar} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Rotar un día</span>
            <span className="block text-xs text-muted-foreground">Quien descansó el lunes pasa al martes, y así. Desactivalo para copiar los mismos días. Después se edita celda por celda.</span>
          </span>
        </label>
        <Button size="sm" className="rounded-full w-full" disabled={pendiente} onClick={async () => { setPendiente(true); try { await onCopiar(rotar); setOpen(false); } finally { setPendiente(false); } }}>
          {pendiente && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Copiar
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// Editor del grupo: quiénes lo atienden y a qué creadoras.
function EditarGrupo({ grupo, miembros, creadoras, nombres, onClose }: { grupo: Grupo; miembros: Miembro[]; creadoras: GrupoCreadora[]; nombres: Record<string, string>; onClose: () => void }) {
  const mut = useMutacionesHorarios();
  const chatters = useChattersCatalogo(true);
  const catalogo = useCreadorasCatalogo(true);
  const [nuevoChatter, setNuevoChatter] = useState("");
  const [nuevoTurno, setNuevoTurno] = useState<Shift>("am");
  const [supernumerario, setSupernumerario] = useState(false);
  const [nuevaCreadora, setNuevaCreadora] = useState("");
  const [handleLibre, setHandleLibre] = useState("");
  const [nombre, setNombre] = useState(grupo.name);
  const [lead, setLead] = useState(grupo.lead_name ?? "");
  const yaEstan = new Set(miembros.map((m) => m.identity_id));
  const yaCargadas = new Set(creadoras.map((c) => c.creator_id).filter(Boolean));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{grupo.name} · {grupo.agency === "plus" ? "Plus" : "Massive"}</DialogTitle>
          <DialogDescription>Quitar a alguien cierra su vigencia hoy; el historial se conserva.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">Nombre del grupo</Label>
            <Input className="h-9" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre.trim() && nombre !== grupo.name && mut.renombrarGrupo.mutate({ id: grupo.id, name: nombre.trim() })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Responsable (PR)</Label>
            <Input className="h-9" value={lead} onChange={(e) => setLead(e.target.value)} onBlur={() => (lead.trim() || null) !== grupo.lead_name && mut.renombrarGrupo.mutate({ id: grupo.id, lead_name: lead.trim() || null })} placeholder="Opcional" /></div>
        </div>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Chatters</h4>
          <ul className="divide-y rounded-lg border">
            {miembros.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nadie todavía.</li>}
            {miembros.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium">{nombres[m.identity_id] ?? "…"}</span>
                <TurnoBadge shift={m.shift} />
                {m.is_supernumerary && <Badge variant="secondary" className="font-normal">Supernumerario</Badge>}
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => mut.quitarMiembro.mutate(m.id)} aria-label="Quitar"><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={nuevoChatter} onValueChange={setNuevoChatter}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Agregar chatter…" /></SelectTrigger>
              <SelectContent>{(chatters.data ?? []).filter((c) => !yaEstan.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}{c.role === "Chatter Supervisor" ? " · supervisor" : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={nuevoTurno} onValueChange={(v) => setNuevoTurno(v as Shift)}>
              <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TURNOS) as Shift[]).map((s) => <SelectItem key={s} value={s}>{TURNOS[s].label}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs"><Switch checked={supernumerario} onCheckedChange={setSupernumerario} /> Supernumerario</label>
            <Button size="sm" variant="outline" className="rounded-full" disabled={!nuevoChatter} onClick={async () => { await mut.agregarMiembro.mutateAsync({ group_id: grupo.id, identity_id: nuevoChatter, shift: nuevoTurno, is_supernumerary: supernumerario }); setNuevoChatter(""); }}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Creadoras <span className="text-muted-foreground font-normal">· {creadoras.length}</span></h4>
          <ul className="divide-y rounded-lg border">
            {creadoras.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="font-mono text-[13px]">@{c.creator_handle}</span>
                {!c.creator_id && <span className="text-[10px] text-muted-foreground border rounded px-1" title="No está ligada a una creadora de Maven">sin ficha</span>}
                <span className="ml-auto flex items-center gap-1">
                  {(["ig", "mad", "sop"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => mut.marcarCreadora.mutate({ id: c.id, [k]: !c[k] })}
                      className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border", c[k] ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground/60 border-transparent hover:border-border")}>{k}</button>
                  ))}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => mut.quitarCreadora.mutate(c.id)} aria-label="Quitar"><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={nuevaCreadora} onValueChange={setNuevaCreadora}>
              <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Agregar creadora de Maven…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(catalogo.data ?? []).filter((c) => !yaCargadas.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.artistic_name || c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="rounded-full" disabled={!nuevaCreadora} onClick={async () => {
              const c = catalogo.data?.find((x) => x.id === nuevaCreadora); if (!c) return;
              await mut.agregarCreadora.mutateAsync({ group_id: grupo.id, creator_id: c.id, creator_handle: (c.artistic_name || c.name).replace(/^@/, "") }); setNuevaCreadora("");
            }}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
            <span className="text-xs text-muted-foreground">o</span>
            <Input className="h-9 w-44" value={handleLibre} onChange={(e) => setHandleLibre(e.target.value)} placeholder="@cuenta sin ficha" />
            <Button size="sm" variant="ghost" className="rounded-full" disabled={!handleLibre.trim()} onClick={async () => { await mut.agregarCreadora.mutateAsync({ group_id: grupo.id, creator_id: null, creator_handle: handleLibre.trim().replace(/^@/, "") }); setHandleLibre(""); }}>Agregar</Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function NuevoGrupo({ agency, siguiente, onClose, onCrear }: { agency: Agency; siguiente: number; onClose: () => void; onCrear: (name: string) => Promise<void> }) {
  const [name, setName] = useState(`Grupo ${siguiente}`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nuevo grupo · {agency === "plus" ? "Plus" : "Massive"}</DialogTitle><DialogDescription>Después se le agregan chatters y creadoras.</DialogDescription></DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Button className="rounded-full" disabled={!name.trim()} onClick={() => onCrear(name.trim())}>Crear</Button>
      </DialogContent>
    </Dialog>
  );
}
