import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Users, BarChart3, ShieldAlert, ChevronDown, DollarSign, TrendingUp, LayoutDashboard, ArrowRight } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { getCountryFlag, getCountryShortDisplay, dialForIso } from "@/lib/country-utils";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import CategorySectionHeader from "@/components/dashboard/CategorySectionHeader";
import { ListRowButton } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import ContactosFilters, { type ContactoFilters } from "./ContactosFilters";
import ContactosCardList from "./ContactosCardList";

import { SALES_CHANNEL_NONE, SALES_CHANNEL_MULTI } from "./ContactosFilters";
import { useContactSalesChannels } from "./useContactSalesChannels";
import { useContactStatuses } from "./useContactStatuses";
import { useContactFunnelStats } from "./useContactFunnelStats";
import ContactoDetailDialog from "./ContactoDetailDialog";
import EditContactoModal from "./EditContactoModal";
import DeleteContactoDialog from "./DeleteContactoDialog";
import ConvertContactoModal from "./ConvertContactoModal";
import SellPlatformContactDialog from "./SellPlatformContactDialog";
import CategoryAuditLog from "./CategoryAuditLog";
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
  /** 'modelo' (default) | 'agencia' — un lead B2B. Al asignarlo a un closer entra
   *  al pipeline como venta de plataforma y aparece en el tab Agencias. */
  contactKind: string;
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
  salesChannels: [],
  contactKind: "",
};

const PAGE_SIZE = 50;

const normalizeHandleKey = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/^@+/, "").toLowerCase();

// Persistimos tab + filtros + página en sessionStorage para que al ir a WhatsApp
// (o a cualquier lado) y VOLVER, el directorio quede exactamente como estaba.
const VIEWSTATE_KEY = "contactos.viewstate";
const loadViewState = (): { filters?: ContactoFilters; page?: number } => {
  try { return JSON.parse(sessionStorage.getItem(VIEWSTATE_KEY) || "{}") || {}; } catch { return {}; }
};

