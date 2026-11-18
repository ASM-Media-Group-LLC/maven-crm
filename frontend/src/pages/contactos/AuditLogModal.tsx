import { formatUI } from "@/lib/formatoHora";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowRight, Clock, Shield, Search, Filter, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { getCountryFlag } from "@/lib/country-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AuditLogModal = ({ open, onOpenChange }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<"all" | "suspicious" | "normal">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: changes = [], isLoading } = useQuery({
    queryKey: ["audit-log-full"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_category_changes")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const agentIds = useMemo(() => {
    const ids = new Set<string>();
    changes.forEach((c) => { if (c.changed_by) ids.add(c.changed_by); });
    return Array.from(ids);
  }, [changes]);

  const { data: profiles = {} } = useQuery({
    queryKey: ["audit-profiles-modal", agentIds],
    enabled: agentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_agent_names", { _user_ids: agentIds });
      if (error) throw error;
      const map: Record<string, string> = {};
      // Sin nombre queda vacío: el "Desconocido" se pone al dibujar, en el idioma de
      // la interfaz (este mapa queda en la caché de react-query).
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || ""; });
      return map;
    },
  });

  // Get contact details for city/country
  const contactIds = useMemo(() => {
    const ids = new Set<string>();
    changes.forEach((c) => { if (c.contact_id) ids.add(c.contact_id); });
    return Array.from(ids);
  }, [changes]);

  const { data: contactDetails = {} } = useQuery({
    queryKey: ["audit-contact-details", contactIds],
    enabled: contactIds.length > 0 && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers_contacts")
        .select("id, city, country_code, ticket_number")
        .in("id", contactIds);
      if (error) throw error;
      const map: Record<string, { city: string | null; country_code: string | null; ticket: string | null }> = {};
      (data ?? []).forEach((c) => { map[c.id] = { city: c.city, country_code: c.country_code, ticket: c.ticket_number }; });
      return map;
    },
  });

  const filtered = useMemo(() => {
    let list = changes;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const detail = contactDetails[c.contact_id];
        return (
          c.contact_name?.toLowerCase().includes(q) ||
          c.contact_handle?.toLowerCase().includes(q) ||
          (detail?.ticket ?? "").toLowerCase().includes(q) ||
          (detail?.city ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (agentFilter !== "all") {
      list = list.filter((c) => c.changed_by === agentFilter);
    }

    if (riskFilter === "suspicious") {
      list = list.filter((c) => (c.hours_since_creation ?? 0) > 24);
    } else if (riskFilter === "normal") {
      list = list.filter((c) => (c.hours_since_creation ?? 0) <= 24);
    }

    if (categoryFilter !== "all") {
      list = list.filter((c) => c.new_category === categoryFilter || c.old_category === categoryFilter);
    }

    return list;
  }, [changes, search, agentFilter, riskFilter, categoryFilter, contactDetails]);

  const suspicious = useMemo(() => changes.filter((c) => (c.hours_since_creation ?? 0) > 24), [changes]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    changes.forEach((c) => {
      if (c.old_category) set.add(c.old_category);
      if (c.new_category) set.add(c.new_category);
    });
    return Array.from(set).sort();
  }, [changes]);

  const hasFilters = search || agentFilter !== "all" || riskFilter !== "all" || categoryFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setAgentFilter("all");
    setRiskFilter("all");
    setCategoryFilter("all");
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-warning" />
            {t("contactos.auditLogTitle")}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">{t("contactos.loadingRecords")}</p>
          </div>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 shrink-0">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-muted-foreground">{t("contactos.totalChanges")}</p>
                  <p className="text-2xl font-bold">{changes.length}</p>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs text-warning">{t("contactos.suspiciousOver24h")}</p>
                  <p className="text-2xl font-bold text-warning">{suspicious.length}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-muted-foreground">{t("contactos.agentsInvolved")}</p>
                  <p className="text-2xl font-bold">{agentIds.length}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-muted-foreground">{t("contactos.showing")}</p>
                  <p className="text-2xl font-bold">{filtered.length}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("contactos.auditSearchPlaceholder")}
                    className="pl-9"
                  />
                </div>

                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder={t("contactos.agent")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("contactos.allAgents")}</SelectItem>
                    {agentIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {profiles[id] || t("contactos.unknown")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as any)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={t("contactos.risk")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("contactos.anyRisk")}</SelectItem>
                    <SelectItem value="suspicious">{t("contactos.suspiciousPl")}</SelectItem>
                    <SelectItem value="normal">{t("contactos.normalPl")}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder={t("common.category")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allF")}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="h-4 w-4 mr-1" /> {t("contactos.clear")}
                  </Button>
                )}
              </div>

              {/* Table */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Filter className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("contactos.noRecordsForFilters")}</p>
                </div>
              ) : (
                <div className="rounded-lg border flex-1 min-h-0 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky top-0 bg-card z-10">{t("common.date")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">Ticket</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("contactos.contact")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("common.city")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("contactos.change")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("contactos.agent")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("contactos.time")}</TableHead>
                        <TableHead className="sticky top-0 bg-card z-10">{t("contactos.risk")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const agentName = profiles[c.changed_by] || t("contactos.unknown");
                        const detail = contactDetails[c.contact_id];
                        const isSuspicious = (c.hours_since_creation ?? 0) > 24;
                        const hoursLabel = c.hours_since_creation != null
                          ? c.hours_since_creation < 1
                            ? `${Math.round(c.hours_since_creation * 60)} min`
                            : `${Math.round(c.hours_since_creation)}h`
                          : "—";
                        const flag = detail?.country_code ? getCountryFlag(detail.country_code) : "";

                        return (
                          <TableRow key={c.id} className={isSuspicious ? "bg-warning/5" : ""}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {c.changed_at
                                ? formatUI(new Date(c.changed_at), "dd MMM yy, HH:mm", { locale: f.fechas })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {detail?.ticket || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {flag && <span className="text-sm">{flag}</span>}
                                <div>
                                  <a
                                    href={`https://instagram.com/${c.contact_handle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                                  >
                                    <InstagramIcon className="h-3.5 w-3.5" />
                                    <span className="font-medium">@{c.contact_handle}</span>
                                  </a>
                                  <p className="text-[10px] text-muted-foreground">{c.contact_name}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {detail?.city || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px] px-1.5">{c.old_category || "—"}</Badge>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <Badge variant="outline" className="text-[10px] px-1.5 border-primary text-primary">{c.new_category || "—"}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-6 w-6 cursor-default items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold">
                                    {getInitials(agentName)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{agentName}</TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {hoursLabel}
                              </div>
                            </TableCell>
                            <TableCell>
                              {isSuspicious ? (
                                <Badge variant="destructive" className="text-[10px] gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {t("contactos.suspicious")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">{t("contactos.normal")}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground shrink-0">
                {t("contactos.auditModalFooter")}
              </p>
            </div>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuditLogModal;
