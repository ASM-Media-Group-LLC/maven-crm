import { useState } from "react";
import {
  Users, Clock, TrendingUp, Target, Plus, Eye, Pencil, Trash2, Search, X,
  ListIcon, LayoutGrid, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MaskedPhone } from "@/components/MaskedPhone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import StatChip from "@/components/StatChip";
import StartOnboardingModal from "./StartOnboardingModal";
import {
  useProspectos, useAddProspect, useUpdateProspect, useDeleteProspect,
  PROSPECT_STATUSES, PROSPECT_STATUS_COLORS, PROSPECT_SOURCES, PROSPECT_PLATFORMS,
  AGENCY_ORDER, type ProspectRecord,
} from "./useProspectos";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage } from "@/hooks/useLanguage";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (parts[0]?.[0] ?? "?").toUpperCase();
}

const emptyForm = {
  name: "", instagram: "", tiktok: "", platform: "", category: "",
  agency: "", country: "", email: "", phone: "", source: "", notes: "", status: "lead",
};

export default function ProspectosPage() {
  const { t } = useLanguage();
  const { data: prospects = [], isLoading } = useProspectos();
  const addMutation = useAddProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agencyTab, setAgencyTab] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [viewItem, setViewItem] = useState<ProspectRecord | null>(null);
  const [editItem, setEditItem] = useState<ProspectRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<ProspectRecord | null>(null);
  const [onboardItem, setOnboardItem] = useState<ProspectRecord | null>(null);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // KPIs
  const totalLeads = prospects.filter((p) => p.status === "lead").length;
  const totalNegociando = prospects.filter((p) => p.status === "negociando").length;
  const totalConvertidos = prospects.filter((p) => p.status === "convertido").length;
  const conversionRate = prospects.length > 0 ? ((totalConvertidos / prospects.length) * 100).toFixed(1) : "0";

  // Filtering
  const hasFilters = search || statusFilter;
  const filtered = prospects.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.instagram?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    const matchAgency = !agencyTab || p.agency === agencyTab;
    return matchSearch && matchStatus && matchAgency;
  });

  // Agency tabs from data
  const agencyTabs = AGENCY_ORDER;
  // "Otra" es un valor GUARDADO (plataforma o agencia); solo cambia cómo se muestra.
  const visible = (v: string | null | undefined) => (v === "Otra" ? t("creadores.socials.other") : v);

  function openEdit(item: ProspectRecord) {
    setEditForm({
      name: item.name, instagram: item.instagram ?? "", tiktok: item.tiktok ?? "",
      platform: item.platform ?? "", category: item.category ?? "", agency: item.agency ?? "",
      country: item.country ?? "", email: item.email ?? "", phone: item.phone ?? "",
      source: item.source ?? "", notes: item.notes ?? "", status: item.status,
    });
    setEditItem(item);
  }

  function handleAdd() {
    if (!addForm.name.trim()) return;
    addMutation.mutate(addForm as any, { onSuccess: () => { setShowAdd(false); setAddForm({ ...emptyForm }); } });
  }

  function handleUpdate() {
    if (!editForm.name.trim() || !editItem) return;
    // phone/email enmascarados (••••) para no-admin: si no los cambió (siguen con "•"),
    // NO los mandamos para no pisar el valor real. Si escribió uno nuevo (sin "•"), se guarda.
    const data: any = { ...editForm };
    if (typeof data.phone === "string" && data.phone.includes("•")) delete data.phone;
    if (typeof data.email === "string" && data.email.includes("•")) delete data.email;
    updateMutation.mutate({ id: editItem.id, data }, { onSuccess: () => setEditItem(null) });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
          <PageHeader
            title={t("creadores.pros.title")}
            subtitle={t("cr.prospectsSubtitle")}
            actions={
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-1" />{t("cr.newProfile")}
              </Button>
            }
          />
        </header>

        {/* Scrollable */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
            ) : (
              <>
                <StatChip label={t("cr.totalCasting")} value={String(prospects.length)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("cr.allRecords")} />
                <StatChip label={t("cr.pendingContact")} value={String(totalLeads)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={prospects.length > 0 ? t("cr.pctOfTotal", { p: ((totalLeads / prospects.length) * 100).toFixed(0) }) : "—"} />
                <StatChip label={t("cr.negotiating")} value={String(totalNegociando)} icon={<Target className="h-3.5 w-3.5" />} color="bg-primary" hint={prospects.length > 0 ? t("cr.pctOfTotal", { p: ((totalNegociando / prospects.length) * 100).toFixed(0) }) : "—"} />
                <StatChip label={t("cr.conversionRate")} value={`${conversionRate}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success" hint={t("cr.nConverted", { n: totalConvertidos })} />
              </>
            )}
          </div>

          {/* Agency Tabs */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <Button variant={!agencyTab ? "secondary" : "ghost"} size="sm" onClick={() => setAgencyTab("")}>{t("common.all")}</Button>
            {agencyTabs.map((a) => (
              <Button key={a} variant={agencyTab === a ? "secondary" : "ghost"} size="sm" onClick={() => setAgencyTab(a)}>{visible(a)}</Button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("cr.prospectSearchPh")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("common.all")}</SelectItem>
                {PROSPECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="inline-flex items-center rounded-md border border-border">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")} aria-label={t("creadores.pros.listView")} title={t("creadores.pros.listView")}><ListIcon className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")} aria-label={t("creadores.list.gridView")} title={t("creadores.list.gridView")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); }}>
                <X className="h-3.5 w-3.5 mr-1" />{t("creadores.list.clearFilters")}
              </Button>
            )}
          </div>

          {/* Table View */}
          {viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-28rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("creadores.table.colCreator")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("creadores.pros.platform")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("common.category")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("creadores.table.colAgency")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("common.date")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          {prospects.length === 0 ? t("cr.noProfiles") : t("cr.noResultsFilters")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => {
                        const initials = getInitials(p.name);
                        const statusColors = PROSPECT_STATUS_COLORS[p.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                        return (
                          <TableRow key={p.id} className="group hover:bg-muted/30 transition-colors">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-semibold text-primary">{initials}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{p.name}</p>
                                  {p.instagram && <p className="text-xs text-muted-foreground">@{p.instagram.replace(/^@/, "")}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{visible(p.platform) ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.category ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{visible(p.agency) ?? "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                            <TableCell>
                              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                                {(() => { const s = PROSPECT_STATUSES.find((x) => x.value === p.status); return s ? t(s.label) : p.status; })()}
                              </span>
                            </TableCell>
                            <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                              <div className="flex items-center gap-1">
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(p)}><Eye className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">{t("common.edit")}</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                                {p.status !== "convertido" && p.status !== "descartado" && (
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button size="sm" className="h-7 px-2 text-xs ml-1" onClick={() => setOnboardItem(p)}>
                                      <Rocket className="h-3.5 w-3.5 mr-1" />{t("creadores.pros.onboarding")}
                                    </Button>
                                  </TooltipTrigger><TooltipContent side="left">{t("creadores.onb.start")}</TooltipContent></Tooltip>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)
              ) : filtered.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  {prospects.length === 0 ? t("cr.noProfiles") : t("cr.noResultsFilters")}
                </div>
              ) : (
                filtered.map((p) => {
                  const initials = getInitials(p.name);
                  const statusColors = PROSPECT_STATUS_COLORS[p.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                  return (
                    <Card key={p.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{p.instagram ? `@${p.instagram.replace(/^@/, "")}` : t("creadores.pros.noInstagram")}</p>
                            </div>
                          </div>
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                            {(() => { const s = PROSPECT_STATUSES.find((x) => x.value === p.status); return s ? t(s.label) : p.status; })()}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p><span className="font-medium text-foreground">{t("creadores.pros.platformColon")}</span> {visible(p.platform) ?? "—"}</p>
                          {p.agency && <p><span className="font-medium text-foreground">{t("creadores.pros.agencyColon")}</span> {visible(p.agency)}</p>}
                          <p><span className="font-medium text-foreground">{t("creadores.pros.sourceColon")}</span> {(() => { const s = PROSPECT_SOURCES.find((x) => x.value === p.source); return s ? t(s.label) : "—"; })()}</p>
                          <p><span className="font-medium text-foreground">{t("cr.dateColon")}</span> {format(new Date(p.created_at), "dd/MM/yyyy")}</p>
                        </div>
                        <div className="flex items-center gap-1 pt-1 border-t border-border">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(p)}><Eye className="h-3 w-3 mr-1" />{t("common.view")}</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(p)}><Pencil className="h-3 w-3 mr-1" />{t("common.edit")}</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3 w-3 mr-1" />{t("common.delete")}</Button>
                          {p.status !== "convertido" && p.status !== "descartado" && (
                            <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => setOnboardItem(p)}>
                              <Rocket className="h-3 w-3 mr-1" />{t("creadores.pros.onboarding")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* View Modal */}
        <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("cr.profileDetail")}</DialogTitle></DialogHeader>
            {viewItem && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">{t("common.name")}</p><p className="font-medium">{viewItem.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Instagram</p><p>{viewItem.instagram ? `@${viewItem.instagram.replace(/^@/, "")}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">TikTok</p><p>{viewItem.tiktok ? `@${viewItem.tiktok.replace(/^@/, "")}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("creadores.pros.platform")}</p><p>{visible(viewItem.platform) ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.category")}</p><p>{viewItem.category ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("creadores.table.colAgency")}</p><p>{visible(viewItem.agency) ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.country")}</p><p>{viewItem.country ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.email")}</p><p>{viewItem.email ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.phone")}</p><p><MaskedPhone phone={viewItem.phone} /></p></div>
                  <div><p className="text-xs text-muted-foreground">{t("creadores.pros.source")}</p><p>{(() => { const s = PROSPECT_SOURCES.find((x) => x.value === viewItem.source); return s ? t(s.label) : "—"; })()}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.date")}</p><p>{format(new Date(viewItem.created_at), "dd/MM/yyyy")}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.status")}</p>
                    {(() => {
                      const c = PROSPECT_STATUS_COLORS[viewItem.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                      return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>{(() => { const s = PROSPECT_STATUSES.find((x) => x.value === viewItem.status); return s ? t(s.label) : viewItem.status; })()}</span>;
                    })()}
                  </div>
                </div>
                {viewItem.notes && (
                  <div><p className="text-xs text-muted-foreground">{t("creadores.ops.notes")}</p><p className="whitespace-pre-wrap">{viewItem.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Modal */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("cr.newProfile")}</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
              <div className="space-y-1.5">
                <Label>{t("common.name")} <span className="text-destructive">*</span></Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Instagram (@)</Label>
                  <Input value={addForm.instagram} onChange={(e) => setAddForm((f) => ({ ...f, instagram: e.target.value }))} placeholder={t("cr.userHandlePh")} />
                </div>
                <div className="space-y-1.5">
                  <Label>TikTok (@)</Label>
                  <Input value={addForm.tiktok} onChange={(e) => setAddForm((f) => ({ ...f, tiktok: e.target.value }))} placeholder={t("cr.userHandlePh")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("creadores.pros.mainPlatform")}</Label>
                  <Select value={addForm.platform || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                    <SelectContent>{PROSPECT_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.labelKey ? t(p.labelKey) : p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.category")}</Label>
                  <Input value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("creadores.table.colAgency")}</Label>
                  <Select value={addForm.agency || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, agency: v }))}>
                    <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                    <SelectContent>{AGENCY_ORDER.map((a) => <SelectItem key={a} value={a}>{visible(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.country")}</Label>
                  <Input value={addForm.country} onChange={(e) => setAddForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("common.email")}</Label>
                  <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.phone")}</Label>
                  <PhoneInput value={addForm.phone} onChange={(v) => setAddForm((f) => ({ ...f, phone: v }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("creadores.pros.source")}</Label>
                <Select value={addForm.source || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>{PROSPECT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("creadores.ops.notes")}</Label>
                <Textarea rows={3} value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAdd(false)}>{t("common.cancel")}</Button>
                <Button onClick={handleAdd} disabled={!addForm.name.trim() || addMutation.isPending}>
                  {addMutation.isPending ? t("creadores.saving") : t("creadores.pros.create")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("cr.editProspect")}</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
              <div className="space-y-1.5">
                <Label>{t("common.name")} <span className="text-destructive">*</span></Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Instagram (@)</Label>
                  <Input value={editForm.instagram} onChange={(e) => setEditForm((f) => ({ ...f, instagram: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>TikTok (@)</Label>
                  <Input value={editForm.tiktok} onChange={(e) => setEditForm((f) => ({ ...f, tiktok: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("creadores.pros.platform")}</Label>
                  <Select value={editForm.platform || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                    <SelectContent>{PROSPECT_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.labelKey ? t(p.labelKey) : p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.category")}</Label>
                  <Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("creadores.table.colAgency")}</Label>
                  <Select value={editForm.agency || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, agency: v }))}>
                    <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                    <SelectContent>{AGENCY_ORDER.map((a) => <SelectItem key={a} value={a}>{visible(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.country")}</Label>
                  <Input value={editForm.country} onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("common.email")}</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.phone")}</Label>
                  <PhoneInput value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.status")}</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("creadores.pros.source")}</Label>
                <Select value={editForm.source || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>{PROSPECT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("creadores.ops.notes")}</Label>
                <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>{t("common.cancel")}</Button>
                <Button onClick={handleUpdate} disabled={!editForm.name.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? t("creadores.saving") : t("creadores.edit.saveChanges")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("cr.deleteProspectQ")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("cr.deleteProspectA")}<strong>{deleteItem?.name}</strong>{t("cr.offDeleteDescB")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
                {deleteMutation.isPending ? t("cr.deleting") : t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Start Onboarding Modal */}
        <StartOnboardingModal prospect={onboardItem} onClose={() => setOnboardItem(null)} />
      </div>
  );
}
