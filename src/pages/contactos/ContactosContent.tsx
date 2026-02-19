import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ContactosKPICards from "./ContactosKPICards";
import ContactosFilters, { type ContactoFilters } from "./ContactosFilters";
import ContactosTable from "./ContactosTable";
import ContactosGrid from "./ContactosGrid";
import ViewContactoModal from "./ViewContactoModal";
import EditContactoModal from "./EditContactoModal";
import DeleteContactoDialog from "./DeleteContactoDialog";
import AgenciasContent from "./AgenciasContent";
import AddAgenciaModal from "./AddAgenciaModal";

export interface Contacto {
  id: string;
  creacion: string;
  ticket: string;
  nombre: string;
  estado: string;
  instagram: string;
  pais: string;
  categoria: string;
  whatsapp: string;
  interacciones: number;
  creadoPor: string;
}

const emptyFilters: ContactoFilters = {
  search: "",
  estado: "",
  pais: "",
  categoria: "",
  fechaCreacion: "",
};

const ContactosContent = () => {
  const [activeTab, setActiveTab] = useState<"contactos" | "agencias">("contactos");
  const [filters, setFilters] = useState<ContactoFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const [selectedContacto, setSelectedContacto] = useState<Contacto | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addAgenciaOpen, setAddAgenciaOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: dbContactos = [], isLoading } = useQuery({
    queryKey: ["contactos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contactos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const allContactos: Contacto[] = useMemo(() =>
    dbContactos.map((c, i) => ({
      id: c.id,
      creacion: new Date(c.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      ticket: c.ticket || `CT${String(i + 1).padStart(6, "0")}`,
      nombre: c.nombre,
      estado: c.estado || "Nuevo",
      instagram: c.instagram,
      pais: c.pais || "",
      categoria: c.categoria_fisica || "",
      whatsapp: c.telefono ? `${c.country_code || ""}${c.telefono}` : "",
      interacciones: 0,
      creadoPor: "",
    })),
  [dbContactos]);

  const handleView = (c: Contacto) => { setSelectedContacto(c); setViewOpen(true); };
  const handleEdit = (c: Contacto) => { setSelectedContacto(c); setEditOpen(true); };
  const handleConvert = (c: Contacto) => {
    toast({ title: "Próximamente", description: `La conversión de "${c.nombre}" a creador estará disponible pronto.` });
  };

  const updateFilters = (patch: Partial<ContactoFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const filtered = useMemo(() => {
    return allContactos.filter((c) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !c.nombre.toLowerCase().includes(q) &&
          !c.ticket.toLowerCase().includes(q) &&
          !c.instagram.toLowerCase().includes(q)
        ) return false;
      }
      if (filters.estado && c.estado !== filters.estado) return false;
      if (filters.pais && c.pais !== filters.pais) return false;
      if (filters.categoria && c.categoria !== filters.categoria) return false;
      return true;
    });
  }, [filters, allContactos]);

  const totalContactos = allContactos.length;
  const nuevos = allContactos.filter((c) => c.estado === "Nuevo").length;
  const convertidos = allContactos.filter((c) => c.estado === "Convertido").length;
  const esteMes = allContactos.length;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Directorio de Contactos</h1>
            <p className="text-sm text-muted-foreground">
              Total: {totalContactos} contactos
            </p>
          </div>
          {activeTab === "contactos" ? (
            <Button onClick={() => navigate("/contactos/nuevo")}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Contacto
            </Button>
          ) : (
            <Button onClick={() => setAddAgenciaOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Agencia
            </Button>
          )}
        </div>

        <div className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          <Button
            variant={activeTab === "contactos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("contactos")}
          >
            <Users className="mr-1.5 h-4 w-4" />
            Contactos
          </Button>
          <Button
            variant={activeTab === "agencias" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("agencias")}
          >
            <Building2 className="mr-1.5 h-4 w-4" />
            Agencias
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {activeTab === "contactos" ? (
          <>
            <ContactosKPICards
              total={totalContactos}
              nuevos={nuevos}
              convertidos={convertidos}
              esteMes={esteMes}
            />

            <ContactosFilters
              filters={filters}
              onChange={updateFilters}
              view={view}
              onViewChange={setView}
              hasActiveFilters={!!(filters.search || filters.estado || filters.pais || filters.categoria || filters.fechaCreacion)}
              onClear={() => setFilters(emptyFilters)}
            />

            {view === "table" ? (
              <ContactosTable contactos={filtered} onView={handleView} onEdit={handleEdit} onConvert={handleConvert} />
            ) : (
              <ContactosGrid contactos={filtered} onView={handleView} onEdit={handleEdit} onConvert={handleConvert} />
            )}
          </>
        ) : (
          <AgenciasContent />
        )}
      </div>

      <ViewContactoModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        contacto={selectedContacto}
        onEdit={() => { setViewOpen(false); setEditOpen(true); }}
        onDelete={() => { setViewOpen(false); setDeleteOpen(true); }}
      />
      <EditContactoModal open={editOpen} onOpenChange={setEditOpen} contacto={selectedContacto} />
      <DeleteContactoDialog open={deleteOpen} onOpenChange={setDeleteOpen} contacto={selectedContacto} />
      <AddAgenciaModal open={addAgenciaOpen} onOpenChange={setAddAgenciaOpen} />
    </main>
  );
};

export default ContactosContent;
