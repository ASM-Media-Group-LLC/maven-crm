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
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { PageHeader } from "@/components/ui/page-header";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import ContactosKPICards, { type ContactKpiKey } from "./ContactosKPICards";
import ContactosFilters, { type ContactoFilters } from "./ContactosFilters";
import ContactosCardList from "./ContactosCardList";
import ContactosAnalyticsModal from "./ContactosAnalyticsModal";

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
const loadViewState = (): { activeTab?: "dashboard" | "contactos"; filters?: ContactoFilters; page?: number } => {
  try { return JSON.parse(sessionStorage.getItem(VIEWSTATE_KEY) || "{}") || {}; } catch { return {}; }
};

const ContactosContent = () => {
  const restored = loadViewState();
  const [activeTab, setActiveTab] = useState<"dashboard" | "contactos">(restored.activeTab ?? "dashboard");
  const [filters, setFilters] = useState<ContactoFilters>(restored.filters ?? emptyFilters);
  const [selectedContacto, setSelectedContacto] = useState<Contacto | null>(null);
  const [kpiPopup, setKpiPopup] = useState<ContactKpiKey | null>(null);
  // Estado del collapsed por categoría — mismo patrón que panel/
  // dashboard v2: default top expandida, resto colapsadas.
  // null = sin tocar (aplica default: solo la 1ª categoría abierta). Un Set (aunque
  // vacío) = el usuario ya interactuó → respetar su elección. OJO: usar "size===0"
  // como sentinel rompía expandir la última categoría colapsada (al vaciarse el set
  // volvía al default y la re-colapsaba).
  const [kpiPopupCollapsed, setKpiPopupCollapsed] = useState<Set<string> | null>(null);
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
    sessionStorage.setItem(VIEWSTATE_KEY, JSON.stringify({ activeTab, filters, page }));
  }, [activeTab, filters, page]);

  // Deep-link desde el ⌘K: /contactos?q=<handle|nombre> abre el directorio con
  // la búsqueda precargada (pisa filtros restaurados) y limpia el parámetro.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q === null) return;
    setActiveTab("contactos");
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
  const { stats: funnelStats, isError: funnelError, refetch: refetchFunnel } = useContactFunnelStats(filters.dateFrom, filters.dateTo);

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

  // Lista de contactos para el popup de KPI — query lazy: solo dispara cuando el
  // usuario abre uno de los cards. Server-side vía get_contact_funnel_list: misma
  // clasificación lifecycle que los conteos → la lista coincide EXACTO. Limitado a
  // 100 filas (display); los conteos del card siguen siendo globales/server-side.
  // El bucket "conversion" reusa el mismo set que "creadoras" (es el numerador).
  const { data: kpiPopupContacts = [], isLoading: kpiPopupLoading } = useQuery({
    queryKey: ["contact_funnel_list", kpiPopup, filters.dateFrom, filters.dateTo],
    enabled: kpiPopup !== null,
    queryFn: async () => {
      const bucket = kpiPopup === "conversion" ? "creator_active"
        : kpiPopup === "creadoras" ? "creator_active"
        : kpiPopup === "proceso" ? "in_progress"
        : kpiPopup === "sinTocar" ? "none"
        : kpiPopup === "churn" ? "churn"
        : "pipeline";
      const { data, error } = await (supabase as any).rpc("get_contact_funnel_list", {
        p_bucket: bucket,
        p_from: filters.dateFrom || null,
        p_to: filters.dateTo || null,
      });
      if (error) {
        if (error.code === "42501") return [];
        throw error;
      }
      return (data ?? []) as any[];
    },
  });

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
              {/* La analítica vive ahora FUSIONADA en el subtab Dashboard (no más
                  botón + popup). Auditoría queda como acceso discreto dentro del Dashboard.
                  El "calendario de movimiento" (rango de fechas) es GLOBAL: aplica a
                  todos los subtabs y también acota la analítica del Dashboard. */}
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
        <SubtabNav className="shrink-0">
          <SubtabNavItem active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard className="mr-1.5 h-4 w-4" />
            Dashboard
          </SubtabNavItem>
          <SubtabNavItem active={activeTab === "contactos"} onClick={() => setActiveTab("contactos")}>
            <Users className="mr-1.5 h-4 w-4" />
            Contactos
          </SubtabNavItem>
        </SubtabNav>

        {activeTab === "dashboard" && (
          <div className="space-y-5 overflow-auto px-6 py-5">
            {funnelError ? (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
                <span>No se pudieron cargar las métricas del embudo — los contadores pueden verse en 0.</span>
                <Button variant="outline" size="sm" onClick={() => void refetchFunnel()}>
                  Reintentar
                </Button>
              </div>
            ) : null}
            <ContactosKPICards
              stats={funnelStats}
              onClick={(key) => setKpiPopup(key)}
            />
            {/* Card "por canal de venta" → admin+manager. La analítica completa
                (tendencias) + Auditoría siguen siendo SOLO admin (anidado abajo). */}
            {canSeeChannels && (
              <div className="space-y-3">
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold">Contactos por canal de venta</h2>
                      <span className="text-xs text-muted-foreground">
                        Alcance multi-canal: <span className="font-semibold tabular-nums text-foreground">{salesChannels.multiChannelCount}</span>
                      </span>
                    </div>
                    {salesChannels.isLoading ? (
                      <p className="text-sm text-muted-foreground">Cargando…</p>
                    ) : salesChannels.countsByChannel.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin datos de canales.</p>
                    ) : (() => {
                      const maxCount = Math.max(1, ...salesChannels.countsByChannel.map((c) => c.count));
                      return (
                        <div className="space-y-2">
                          {salesChannels.countsByChannel.map((c) => (
                            <div key={c.id} className="flex items-center gap-3">
                              <span className="w-40 shrink-0 text-xs font-medium truncate">{c.label}</span>
                              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${(c.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{c.count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
                {isAdmin && (
                  <>
                <div className="flex items-center justify-between border-t pt-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Analítica del directorio</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-warning hover:text-warning"
                    onClick={() => setAuditOpen(true)}
                  >
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Auditoría
                  </Button>
                </div>
                <ContactosAnalyticsModal
                  inline
                  enabled={activeTab === "dashboard"}
                  defaultTab="monthly"
                  dateFrom={filters.dateFrom}
                  dateTo={filters.dateTo}
                  open={false}
                  onOpenChange={() => {}}
                />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "contactos" && (
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
        )}
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

      {/* Auditoría — dialog liviano con SOLO el log de cambios de categoría
          (antes abría la analítica completa como popup, redundante con el Dashboard inline). */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Auditoría de cambios</DialogTitle>
          </DialogHeader>
          <CategoryAuditLog open={auditOpen} />
        </DialogContent>
      </Dialog>

      {/* KPI POPUP — al clickar un cuadro del Dashboard de Contactos */}
      <Dialog
        open={kpiPopup !== null}
        onOpenChange={(o) => {
          if (!o) {
            setKpiPopup(null);
            setKpiPopupCollapsed(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {kpiPopup === "pipeline" && `Pipeline vivo (${funnelStats.pipelineVivo.toLocaleString("es")})`}
              {kpiPopup === "creadoras" && `Creadoras vía pipeline (${funnelStats.creadoras})`}
              {kpiPopup === "conversion" && `Convirtieron a creadora (${funnelStats.creadoras})`}
              {kpiPopup === "proceso" && `En proceso (${funnelStats.enProceso})`}
              {kpiPopup === "sinTocar" && `Sin tocar · pool vivo (${funnelStats.sinTocar})`}
              {kpiPopup === "churn" && `Se están yendo (${funnelStats.churnLeaving + funnelStats.churnTerminated})`}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {kpiPopup === "pipeline" && "Contactos trabajables (sin el import histórico de Kash) · 100 más recientes"}
              {kpiPopup === "creadoras" && "Llegaron a creadora desde el pipeline · 100 más recientes"}
              {kpiPopup === "conversion" && "El numerador de la tasa: contactos que se volvieron creadora · 100 más recientes"}
              {kpiPopup === "proceso" && "Con closer asignado o ya contactados · 100 más recientes"}
              {kpiPopup === "sinTocar" && "Pool vivo para repartir (sin tocar todavía) · 100 más recientes"}
              {kpiPopup === "churn" && "Creadoras saliendo o dadas de baja · agrupadas por estado"}
            </p>
          </DialogHeader>

          {kpiPopupLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Cargando…</p>
            </div>
          ) : kpiPopupContacts.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
              Sin contactos.
            </div>
          ) : (() => {
            // Agrupar por categoría (physical_appearance). Normalizamos
            // a uppercase para mergear "b" y "B" en el mismo bucket.
            // Los valores raw lowercase del DB se preservan al
            // mostrarlos individualmente pero el agrupado usa la forma
            // canónica.
            const normalizeCat = (raw: string | null | undefined): string => {
              const t = (raw ?? "").trim();
              if (!t) return "Sin categoría";
              // Mapeo: "b" → "B", "b+" → "B+", etc.
              const lower = t.toLowerCase();
              const map: Record<string, string> = {
                "elite": "Elite",
                "a+": "A+", "a": "A",
                "b+": "B+", "b": "B",
                "c+": "C+", "c": "C",
              };
              return map[lower] ?? t;
            };
            const buckets = new Map<string, typeof kpiPopupContacts>();
            for (const c of kpiPopupContacts) {
              const key = normalizeCat(c.physical_appearance);
              const arr = buckets.get(key) ?? [];
              arr.push(c);
              buckets.set(key, arr);
            }
            const sortedCats = Array.from(buckets.keys()).sort((a, b) => {
              const sa = CATEGORY_ORDER[a] ?? 999;
              const sb = CATEGORY_ORDER[b] ?? 999;
              if (sa !== sb) return sa - sb;
              return a.localeCompare(b);
            });
            const effectiveCollapsed = kpiPopupCollapsed === null
              ? new Set(sortedCats.slice(1))
              : kpiPopupCollapsed;
            const toggleCat = (cat: string) => {
              const base = kpiPopupCollapsed === null
                ? new Set(sortedCats.slice(1))
                : new Set(kpiPopupCollapsed);
              if (base.has(cat)) base.delete(cat);
              else base.add(cat);
              setKpiPopupCollapsed(base);
            };
            const renderContactRow = (c: typeof kpiPopupContacts[number]) => {
              const cleanHandle = (c.handle || "").replace(/^@/, "");
              const created = c.created_at
                ? new Date(c.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
                : "—";
              return (
                <ListRowButton
                  key={c.id}
                  onClick={() => {
                    const fullContacto = allContactos.find((x) => x.id === c.id);
                    if (fullContacto) {
                      setKpiPopup(null);
                      setKpiPopupCollapsed(null);
                      handleView(fullContacto);
                    } else {
                      const minimal: Contacto = {
                        id: c.id,
                        rawCreatedAt: c.created_at || "",
                        creacion: created,
                        ticket: "",
                        nombre: c.name || "",
                        estado: statusMap[c.status || ""] || c.status || "",
                        instagram: c.handle || "",
                        platform: "Instagram",
                        pais: c.country_code || "",
                        city: c.city || "",
                        categoria: c.physical_appearance || "",
                        whatsapp: "",
                        interacciones: 0,
                        creadoPor: "",
                        email: "",
                        phone: "",
                        country_code: c.country_code || "",
                        company: "",
                        notes: "",
                        source: "",
                        profile_picture_url: c.profile_picture_url || "",
                        assigned_to: "",
                        onlyfans_url: "",
                      };
                      setKpiPopup(null);
                      setKpiPopupCollapsed(null);
                      handleView(minimal);
                    }
                  }}
                  className="group"
                >
                  <UserAvatar
                    name={c.name}
                    src={c.profile_picture_url}
                    size="sm"
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {c.country_code && <span className="text-xs shrink-0">{getCountryFlag(c.country_code)}</span>}
                      <p className="font-medium text-sm truncate">{c.name || "—"}</p>
                    </div>
                    {cleanHandle && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <InstagramIcon className="h-2.5 w-2.5" />
                        @{cleanHandle}
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-right shrink-0">
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {c.city || "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.country_code ? getCountryShortDisplay(c.country_code) : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {created}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </ListRowButton>
              );
            };
            return (
              <div className="space-y-3">
                {sortedCats.map((cat) => {
                  const rows = buckets.get(cat)!;
                  const isCollapsed = effectiveCollapsed.has(cat);
                  return (
                    <div key={cat} className="space-y-2">
                      <CategorySectionHeader
                        cat={cat}
                        count={rows.length}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleCat(cat)}
                      />
                      {!isCollapsed && (
                        <div className="space-y-1.5 pl-1">
                          {rows.map(renderContactRow)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default ContactosContent;
