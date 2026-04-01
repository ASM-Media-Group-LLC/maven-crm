import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Building2, BarChart3, ShieldAlert, ChevronDown, DollarSign, TrendingUp } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import ContactosKPICards from "./ContactosKPICards";
import ContactosFilters, { type ContactoFilters } from "./ContactosFilters";
import ContactosTable from "./ContactosTable";
import ContactosGrid from "./ContactosGrid";
import ContactosAnalyticsModal from "./ContactosAnalyticsModal";

import ViewContactoModal from "./ViewContactoModal";
import EditContactoModal from "./EditContactoModal";
import DeleteContactoDialog from "./DeleteContactoDialog";
import ConvertContactoModal from "./ConvertContactoModal";
import AgenciasContent from "./AgenciasContent";
import AddAgenciaModal from "./AddAgenciaModal";
import DataTableShell from "@/components/ui/data-table-shell";

export interface Contacto {
  id: string;
  creacion: string;
  rawCreatedAt: string;
  ticket: string;
  nombre: string;
  estado: string;
  instagram: string;
  platform: string;
  pais: string;
  city: string;
  categoria: string;
  whatsapp: string;
  interacciones: number;
  creadoPor: string;
  email: string;
  phone: string;
  country_code: string;
  company: string;
  notes: string;
  source: string;
  profile_picture_url: string;
  assigned_to: string;
  onlyfans_url: string;
}

const statusMap: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  not_interested: "Descartado",
};

const emptyFilters: ContactoFilters = {
  search: "",
  estado: "",
  pais: "",
  ciudad: "",
  categoria: "",
  dateFrom: "",
  dateTo: "",
  creadoPor: "",
};

const PAGE_SIZE = 50;

const normalizeHandleKey = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/^@+/, "").toLowerCase();

