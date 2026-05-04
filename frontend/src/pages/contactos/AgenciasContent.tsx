import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, List, LayoutGrid, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import AgenciasKPICards from "./AgenciasKPICards";
import AgenciasTable from "./AgenciasTable";
import AgenciasGrid from "./AgenciasGrid";
import ViewAgenciaModal from "./ViewAgenciaModal";
import EditAgenciaModal from "./EditAgenciaModal";
import DeleteAgenciaDialog from "./DeleteAgenciaDialog";
import { type Agencia, AGENCIA_ESTADOS } from "./agenciasUtils";

const AgenciasContent = () => {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<Agencia | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: dbAgencias = [] } = useQuery({
    queryKey: ["agencies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Map agencies table fields to Agencia interface
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

  return (
    <div className="space-y-6">
      <AgenciasKPICards total={total} discovery={discovery} enProceso={enProceso} completadas={completadas} />

      <div className="flex items-center gap-3">
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

        <div className="ml-auto flex gap-1">
          <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" onClick={() => setView("table")}>
            <List className="h-4 w-4" />
          </Button>
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setView("grid")}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "table" ? (
        <AgenciasTable agencias={filtered} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
      ) : (
        <AgenciasGrid agencias={filtered} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      <ViewAgenciaModal open={viewOpen} onOpenChange={setViewOpen} agencia={selected} onEdit={() => { setViewOpen(false); setEditOpen(true); }} onDelete={() => { setViewOpen(false); setDeleteOpen(true); }} />
      <EditAgenciaModal open={editOpen} onOpenChange={setEditOpen} agencia={selected} />
      <DeleteAgenciaDialog open={deleteOpen} onOpenChange={setDeleteOpen} agencia={selected} />
    </div>
  );
};

export default AgenciasContent;
