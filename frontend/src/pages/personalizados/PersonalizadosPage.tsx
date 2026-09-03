import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Gift, Plus, FileSpreadsheet, LayoutGrid, List, Search, X, Loader2 } from "lucide-react";
import { AGENCIAS, ESTADOS, agenciaDe, usd, type Agency, type Estado, type Pedido } from "./types";
import { FILTROS_VACIOS, useCatalogos, usePedidos, usePermisosPersonalizados, type FiltrosPedidos } from "./usePersonalizados";
import PedidoTablero from "./PedidoTablero";
import PedidoTabla from "./PedidoTabla";
import PedidoFormDialog from "./PedidoFormDialog";
import PedidoDrawer from "./PedidoDrawer";
import ImportarSheetDialog from "./ImportarSheetDialog";

const VISTA_KEY = "maven.personalizados.vista";
const AGENCIA_KEY = "maven.personalizados.agencia";

const leerAgencia = (): Agency | "" => {
  try {
    const v = localStorage.getItem(AGENCIA_KEY);
    return AGENCIAS.some((a) => a.id === v) ? (v as Agency) : "";
  } catch { return ""; }
};
const TODOS = "__todos__";
const SIN_PEDIDOS: Pedido[] = []; // default estable: un `[]` inline cambia por render

// Últimos 12 meses para el filtro, empezando por el actual.
function mesesRecientes() {
  const out: Array<{ v: string; l: string }> = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const y = d.getFullYear(), m = d.getMonth();
    const v = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.push({ v, l: new Date(y, m, 1).toLocaleDateString("es", { month: "long", year: "numeric" }) });
    d.setMonth(m - 1);
  }
  return out;
}

// Texto del disparador de un filtro: el nombre corto del filtro cuando está en
// "todos" (antes decía "Todos los estados" y se recortaba a "Todos los…"), y el
// valor elegido cuando hay filtro.
function etiqueta(nombre: string, valor?: string | false | null) {
  return valor
    ? <span className="truncate text-foreground">{valor}</span>
    : <span className="truncate text-muted-foreground">{nombre}</span>;
}

