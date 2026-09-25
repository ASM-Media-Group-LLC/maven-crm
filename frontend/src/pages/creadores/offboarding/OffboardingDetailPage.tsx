import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  User,
  FileText,
  ShieldCheck,
  CheckSquare,
  DollarSign,
  Copy,
  Check,
  Save,
  ExternalLink,
} from "lucide-react";
import { useOffboardingById, type Offboarding } from "../useOffboarding";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { getTranslation, type TranslationKey } from "@/lib/i18n";

// Allowed approver user IDs (Luis Ortega + Grace Gelves)
const ALLOWED_APPROVER_IDS = [
  "41b35cef-82a8-4991-9234-3514b0064767",
  "8b90f141-8546-4cfd-a358-56ff227623df",
];

const STATUS_LABELS: Record<string, { key: TranslationKey; variant: string }> = {
  en_proceso: { key: "cr.offStatusInProgress" as const, variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { key: "cr.offStatusPendingApproval" as const, variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { key: "cr.offStatusPendingClosure" as const, variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { key: "cr.offStatusDone" as const, variant: "bg-muted text-muted-foreground border-border" },
};

const CATEGORIAS = [
  { value: "voluntaria", key: "cr.offCatVoluntary" as const },
  { value: "involuntaria", key: "cr.offCatInvoluntary" as const },
  { value: "mutuo_acuerdo", key: "cr.offCatMutual" as const },
  { value: "incumplimiento", key: "cr.offCatBreach" as const },
  { value: "otro", key: "cr.offCatOther" as const },
];

const CHECKLIST_ITEMS = [
  { key: "check_pagos" as const, i18n: "cr.offChkPayments" as const },
  { key: "check_material" as const, i18n: "cr.offChkMaterial" as const },
  { key: "check_campanas" as const, i18n: "cr.offChkCampaigns" as const },
  { key: "check_accesos" as const, i18n: "cr.offChkAccess" as const },
  { key: "check_documentacion" as const, i18n: "cr.offChkDocs" as const },
];

const OffboardingDetailPage = () => {
  const { t } = useLanguage();
  const { offboardingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const {
    offboarding,
    creatorInfo,
    approvals,
    financialImpact,
    isLoading,
    updateOffboarding,
    approve,
  } = useOffboardingById(offboardingId!);

  const [form, setForm] = useState({
    motivo_operativo: "",
    motivo_comercial: "",
    motivo_final: "",
    categoria: "",
    comentarios: "",
  });
  const [copied, setCopied] = useState(false);

  const approverProfilesQuery = useQuery({
    queryKey: ["approver_profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").limit(100);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (offboarding) {
      setForm({
        motivo_operativo: offboarding.motivo_operativo ?? "",
        motivo_comercial: offboarding.motivo_comercial ?? "",
        motivo_final: offboarding.motivo_final ?? "",
        categoria: offboarding.categoria ?? "",
        comentarios: offboarding.comentarios ?? "",
      });
    }
  }, [offboarding]);

  if (isLoading) {
    return (
      <main className="flex-1 p-6 flex items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  if (!offboarding) {
    return (
      <main className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{t("creadores.off.notFound")}</p>
        <Button variant="outline" onClick={() => navigate("/creadores/offboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> {t("common.back")}
        </Button>
      </main>
    );
  }

  const statusInfo = STATUS_LABELS[offboarding.status] ?? STATUS_LABELS.en_proceso;
  const approvalCount = approvals.filter((a) => a.approved).length;
  const checklistDone = CHECKLIST_ITEMS.filter((c) => offboarding[c.key]).length;
  const checklistPct = Math.round((checklistDone / CHECKLIST_ITEMS.length) * 100);
  const impact = financialImpact ?? { lastRevenue: 0, avgMonthly: 0, estimatedLost: 0 };

  const creatorName = creatorInfo?.name ?? t("cr.creator");
  const artisticName = creatorInfo?.artistic_name;
  const instagramHandle = creatorInfo?.instagram_handle;

  // Check if current user can approve
  const canApprove = isAdmin || (user?.id && ALLOWED_APPROVER_IDS.includes(user.id));
  const userAlreadyApproved = approvals.some((a) => a.approver_id === user?.id && a.approved);

  const handleSaveForm = () => {
    updateOffboarding.mutate(
      {
        motivo_operativo: form.motivo_operativo || null,
        motivo_comercial: form.motivo_comercial || null,
        motivo_final: form.motivo_final || null,
        categoria: form.categoria || null,
        comentarios: form.comentarios || null,
        last_revenue: impact.lastRevenue,
        avg_monthly_revenue: impact.avgMonthly,
        estimated_lost_revenue: impact.estimatedLost,
      } as Partial<Offboarding>,
      {
        onSuccess: () => toast({ title: t("creadores.off.updated") }),
        onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleChecklistToggle = (key: keyof Offboarding) => {
    updateOffboarding.mutate({ [key]: !offboarding[key] } as Partial<Offboarding>);
  };

  const handleApprove = () => {
    if (!user?.id) return;
    approve.mutate(user.id, {
      onSuccess: () => toast({ title: t("cr.approvalRegistered") }),
      onError: (err: any) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
    });
  };

  const handleStatusChange = (newStatus: string) => {
    updateOffboarding.mutate({ status: newStatus } as Partial<Offboarding>, {
      onSuccess: () => toast({ title: t("creadores.off.statusUpdated") }),
    });
  };

  const getApproverName = (id: string) => {
    const p = approverProfilesQuery.data?.find((pr) => pr.id === id);
    return p?.full_name ?? id.slice(0, 8);
  };

  const generateComunicado = () => {
    // El comunicado se GUARDA (comunicado_generado) y lo leen otras personas: va en
    // español sea cual sea el idioma de quien lo genera.
    const tEs = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "es", p);
    const text = `
═══════════════════════════════════════
  ${tEs("cr.commTitle")} — ${creatorName}
═══════════════════════════════════════

▸ ${tEs("common.name")}: ${creatorName}
▸ ${tEs("cr.commArtisticName")}: ${artisticName ?? "N/A"}
▸ Instagram: ${instagramHandle ?? "N/A"}
▸ ${tEs("cr.commExitDate")}: ${offboarding.exit_date ?? tEs("common.pending")}

── ${tEs("cr.commReasons")} ──────────────────────────
▸ ${tEs("cr.commOperational")}: ${form.motivo_operativo || "N/A"}
▸ ${tEs("cr.commCommercial")}: ${form.motivo_comercial || "N/A"}
▸ ${tEs("cr.commFinal")}: ${form.motivo_final || "N/A"}
▸ ${tEs("common.category")}: ${(() => { const c = CATEGORIAS.find((x) => x.value === form.categoria); return c ? tEs(c.key) : "N/A"; })()}

── ${tEs("cr.commFinancialImpact")} ───────────────
▸ ${tEs("cr.commLastRevenue")}: $${impact.lastRevenue.toLocaleString()}
▸ ${tEs("cr.commAvgMonthly")}: $${impact.avgMonthly.toLocaleString()}
▸ ${tEs("cr.commEstLost")}: $${impact.estimatedLost.toLocaleString()}

── ${tEs("cr.commAdminNotes")} ────────────
${form.comentarios || tEs("cr.commNoComments")}

── ${tEs("cr.commApprovals")} ─────────────────────
▸ ${tEs("cr.commApprovalsDone", { n: approvalCount })}

═══════════════════════════════════════
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    updateOffboarding.mutate({ comunicado_generado: text } as Partial<Offboarding>);
    toast({ title: t("cr.commCopied") });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="shrink-0 sticky top-0 z-10 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/creadores/offboarding")} aria-label={t("common.back")} title={t("common.back")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <PageHeader
                title={creatorName}
                subtitle={artisticName ?? instagramHandle ?? ""}
                actions={
                  <>
                    <Badge variant="outline" className={`text-xs shrink-0 ${statusInfo.variant}`}>{t(statusInfo.key)}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => navigate(`/creadores/${offboarding.creator_id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> {t("cr.viewProfile")}
                    </Button>
                  </>
                }
              />
            </div>
          </div>

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Status selector */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">{t("cr.processStatus")}</Label>
              <Select value={offboarding.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([val, { key: claveEstado }]) => (
                    <SelectItem key={val} value={val}>{t(claveEstado)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 1: Summary + Exit Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-t-[3px] border-t-destructive">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-destructive" /> {t("cr.creatorSummary")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { l: t("common.name"), v: creatorName },
                    { l: t("creadores.off.username"), v: artisticName ?? "—" },
                    { l: "Instagram", v: instagramHandle ?? "—" },
                    { l: t("cr.exitDate"), v: offboarding.exit_date ?? t("common.pending") },
                  ].map((r) => (
                    <div key={r.l} className="flex justify-between">
                      <span className="text-muted-foreground">{r.l}</span>
                      <span className="font-medium">{r.v}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> {t("cr.exitInfo")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("common.category")}</Label>
                    <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                      <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{t(c.key)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("creadores.off.comments")}</Label>
                    <Textarea
                      rows={2}
                      value={form.comentarios}
                      onChange={(e) => setForm((f) => ({ ...f, comentarios: e.target.value }))}
                      placeholder={t("creadores.off.commentsPh")}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Motivos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">{t("cr.doubleExitReason")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: "motivo_operativo", label: t("creadores.off.reasonOperational"), placeholder: t("cr.operationalReasonPh") },
                  { key: "motivo_comercial", label: t("creadores.off.reasonCommercial"), placeholder: t("cr.commercialReasonPh") },
                  { key: "motivo_final", label: t("creadores.off.reasonFinal"), placeholder: t("creadores.off.reasonFinalPh") },
                ].map((m) => (
                  <div key={m.key} className="space-y-1.5">
                    <Label className="text-xs">{m.label}</Label>
                    <Textarea
                      rows={3}
                      value={form[m.key as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [m.key]: e.target.value }))}
                      placeholder={m.placeholder}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Approvals + Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> {t("creadores.off.approvals")}
                    <Badge variant="outline" className="text-[10px] ml-auto">{t("creadores.off.requiredOf2", { n: approvalCount })}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {approvals.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("cr.noApprovalsYet")}</p>
                  )}
                  {approvals.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition-colors">
                      <span className="text-sm font-medium">{getApproverName(a.approver_id)}</span>
                      {a.approved ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                          <Check className="h-3 w-3 mr-1" /> {t("creadores.off.approved")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{t("common.pending")}</Badge>
                      )}
                    </div>
                  ))}
                  {canApprove && !userAlreadyApproved && user?.id && (
                    <Button size="sm" className="w-full mt-2" onClick={handleApprove} disabled={approve.isPending}>
                      <ShieldCheck className="h-4 w-4 mr-1.5" />
                      {approve.isPending ? t("creadores.off.approving") : t("creadores.off.approve")}
                    </Button>
                  )}
                  {!canApprove && !userAlreadyApproved && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      {t("creadores.off.onlyApprovers")}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-warning" /> {t("cr.closureChecklist")}
                    <span className="text-xs text-muted-foreground ml-auto">{checklistDone}/{CHECKLIST_ITEMS.length}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={checklistPct} className="h-2" indicatorClassName="bg-warning" />
                  {CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 cursor-pointer hover:bg-white/10 hover:border-primary/40 transition-colors"
                    >
                      <Checkbox
                        checked={!!offboarding[item.key]}
                        onCheckedChange={() => handleChecklistToggle(item.key as keyof Offboarding)}
                      />
                      <span className={`text-sm ${offboarding[item.key] ? "line-through text-muted-foreground" : ""}`}>
                        {t(item.i18n)}
                      </span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Financial Impact */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-destructive" /> {t("creadores.off.financialImpact")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: t("cr.commLastRevenue"), value: impact.lastRevenue, color: "text-primary" },
                    { label: t("cr.commAvgMonthly"), value: impact.avgMonthly, color: "text-warning" },
                    { label: t("creadores.off.lostRevenue12m"), value: impact.estimatedLost, color: "text-destructive" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl border border-border p-4">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${m.color}`}>
                        ${m.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-3 pb-6">
              <Button onClick={handleSaveForm} disabled={updateOffboarding.isPending} className="gap-1.5">
                <Save className="h-4 w-4" />
                {updateOffboarding.isPending ? t("creadores.saving") : t("creadores.edit.saveChanges")}
              </Button>
              <Button variant="outline" onClick={generateComunicado} className="gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("creadores.off.copied") : t("creadores.off.generateAnnouncement")}
              </Button>
            </div>
          </main>
    </div>
  );
};

export default OffboardingDetailPage;
