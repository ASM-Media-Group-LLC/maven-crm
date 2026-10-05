import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Plus } from "lucide-react";
import {
  useScouterLeads,
  useScouterCompanies,
  useCreateLeadManual,
  type ScouterLead,
} from "@/hooks/useScouterLeads";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import {
  LeadDrawer,
  STATUS_META,
  STATUS_OPTIONS,
  VerifiedBadge,
  formatFollowers,
  initialsBg,
  scoreColor,
} from "./leadShared";

// Leads tab — denser table view of scouter_leads, complementing the
// photo-first grid that lives in Home / Favoritas. Same drawer on
// row-click, same data source. Different layout because closers
// managing dozens of leads day-to-day need to scan many rows at once
// without the visual weight of a 1:1 photo for each.
//
// Out of scope this slice (matches the Home limits):
//   - Pagination beyond a 200-row hard limit
//   - Multi-select bulk actions
//   - Per-column sort (only created_at DESC for now)

const ScouterLeads = () => {
  const { t } = useLanguage();
  const f = useFormato();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const leads = useScouterLeads({ status: statusFilter, search, pageSize: 200 });
  const rows = leads.data?.leads ?? [];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("scouter.filter.searchLeads")}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("scouter.leads.add")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {leads.isLoading ? t("common.loading") : t("scouter.leads.countOfMax", { count: rows.length })}
        </span>
      </div>

      <ManualLeadDialog open={addOpen} onOpenChange={setAddOpen} />


      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        {leads.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">{t("scouter.noLeads")}</p>
            <p className="text-xs text-muted-foreground">
              {t("scouter.leads.emptyHint")}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]"></TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cat.</TableHead>
                <TableHead>{t("scouter.countryCity")}</TableHead>
                <TableHead className="text-right">AI</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead>Closer</TableHead>
                <TableHead className="text-right">{t("scouter.leads.col.discovered")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lead) => {
                const statusCfg = STATUS_META[lead.status] ?? STATUS_META.discovery;
                const initial = (
                  lead.name?.trim().charAt(0) ||
                  lead.instagram_handle.charAt(0) ||
                  "?"
                ).toUpperCase();
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => {
                      setSelected(lead);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell>
                      <div
                        className="relative h-9 w-9 overflow-hidden rounded-md"
                        style={{ background: initialsBg(lead.instagram_handle) }}
                      >
                        {lead.photo_data_url ? (
                          <img
                            src={lead.photo_data_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90">
                            {initial}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">@{lead.instagram_handle}</span>
                        {lead.verified && (
                          <VerifiedBadge size={14} />
                        )}
                      </div>
                      {lead.name && (
                        <div className="text-xs text-muted-foreground">{lead.name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="gap-1.5"
                        style={{ background: `${statusCfg.dot}22`, color: statusCfg.dot }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: statusCfg.dot }}
                        />
                        {t(statusCfg.labelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.category ? (
                        <span className="font-mono text-xs font-bold text-amber-400">
                          {lead.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {[lead.country, lead.city].filter(Boolean).join(" · ") || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lead.ai_score != null ? (
                        <span style={{ color: scoreColor(lead.ai_score) }} className="font-bold">
                          {lead.ai_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatFollowers(lead.followers)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.assigned_closer || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {new Date(lead.created_at).toLocaleDateString(f.intl("es-CO"), {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <LeadDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
};

// Manual lead dialog — input @handle + compañía obligatorios + campos
// opcionales que el supervisor ya conozca (nombre, país, followers, bio,
// notas). El lead entra con discovery_source='manual' y ai_status=null,
// quedando pendiente del worker para scoreo IA. Si el worker no está
// corriendo, igual se ve en Discovery y se puede aprobar a mano desde
// el drawer.
const ManualLeadDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const { t } = useLanguage();
  const companies = useScouterCompanies();
  const create = useCreateLeadManual();

  const [handle, setHandle] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [followers, setFollowers] = useState("");
  const [bio, setBio] = useState("");
  const [notes, setNotes] = useState("");

  // Reset cada vez que se abre — Dialog cierra programáticamente en
  // onSuccess, así que sin esto la próxima apertura mostraba data stale.
  const reset = () => {
    setHandle("");
    setCompanyId("");
    setFullName("");
    setCountry("");
    setFollowers("");
    setBio("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !companyId) return;
    try {
      const fol = followers.trim() ? parseInt(followers, 10) : null;
      await create.mutateAsync({
        instagram_handle: handle,
        company_id: companyId,
        full_name: fullName || null,
        country: country || null,
        followers: Number.isFinite(fol as number) ? (fol as number) : null,
        bio: bio || null,
        notes: notes || null,
      });
      reset();
      onOpenChange(false);
    } catch {
      // toast ya lo emite el hook — dejamos el dialog abierto para retry.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scouter.leads.manualTitle")}</DialogTitle>
          <DialogDescription>
            {t("scouter.leads.manualDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ml-handle">Instagram handle *</Label>
            <Input
              id="ml-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@username"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-company">{t("scouter.leads.companyRequired")}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="ml-company">
                <SelectValue placeholder={t("scouter.leads.selectCompany")} />
              </SelectTrigger>
              <SelectContent>
                {(companies.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ml-name">{t("common.name")}</Label>
              <Input
                id="ml-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("scouter.leads.optional")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ml-country">{t("common.country")}</Label>
              <Input
                id="ml-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="MX, AR…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-followers">Followers</Label>
            <Input
              id="ml-followers"
              type="number"
              inputMode="numeric"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder={t("scouter.leads.optional")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-bio">Bio</Label>
            <Textarea
              id="ml-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder={t("scouter.leads.optional")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-notes">{t("scouter.leads.internalNotes")}</Label>
            <Textarea
              id="ml-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("scouter.leads.internalNotesPlaceholder")}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || !handle.trim() || !companyId}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ScouterLeads;