// PERSONALIZADOS: los pedidos de contenido personalizado que los fans compran
// por chat, como tickets con ciclo de vida (reemplaza el sheet por pestañas).
export default function PersonalizadosPage() {
  // La agencia se elige arriba (Plus / Massive / Ambas) y se recuerda: cada
  // equipo trabaja casi siempre con la suya. El resto de filtros arranca vacío.
  const [filtros, setFiltros] = useState<FiltrosPedidos>(() => ({ ...FILTROS_VACIOS, agencia: leerAgencia() }));
  const [vista, setVista] = useState<"tablero" | "tabla">(() => (localStorage.getItem(VISTA_KEY) === "tabla" ? "tabla" : "tablero"));
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [abierto, setAbierto] = useState<Pedido | null>(null);

  const { data: pedidos = SIN_PEDIDOS, isLoading } = usePedidos(filtros);
  const { creadoras } = useCatalogos();
  const { puedeCrear, puedeGestionar } = usePermisosPersonalizados();

  const cambiarVista = (v: "tablero" | "tabla") => { setVista(v); try { localStorage.setItem(VISTA_KEY, v); } catch { /* noop */ } };
  const patch = (p: Partial<FiltrosPedidos>) => setFiltros((f) => ({ ...f, ...p }));
  const elegirAgencia = (a: Agency | "") => { patch({ agencia: a }); try { localStorage.setItem(AGENCIA_KEY, a); } catch { /* noop */ } };
  // La agencia no cuenta como "filtro": es el contexto de trabajo, no algo que se limpia.
  const hayFiltros = Object.entries(filtros).some(([k, v]) => k !== "agencia" && Boolean(v));
  const agenciaActual = filtros.agencia ? agenciaDe(filtros.agencia) : null;
  const meses = useMemo(mesesRecientes, []);

  // Creadoras para el filtro: las que aparecen en los pedidos (con el catálogo
  // de Maven como refuerzo), así el filtro no ofrece 60 nombres sin pedidos.
  const creadorasConPedidos = useMemo(() => {
    const set = new Set(pedidos.map((p) => p.creator_name));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [pedidos]);
  // Chatters del filtro: los NOMBRES que figuran en los pedidos. Por id se
  // perdían los chatters que ya no tienen usuario en Maven (los históricos del
  // sheet), y eran 227 pedidos imposibles de filtrar.
  const chattersConPedidos = useMemo(() => {
    const set = new Set(pedidos.map((p) => p.chatter_name).filter(Boolean) as string[]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [pedidos]);

  // El drawer muestra siempre la versión fresca del pedido abierto.
  const abiertoFresco = abierto ? pedidos.find((p) => p.id === abierto.id) ?? abierto : null;

  // Resumen arriba: cuánto hay en juego y cuánto está pendiente de la creadora.
  const resumen = useMemo(() => {
    const abiertos = pedidos.filter((p) => !["entregado", "denegado", "reembolsado"].includes(p.status));
    const enJuego = abiertos.reduce((s, p) => s + (p.price_usd ?? 0), 0);
    const porAprobar = pedidos.filter((p) => p.status === "solicitado").length;
    const vencidos = abiertos.filter((p) => p.due_on && new Date(`${p.due_on}T23:59:59`) < new Date()).length;
    return { abiertos: abiertos.length, enJuego, porAprobar, vencidos };
  }, [pedidos]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 md:px-6 pt-4 md:pt-6 space-y-4">
        <PageHeader
          title="Personalizados"
          subtitle="Pedidos de contenido personalizado: de la solicitud del fan a la entrega."
          icon={<Gift className="h-5 w-5" />}
          actions={
            <div className="flex items-center gap-2">
              {puedeGestionar && (
                <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="h-4 w-4" /> Importar del sheet
                </Button>
              )}
              {puedeCrear && (
                <Button size="sm" className="rounded-full gap-1.5" onClick={() => { setEditando(null); setNuevoOpen(true); }}>
                  <Plus className="h-4 w-4" /> Nuevo pedido
                </Button>
              )}
            </div>
          }
        />

        {/* Agencia: Plus / Massive / Ambas. Cada equipo tiene su tablero. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-border/60 bg-card p-0.5" role="tablist" aria-label="Agencia">
            {([{ id: "" as const, label: "Ambas" }, ...AGENCIAS] as Array<{ id: Agency | ""; label: string; tono?: string }>).map((a) => {
              const activa = filtros.agencia === a.id;
              return (
                <button
                  key={a.id || "ambas"} type="button" role="tab" aria-selected={activa}
                  onClick={() => elegirAgencia(a.id)}
                  className={`h-8 px-4 rounded-full text-sm font-medium transition-colors ${
                    activa ? (a.tono ? `${a.tono} border` : "bg-secondary text-foreground") : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">
            {agenciaActual ? `Pedidos de ${agenciaActual.label}. Los nuevos se crean en ${agenciaActual.label}.` : "Pedidos de las dos agencias."}
          </span>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { l: "Abiertos", v: String(resumen.abiertos) },
            { l: "En juego", v: usd(resumen.enJuego) },
            { l: "Por aprobar", v: String(resumen.porAprobar), alerta: resumen.porAprobar > 0 },
            { l: "Vencidos", v: String(resumen.vencidos), alerta: resumen.vencidos > 0 },
          ].map((k) => (
            <div key={k.l} className={`rounded-2xl border px-3 py-2 ${k.alerta ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-card"}`}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</p>
              <p className="text-lg font-semibold leading-tight">{k.v}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filtros.q} onChange={(e) => patch({ q: e.target.value })} placeholder="Buscar fan, creadora, chatter, descripción…" className="pl-9 rounded-full h-9" />
          </div>
          <Select value={filtros.estado || TODOS} onValueChange={(v) => patch({ estado: (v === TODOS ? "" : v) as Estado | "" })}>
            <SelectTrigger className="w-[142px] h-9 rounded-full">{etiqueta("Estado", filtros.estado && ESTADOS.find((e) => e.id === filtros.estado)?.label)}</SelectTrigger>
            <SelectContent><SelectItem value={TODOS}>Todos los estados</SelectItem>{ESTADOS.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtros.creadora || TODOS} onValueChange={(v) => patch({ creadora: v === TODOS ? "" : v })}>
            <SelectTrigger className="w-[168px] h-9 rounded-full">{etiqueta("Creadora", filtros.creadora)}</SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={TODOS}>Todas las creadoras</SelectItem>
              {(creadorasConPedidos.length ? creadorasConPedidos : creadoras.map((c) => c.nombre)).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtros.chatter || TODOS} onValueChange={(v) => patch({ chatter: v === TODOS ? "" : v })}>
            <SelectTrigger className="w-[168px] h-9 rounded-full">{etiqueta("Chatter", filtros.chatter)}</SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={TODOS}>Todos los chatters</SelectItem>
              {chattersConPedidos.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtros.mes || TODOS} onValueChange={(v) => patch({ mes: v === TODOS ? "" : v })}>
            <SelectTrigger className="w-[152px] h-9 rounded-full">{etiqueta("Mes", filtros.mes && meses.find((m) => m.v === filtros.mes)?.l)}</SelectTrigger>
            <SelectContent><SelectItem value={TODOS}>Todos los meses</SelectItem>{meses.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
          </Select>
          {hayFiltros && (
            <Button variant="ghost" size="sm" className="rounded-full h-9 gap-1 text-muted-foreground" onClick={() => setFiltros((f) => ({ ...FILTROS_VACIOS, agencia: f.agencia }))}>
              <X className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
          <div className="ml-auto flex items-center rounded-full border border-border/60 p-0.5">
            <Button variant={vista === "tablero" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-full" onClick={() => cambiarVista("tablero")} title="Tablero por estado"><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={vista === "tabla" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-full" onClick={() => cambiarVista("tabla")} title="Tabla"><List className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : pedidos.length === 0 && !hayFiltros ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-3xl bg-primary/10 flex items-center justify-center"><Gift className="h-7 w-7 text-primary" /></div>
            <p className="font-medium">{agenciaActual ? `Todavía no hay pedidos de ${agenciaActual.label}` : "Todavía no hay pedidos"}</p>
            <p className="text-sm text-muted-foreground max-w-sm">Creá el primero con "Nuevo pedido", o traé el historial del sheet con "Importar del sheet".</p>
            <Badge variant="outline" className="rounded-full">Solicitado → Aprobado → En producción → Listo → Entregado</Badge>
          </div>
        ) : vista === "tablero" ? (
          <PedidoTablero pedidos={pedidos} onAbrir={setAbierto} />
        ) : (
          <PedidoTabla pedidos={pedidos} onAbrir={setAbierto} />
        )}
      </div>

      <PedidoFormDialog
        open={nuevoOpen || !!editando}
        onOpenChange={(v) => { if (!v) { setNuevoOpen(false); setEditando(null); } }}
        pedido={editando}
        agenciaPorDefecto={filtros.agencia || "plus"}
        onCreado={(p) => setAbierto(p)}
      />
      <PedidoDrawer pedido={abiertoFresco} onClose={() => setAbierto(null)} onEditar={(p) => setEditando(p)} />
      <ImportarSheetDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
