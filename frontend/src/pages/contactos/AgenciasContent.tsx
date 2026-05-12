import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, X, LayoutDashboard, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import AgenciasKPICards from "./AgenciasKPICards";
import AgenciasCardList from "./AgenciasCardList";
import ViewAgenciaModal from "./ViewAgenciaModal";
import EditAgenciaModal from "./EditAgenciaModal";
import DeleteAgenciaDialog from "./DeleteAgenciaDialog";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { type Agencia, AGENCIA_ESTADOS } from "./agenciasUtils";

const AgenciasContent = () => {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [selected, setSelected] = useState<Agencia | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Subtabs internos: Dashboard (KPI cards) vs Agencias (lista)
  const [viewTab, setViewTab] = useState<"dashboard" | "agencias">("dashboard");
  type KpiKey = "total" | "discovery" | "enProceso" | "completadas";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const { data: dbAgencias = [] } = useQuery({
    queryKey: ["agencies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a): Agencia => ({
        id: a.id,
        nombre: a.name,
        estado: a.status || "Discovery",
        pais: a.country_code || "",
        contacto_nombre: a.contact_name || "",
        contacto_email: a.email || "",
        contacto_telefono: a.phone || "",
        instagram: "",
        website: a.website || "",
        notas: a.notes || "",
        created_at: a.created_at || "",
      }));
    },
  });

  const filtered = useMemo(() => {
    return dbAgencias.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        if (!a.nombre.toLowerCase().includes(q) && !(a.instagram ?? "").toLowerCase().includes(q)) return false;
      }
      if (estadoFilter && a.estado !== estadoFilter) return false;
      return true;
    });
  }, [dbAgencias, search, estadoFilter]);

  const total = dbAgencias.length;
  const discovery = dbAgencias.filter((a) => a.estado === "Discovery").length;
  const enProceso = dbAgencias.filter((a) => a.estado === "En Proceso").length;
  const completadas = dbAgencias.filter((a) => a.estado === "Completada").length;

  const hasFilters = !!(search || estadoFilter);

  const handleView = (a: Agencia) => { setSelected(a); setViewOpen(true); };
  const handleEdit = (a: Agencia) => { setSelected(a); setEditOpen(true); };
  const handleDelete = (a: Agencia) => { setSelected(a); setDeleteOpen(true); };

  // Lista de filas para el popup según el KPI clickeado.
  const popupAgencias = useMemo(() => {
    if (!kpiPopup) return [];
    if (kpiPopup === "total") return dbAgencias;
    if (kpiPopup === "discovery") return dbAgencias.filter(a => a.estado === "Discovery");
    if (kpiPopup === "enProceso") return dbAgencias.filter(a => a.estado === "En Proceso");
    return dbAgencias.filter(a => a.estado === "Completada");
  }, [kpiPopup, dbAgencias]);

  return (
    <div className="space-y-4">
      {/* Subtabs Dashboard | Agencias — mismo patrón que Contactos / Closers */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        <Button
          variant={viewTab === "dashboard" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setViewTab("dashboard")}
        >
          <LayoutDashboard className="mr-1.5 h-4 w-4" />
          Dashboard
        </Button>
        <Button
          variant={viewTab === "agencias" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setViewTab("agencias")}
        >
          <Building2 className="mr-1.5 h-4 w-4" />
          Agencias
        </Button>
      </div>

      {viewTab === "dashboard" && (
        <AgenciasKPICards
          total={total}
          discovery={discovery}
          enProceso={enProceso}
          completadas={completadas}
          onClick={(key) => setKpiPopup(key)}
        />
      )}

      {viewTab === "agencias" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nombre, handle..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={estadoFilter || undefined} onValueChange={(v) => setEstadoFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {AGENCIA_ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setEstadoFilter(""); }}>
                <X className="mr-1.5 h-4 w-4" /> Limpiar filtros
              </Button>
            )}
          </div>

          <AgenciasCardList agencias={filtered} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
        </>
      )}

      <ViewAgenciaModal open={viewOpen} onOpenChange={setViewOpen} agencia={selected} onEdit={() => { setViewOpen(false); setEditOpen(true); }} onDelete={() => { setViewOpen(false); setDeleteOpen(true); }} />
      <EditAgenciaModal open={editOpen} onOpenChange={setEditOpen} agencia={selected} />
      <DeleteAgenciaDialog open={deleteOpen} onOpenChange={setDeleteOpen} agencia={selected} />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Agencias — ${total}`;
            case "discovery": return `Discovery — ${discovery}`;
            case "enProceso": return `En Proceso — ${enProceso}`;
            case "completadas": return `Completadas — ${completadas}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "total": return "Todas las agencias registradas";
            case "discovery": return "En fase exploratoria";
            case "enProceso": return "Negociación activa";
            case "completadas": return "Acuerdos finalizados";
            default: return undefined;
          }
        })()}
        rows={popupAgencias.map((a): KpiRow => {
          const tone: KpiRow["rightTone"] =
            a.estado === "Completada" ? "success" :
            a.estado === "En Proceso" ? "warning" :
            "default";
          return {
            primary: a.nombre,
            secondary: a.contacto_nombre ? `${a.contacto_nombre}${a.pais ? ` · ${a.pais}` : ""}` : a.pais || undefined,
            right: a.estado,
            rightTone: tone,
          };
        })}
      />
    </div>
  );
};

export default AgenciasContent;