const ContactosContent = () => {
  const restored = loadViewState();
  const [filters, setFilters] = useState<ContactoFilters>(restored.filters ?? emptyFilters);
  const [selectedContacto, setSelectedContacto] = useState<Contacto | null>(null);
  // Estado del collapsed por categoría — mismo patrón que panel/
  // dashboard v2: default top expandida, resto colapsadas.
  // null = sin tocar (aplica default: solo la 1ª categoría abierta). Un Set (aunque
  // vacío) = el usuario ya interactuó → respetar su elección. OJO: usar "size===0"
  // como sentinel rompía expandir la última categoría colapsada (al vaciarse el set
  // volvía al default y la re-colapsaba).
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertRawContacto, setConvertRawContacto] = useState<any>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellContacto, setSellContacto] = useState<Contacto | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [page, setPage] = useState(restored.page ?? 1);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isManager } = useUserRole();
  const { canAccess, permissions } = usePermissions();
  // Teléfono visible: admin, o rol con el permiso EXPLÍCITO Contactos/Ver
  // Teléfonos (mismo criterio default-deny que can_see_contact_phone() en la
  // BD y que ContactoDetailDialog). Gobierna si el buscador también busca por
  // número: para quien no puede ver teléfonos, el buscador ni lo intenta — la
  // vista además se lo daría enmascarado, así que tampoco filtraría nada útil.
  const canSeePhone =
    isAdmin ||
    permissions.some(
      (p) => p.module === "Contactos" && p.submodule === "Ver Teléfonos" && p.can_access,
    );
  // "Vender plataforma" (mismo gate que el carrito de Creadoras): manda el
  // contacto al pipeline de closers como deal de venta.
  const canSellPlatform = canAccess("Closers", "Asignar Closer");
  // Canales de venta: visibles para TODOS los que pueden abrir Contactos (la ruta ya
  // gatea por permiso). Antes era solo admin/manager; ahora todo el equipo ve si una
  // creadora ya fue contactada y por qué línea. El RPC expone label de canal, no PII.
  const canSeeChannels = true;

  // Guardar el estado de la vista para restaurarlo al volver (p.ej. desde WhatsApp).
  useEffect(() => {
    sessionStorage.setItem(VIEWSTATE_KEY, JSON.stringify({ filters, page }));
  }, [filters, page]);

  // Deep-link desde el ⌘K: /contactos?q=<handle|nombre> abre el directorio con
  // la búsqueda precargada (pisa filtros restaurados) y limpia el parámetro.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q === null) return;
    setFilters({ ...emptyFilters, search: q });
    setPage(1);
    searchParams.delete("q");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Canales de venta por contacto (server-side vía RPC; react-query dedupea).
  const salesChannels = useContactSalesChannels(canSeeChannels);
  // Estado de cada contacto (creadora activa / ex-creadora / en proceso) para el color de fila.
  const contactStatuses = useContactStatuses();
  // Backbone del dashboard: embudo + churn server-side, acotado por el calendario global.
  const { stats: funnelStats } = useContactFunnelStats(filters.dateFrom, filters.dateTo);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filters]);

  // Constraint de canal de venta → set de closers_contacts.id (o "sin contactar").
  // Se computa desde el hook (admin-only). Reglas:
  //  - canales específicos seleccionados → unión de sus contact-ids (.in)
  //  - "2+ canales" → ids con ≥2 canales (.in, OR-union con lo anterior)
  //  - "sin contactar" → excluir todos los allContactedIds (.not in)
  // Devuelve { mode, ids } para que el queryKey/queryFn sea estable y refetchee
  // cuando la data del hook llegue.
  const salesChannelConstraint = useMemo(() => {
    const selected = filters.salesChannels ?? [];
    if (!canSeeChannels || selected.length === 0) {
      return { mode: "none" as const, ids: [] as string[] };
    }
    const wantsNone = selected.includes(SALES_CHANNEL_NONE);
    const wantsMulti = selected.includes(SALES_CHANNEL_MULTI);
    const specificIds = selected.filter(
      (s) => s !== SALES_CHANNEL_NONE && s !== SALES_CHANNEL_MULTI,
    );

    // Caso solo "sin contactar" (sin canales específicos ni 2+): EXCLUIR contactados.
    if (wantsNone && specificIds.length === 0 && !wantsMulti) {
      return { mode: "exclude" as const, ids: salesChannels.allContactedIds };
    }

    // Resto: unión (OR) de ids → .in. (Si además se marcó "sin contactar",
    // lo combinamos de forma simple ignorándolo en favor del include — OR-union.)
    const union = new Set<string>();
    if (specificIds.length > 0) {
      salesChannels.contactIdsForChannels(specificIds).forEach((id) => union.add(id));
    }
    if (wantsMulti) {
      for (const [contactId, list] of salesChannels.byContactId.entries()) {
        if (list.length >= 2) union.add(contactId);
      }
    }
    return { mode: "include" as const, ids: Array.from(union) };
  }, [filters.salesChannels, canSeeChannels, salesChannels]);

  // Opciones de filtro a nivel DATASET COMPLETO (no solo la página). Antes Ciudad/Agente se
  // derivaban de los ~25 contactos visibles y se filtraban client-side → solo afectaban la página.
  const { data: cityOptions = [] } = useQuery({
    queryKey: ["contact_filter_cities"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_filter_cities");
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
  const { data: agentOptions = [] } = useQuery({
    queryKey: ["contact_filter_agents"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_filter_agents");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  // El filtro Agente guarda el NOMBRE; el query necesita el created_by (uuid) → mapa nombre→uuid.
  const nameToUserId = useMemo(() => {
    const m = new Map<string, string>();
    agentOptions.forEach((a) => { if (a.name) m.set(a.name, a.id); });
    return m;
  }, [agentOptions]);
  const creadoPorUserId = filters.creadoPor ? (nameToUserId.get(filters.creadoPor) ?? null) : null;

  // Ciudad: closers_contacts.city está vacío → la ciudad sale de creators (por handle). El RPC
  // devuelve los ids de contacto cuya creadora está en esa ciudad; el query filtra con .in("id").
  const { data: cityContactIds } = useQuery({
    queryKey: ["contact_ids_by_city", filters.ciudad],
    enabled: !!filters.ciudad,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_ids_by_city", { p_city: filters.ciudad });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });

  // Server-side paginated query
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["closers_contacts", page, filters, salesChannelConstraint, creadoPorUserId, cityContactIds, canSeePhone],
    queryFn: async () => {
      let q = supabase
        // Vista enmascarada: phone/email solo vienen reales para admin; el resto NULL.
        // (closers_contacts.phone/email están revocados para no-admin.)
        .from("v_closers_contacts")
        // count:"exact" a propósito: este total es el de la paginación
        // (se pinta como "Mostrando X–Y de N"). Un estimado movería las páginas.
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      // Server-side filters
      if (filters.search) {
        const term = filters.search;
        const clauses = [`name.ilike.%${term}%`, `handle.ilike.%${term}%`, `ticket_number.ilike.%${term}%`];
        // Buscar por TELÉFONO, solo con permiso de verlos. Se compara por los
        // dígitos que tipeó la persona (sin +, espacios ni guiones): los números
        // se guardan casi siempre como dígitos pegados, y con 4+ dígitos ya
        // vale la pena probar (menos es cualquier ticket o año).
        const digits = term.replace(/\D/g, "");
        if (canSeePhone && digits.length >= 4) clauses.push(`phone.ilike.%${digits}%`);
        q = q.or(clauses.join(","));
      }
      if (filters.estado) {
        // Map display status back to DB status
        const reverseMap: Record<string, string> = { Nuevo: "new", Contactado: "contacted", Interesado: "interested", Descartado: "not_interested", Convertido: "converted" };
        const dbStatus = reverseMap[filters.estado] || filters.estado;
        q = q.eq("status", dbStatus);
      }
      // El filtro ofrece ISO ("CO") pero la columna guarda el dial code ("+57") → mapear.
      if (filters.pais) q = q.eq("country_code", dialForIso(filters.pais) ?? filters.pais);
      if (filters.categoria) q = q.eq("physical_appearance", filters.categoria);
      // Tipo de contacto (modelo/agencia): server-side para que la paginación y
      // el total sean correctos, igual que los demás filtros.
      if (filters.contactKind) q = q.eq("contact_kind", filters.contactKind);
      // Agente y Ciudad: server-side (antes client-side sobre la página → solo filtraban lo visible).
      if (creadoPorUserId) q = q.eq("created_by", creadoPorUserId);
      // Ciudad: filtrar por los ids que devolvió el RPC (creadora-por-handle en esa ciudad).
      // Si todavía no cargaron los ids (o no hay ninguno) → sentinel que devuelve 0.
      if (filters.ciudad) q = q.in("id", (cityContactIds && cityContactIds.length) ? cityContactIds : ["__none__"]);
      // filters.dateFrom/dateTo son strings solo-fecha ("yyyy-MM-dd"). Hay que
      // acotar por el DÍA LOCAL del usuario contra created_at (timestamptz UTC).
      // OJO: `new Date("yyyy-MM-dd")` parsea como medianoche UTC; al hacer
      // setHours(23,59,59) en hora local el tope quedaba corrido por el offset de
      // TZ (en GMT-5 → ~05:00 UTC del mismo día) → un rango de un solo día ("Hoy"/
      // "Ayer") excluía los contactos de la tarde y daba 0. Fix: parsear con hora
      // explícita SIN "Z" → se interpreta en la TZ local del browser.
      if (filters.dateFrom) {
        const startOfDay = new Date(`${filters.dateFrom}T00:00:00`);
        q = q.gte("created_at", startOfDay.toISOString());
      }
      if (filters.dateTo) {
        const endOfDay = new Date(`${filters.dateTo}T23:59:59.999`);
        q = q.lte("created_at", endOfDay.toISOString());
      }

      // Canal de venta (admin-only). El set de ids se computa fuera (salesChannelConstraint).
      if (salesChannelConstraint.mode === "include") {
        // Si no hay ids → sentinel que no matchea nada (devuelve 0 filas).
        const ids = salesChannelConstraint.ids;
        q = q.in("id", ids.length ? ids : ["__none__"]);
      } else if (salesChannelConstraint.mode === "exclude") {
        // "Sin contactar por WhatsApp" → excluir todos los contactados.
        // OJO con la sintaxis de PostgREST `not in`: lista entre paréntesis.
        // Si la lista está vacía, no aplicamos constraint (todos califican).
        const ids = salesChannelConstraint.ids;
        if (ids.length) {
          q = q.not("id", "in", `(${ids.join(",")})`);
        }
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

  const creatorsList = useMemo(
    () => agentOptions.map((a) => ({ value: a.name, label: a.name })),
    [agentOptions]
  );

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
        creacion: c.created_at
          ? new Date(c.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "—",
        ticket: c.ticket_number || "",
        nombre: c.name,
        estado: statusMap[c.status || ""] || c.status || "Nuevo",
        instagram: c.handle || "",
        platform: c.platform || "Instagram",
        pais: c.country_code || "",
        city: resolvedCity,
        categoria: c.physical_appearance || "",
        // 'modelo' (default) | 'agencia' (B2B). Lo expone v_closers_contacts.
        contactKind: (c as any).contact_kind || "modelo",
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
  // Ciudad y Agente ahora se filtran SERVER-SIDE (en el query) → `filtered` = la página ya filtrada.
  const filtered = allContactos;

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

  // Opciones de ciudad del DATASET completo (RPC contact_filter_cities), no solo la página.
  const citiesList = cityOptions;

  const hasActiveFilters = !!(filters.search || filters.pais || filters.ciudad || filters.categoria || filters.dateFrom || filters.dateTo || filters.creadoPor || filters.contactKind || (filters.salesChannels && filters.salesChannels.length > 0));

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title="Directorio de Contactos"
          subtitle={
            <>
              {funnelStats.pipelineVivo.toLocaleString("es")} en pipeline vivo
              <span className="text-muted-foreground/60"> · {totalCount.toLocaleString("es")} en el directorio</span>
            </>
          }
          actions={
            <>
              {/* Auditoría vivía dentro del Dashboard, que se eliminó: sin este botón
                  el log de cambios de categoría se quedaba sin ninguna puerta. */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-warning hover:text-warning"
                  onClick={() => setAuditOpen(true)}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Auditoría
                </Button>
              )}
              {/* El "calendario de movimiento" (rango de fechas) acota el listado. */}
              <DateRangePicker
                from={filters.dateFrom ? parseISO(filters.dateFrom) : undefined}
                to={filters.dateTo ? parseISO(filters.dateTo) : undefined}
                onApply={(from, to) =>
                  updateFilters({
                    dateFrom: from ? format(from, "yyyy-MM-dd") : "",
                    dateTo: to ? format(to, "yyyy-MM-dd") : "",
                  })
                }
                placeholder="Fecha creación"
                className="w-auto"
              />
              {/* Global en el header, como el calendario: visible en todos los subtabs. */}
              <Button onClick={() => navigate("/contactos/nuevo")}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Contacto
              </Button>
            </>
          }
        />
      </header>

      <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
          <>
            <div className="shrink-0">
              <ContactosFilters
                filters={filters}
                onChange={updateFilters}
                hasActiveFilters={hasActiveFilters}
                onClear={() => setFilters(emptyFilters)}
                creators={creatorsList}
                cities={citiesList}
                salesChannelOptions={canSeeChannels ? salesChannels.channels : []}
                canSearchPhone={canSeePhone}
              />
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Cargando...</p>
              </div>
            ) : (
              <DataTableShell
                className="flex-1 min-h-0"
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={50}
                onPageChange={setPage}
              >
                <ContactosCardList
                  contactos={filtered}
                  onView={handleView}
                  onEdit={handleEdit}
                  onConvert={handleConvert}
                  onSellPlatform={canSellPlatform ? (c) => { setSellContacto(c); setSellOpen(true); } : undefined}
                  onDelete={isAdmin ? (c) => { setSelectedContacto(c); setDeleteOpen(true); } : undefined}
                  channelsByContact={canSeeChannels ? salesChannels.byContactId : undefined}
                  statuses={contactStatuses}
                />
              </DataTableShell>
            )}
          </>
      </div>

      <ContactoDetailDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        contacto={selectedContacto}
        onEdit={() => { setViewOpen(false); setEditOpen(true); }}
        onConvert={selectedContacto ? () => { setViewOpen(false); handleConvert(selectedContacto); } : undefined}
        onDelete={() => { setViewOpen(false); setDeleteOpen(true); }}
        canDelete={isAdmin}
        showSalesChannels={canSeeChannels}
        salesChannels={selectedContacto ? salesChannels.byContactId.get(selectedContacto.id) ?? [] : []}
      />
      <EditContactoModal open={editOpen} onOpenChange={setEditOpen} contacto={selectedContacto} />
      <DeleteContactoDialog open={deleteOpen} onOpenChange={setDeleteOpen} contacto={selectedContacto} />
      <ConvertContactoModal
        open={convertOpen}
        onOpenChange={setConvertOpen}
        contacto={convertRawContacto}
        onConverted={() => setConvertOpen(false)}
      />
      {sellContacto && (
        <SellPlatformContactDialog
          open={sellOpen}
          onOpenChange={setSellOpen}
          contactId={sellContacto.id}
          contactName={sellContacto.nombre}
          instagramHandle={sellContacto.instagram}
          contactKind={sellContacto.contactKind}
        />
      )}

      {/* Auditoría — dialog liviano con SOLO el log de cambios de categoría. */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Auditoría de cambios</DialogTitle>
          </DialogHeader>
          <CategoryAuditLog open={auditOpen} />
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default ContactosContent;