const ContactosContent = () => {
  const [activeTab, setActiveTab] = useState<"contactos" | "agencias">("contactos");
  const [filters, setFilters] = useState<ContactoFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("grid");
  const [selectedContacto, setSelectedContacto] = useState<Contacto | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertRawContacto, setConvertRawContacto] = useState<any>(null);
  const [addAgenciaOpen, setAddAgenciaOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState("monthly");
  const [auditOpen, setAuditOpen] = useState(false);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filters]);

  // Server-side paginated query
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["closers_contacts", page, filters],
    queryFn: async () => {
      let q = supabase
        .from("closers_contacts")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      // Server-side filters
      if (filters.search) {
        q = q.or(`name.ilike.%${filters.search}%,handle.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%`);
      }
      if (filters.estado) {
        // Map display status back to DB status
        const reverseMap: Record<string, string> = { Nuevo: "new", Contactado: "contacted", Interesado: "interested", Descartado: "not_interested", Convertido: "converted" };
        const dbStatus = reverseMap[filters.estado] || filters.estado;
        q = q.eq("status", dbStatus);
      }
      if (filters.pais) q = q.eq("country_code", filters.pais);
      if (filters.categoria) q = q.eq("physical_appearance", filters.categoria);
      if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        q = q.lte("created_at", endOfDay.toISOString());
      }

      const from = (page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], total: count ?? 0 };
    },
  });

  const dbContactos = queryResult?.data ?? [];
  const totalCount = queryResult?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Resolve created_by UUIDs to profile names
  const creatorIds = useMemo(() => {
    const ids = new Set<string>();
    dbContactos.forEach((c) => { if (c.created_by) ids.add(c.created_by); });
    return Array.from(ids);
  }, [dbContactos]);

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles_for_contacts", creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_agent_names", { _user_ids: creatorIds });
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || ""; });
      return map;
    },
  });

  // Fallback city from creators table by matching instagram handle
  const handlesForCity = useMemo(() => {
    const set = new Set<string>();
    dbContactos.forEach((c) => {
      const normalized = normalizeHandleKey(c.handle);
      if (!normalized) return;
      set.add(normalized);
      set.add(`@${normalized}`);
    });
    return Array.from(set);
  }, [dbContactos]);

  const { data: creatorsCityMap = {} } = useQuery({
    queryKey: ["creator_city_by_handle", handlesForCity],
    enabled: handlesForCity.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("instagram_handle, city")
        .in("instagram_handle", handlesForCity);
      if (error) throw error;

      const map: Record<string, string> = {};
      (data ?? []).forEach((row) => {
        const key = normalizeHandleKey(row.instagram_handle);
        const city = row.city?.trim();
        if (key && city) map[key] = city;
      });
      return map;
    },
  });

  const creatorsList = useMemo(() => {
    const map = new Map<string, string>();
    creatorIds.forEach((id) => {
      const name = profilesMap[id];
      map.set(id, name || "Agente");
    });
    const entries = Array.from(map.entries())
      .map(([, label]) => ({ value: label, label }));
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  }, [creatorIds, profilesMap]);

  // Fetch interaction counts for current page contacts
  const contactIds = useMemo(() => dbContactos.map(c => c.id), [dbContactos]);
  const { data: interactionCounts = {} } = useQuery({
    queryKey: ["contact_interaction_counts", contactIds],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_interactions")
        .select("contact_id")
        .in("contact_id", contactIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        counts[r.contact_id] = (counts[r.contact_id] || 0) + 1;
      });
      return counts;
    },
  });

  const allContactos: Contacto[] = useMemo(() =>
    dbContactos.map((c) => {
      const normalizedHandle = normalizeHandleKey(c.handle);
      const fallbackCity = creatorsCityMap[normalizedHandle] || "";
      const resolvedCity = (c.city || "").trim() || fallbackCity || "No aplicable";

      return {
        id: c.id,
        rawCreatedAt: c.created_at || "",
        creacion: new Date(c.created_at || "").toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        ticket: c.ticket_number || "",
        nombre: c.name,
        estado: statusMap[c.status || ""] || c.status || "Nuevo",
        instagram: c.handle || "",
        platform: c.platform || "Instagram",
        pais: c.country_code || "",
        city: resolvedCity,
        categoria: c.physical_appearance || "",
        whatsapp: c.phone ? `${c.country_code || ""}${c.phone}` : "",
        interacciones: interactionCounts[c.id] || 0,
        creadoPor: (c.created_by && profilesMap[c.created_by]) || "",
        email: c.email || "",
        phone: c.phone || "",
        country_code: c.country_code || "",
        company: c.company || "",
        notes: c.notes || "",
        source: c.source || "",
        profile_picture_url: c.profile_picture_url || "",
        assigned_to: c.assigned_to || "",
        onlyfans_url: (c as any).onlyfans_url || "",
      };
    }),
  [dbContactos, interactionCounts, profilesMap, creatorsCityMap]);

  // Client-side filters for resolved fields
  const filtered = useMemo(() => {
    let list = allContactos;
    if (filters.creadoPor) list = list.filter((c) => c.creadoPor === filters.creadoPor);
    if (filters.ciudad) list = list.filter((c) => c.city === filters.ciudad);
    return list;
  }, [filters.creadoPor, filters.ciudad, allContactos]);

  const handleView = (c: Contacto) => { setSelectedContacto(c); setViewOpen(true); };
  const handleEdit = (c: Contacto) => { setSelectedContacto(c); setEditOpen(true); };
  const handleConvert = (c: Contacto) => {
    const raw = dbContactos.find((db) => db.id === c.id);
    if (raw) {
      setSelectedContacto(c);
      setConvertRawContacto(raw);
      setConvertOpen(true);
    }
  };

  const updateFilters = (patch: Partial<ContactoFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  // Derive unique cities for filter
  const citiesList = useMemo(() => {
    const set = new Set<string>();
    allContactos.forEach((c) => set.add(c.city || "No aplicable"));
    return Array.from(set).sort((a, b) => {
      if (a === "No aplicable") return -1;
      if (b === "No aplicable") return 1;
      return a.localeCompare(b);
    });
  }, [allContactos]);

  const hasActiveFilters = !!(filters.search || filters.pais || filters.ciudad || filters.categoria || filters.dateFrom || filters.dateTo || filters.creadoPor);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Directorio de Contactos</h1>
            <p className="text-sm text-muted-foreground">
              Total: {totalCount} contactos
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "contactos" && isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Analítica
                      <ChevronDown className="ml-2 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => { setAnalyticsTab("monthly"); setAnalyticsOpen(true); }}>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Dashboard General
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAnalyticsTab("revenue"); setAnalyticsOpen(true); }}>
                      <DollarSign className="mr-2 h-4 w-4" />
                      Revenue
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAnalyticsTab("audit"); setAnalyticsOpen(true); }} className="text-amber-500">
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Auditoría
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
            )}
            {activeTab === "contactos" ? (
              <Button onClick={() => navigate("/contactos/nuevo")}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Contacto
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setAddAgenciaOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Agencia
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
        <div className="shrink-0">
          <ContactosKPICards
            total={totalCount}
            nuevos={0}
            convertidos={0}
            esteMes={0}
          />
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 shrink-0">
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

        {activeTab === "contactos" ? (
          <>
            <div className="shrink-0">
              <ContactosFilters
              filters={filters}
              onChange={updateFilters}
              view={view}
              onViewChange={setView}
              hasActiveFilters={hasActiveFilters}
              onClear={() => setFilters(emptyFilters)}
              creators={creatorsList}
              cities={citiesList}
            />
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Cargando...</p>
              </div>
            ) : view === "table" ? (
              <DataTableShell
                className="flex-1 min-h-0"
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={50}
                onPageChange={setPage}
              >
                <ContactosTable contactos={filtered} onView={handleView} onEdit={handleEdit} onConvert={handleConvert} onDelete={isAdmin ? (c) => { setSelectedContacto(c); setDeleteOpen(true); } : undefined} />
              </DataTableShell>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <ContactosGrid contactos={filtered} onView={handleView} onEdit={handleEdit} onConvert={handleConvert} />
              </div>
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
      <ConvertContactoModal
        open={convertOpen}
        onOpenChange={setConvertOpen}
        contacto={convertRawContacto}
        onConverted={() => setConvertOpen(false)}
      />
      <ContactosAnalyticsModal open={analyticsOpen} onOpenChange={setAnalyticsOpen} defaultTab={analyticsTab} />
    </main>
  );
};

export default ContactosContent;
