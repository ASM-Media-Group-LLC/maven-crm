import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  UserCog,
  Users as UsersIcon,
  X,
  XCircle,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import {
  type SpammerAccount,
  type SpammerAccountAiAnalysis,
  type SpammerAccountAiRedFlag,
  useRescanSpammerAccount,
  useSpammerAccounts,
  useUploadSpammerScreenshots,
  useRemoveSpammerScreenshot,
  useDeleteSpammerAccount,
} from "@/hooks/useSpammerAccounts";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTenantProfiles } from "@/hooks/useAgencyQa";
import { useAuth } from "@/hooks/useAuth";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { toast } from "sonner";
import AddSpammerAccountDialog from "./AddSpammerAccountDialog";

// SpammerAccountsTab — vista del manager: lista de cuentas de IG que
// los spammers/scouters registraron, agrupadas por handle (cuando
// varios usan la misma cuenta, se muestra UNA card con la lista de
// closers que la operan). Cada card es clickeable y abre un popup
// con el análisis IA completo de credibilidad de agencia.
//
// Idioma: el texto de la pantalla sale de lib/i18n/leadgen.ts
// ("leadgen.igAccounts.*"), porque la pestaña se ve sobre todo desde "Mis
// Cuentas IG" de LeadGen. Lo que escribió la IA (resumen, fortalezas, red
// flags, recomendaciones) y el error del scan son DATOS guardados en la base:
// se muestran tal cual.

/** Un texto del diccionario con **dobles asteriscos** para la negrita: así cada
 *  frase es UNA clave y se traduce entera, sin partirla alrededor del <strong>. */
function ConNegrita({ texto, className }: { texto: string; className?: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
          <strong key={i} className={className}>{parte.slice(2, -2)}</strong>
        ) : (
          parte
        ),
      )}
    </>
  );
}

interface AggregatedAccount {
  // Datos agregados por handle (la representante es la fila más
  // reciente con scan completo, o cualquier una si ninguna scaneó).
  representative: SpammerAccount;
  // Lista de scouters / spammers que usan esta cuenta (deduplicada
  // por nombre).
  operators: Array<{ id: string; name: string }>;
  rowCount: number;
}

const SCORE_BUCKETS: Array<{
  label: TranslationKey;
  test: (score: number) => boolean;
  bg: string;
  ring: string;
  text: string;
}> = [
  { label: "leadgen.igAccounts.score.high", test: (s) => s >= 80, bg: "bg-emerald-500/15", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  { label: "leadgen.igAccounts.score.good", test: (s) => s >= 65, bg: "bg-sky-500/15", ring: "ring-sky-500/40", text: "text-sky-400" },
  { label: "leadgen.igAccounts.score.medium", test: (s) => s >= 45, bg: "bg-amber-500/15", ring: "ring-amber-500/40", text: "text-amber-400" },
  { label: "leadgen.igAccounts.score.low", test: (s) => s >= 25, bg: "bg-orange-500/15", ring: "ring-orange-500/40", text: "text-orange-400" },
  { label: "leadgen.igAccounts.score.veryLow", test: (_s) => true, bg: "bg-rose-500/15", ring: "ring-rose-500/40", text: "text-rose-400" },
];

// `label` es la CLAVE del nivel: se traduce al dibujarlo.
const scoreCfg = (score: number | null): { label: TranslationKey; bg: string; ring: string; text: string } => {
  if (score == null) return { label: "leadgen.igAccounts.score.none", bg: "bg-muted/40", ring: "ring-border", text: "text-muted-foreground" };
  return SCORE_BUCKETS.find((b) => b.test(score))!;
};

const fmtCount = (n: number | null | undefined, locale: string): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString(locale);
};

type StatPopupKind = "all" | "pending" | "failed";

// viewMode controla qué cuentas se muestran:
//   · "all" (default): muestra todas las cuentas accesibles vía RLS
//     (admin/manager ven todo el equipo, LG normal ve solo las suyas
//     porque RLS lo filtra). Cada card muestra la lista de operators.
//   · "mine": filtro CLIENT-SIDE adicional por user_id === currentUser.id
//     — fuerza "solo mis cuentas" incluso para admins/managers. Se usa
//     desde MisCuentasIGModal en LeadGen donde el contexto es "estás
//     mirando TU cuenta" sin importar tu rol.
// Cuando es "mine", esconde la lista de operators (sería redundante:
// solo aparece uno).
interface SpammerAccountsTabProps {
  viewMode?: "all" | "mine";
}

const SpammerAccountsTab = ({ viewMode = "all" }: SpammerAccountsTabProps = {}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const accountsQ = useSpammerAccounts();
  const profilesQ = useTenantProfiles();
  const rescan = useRescanSpammerAccount();
  const [search, setSearch] = useState("");
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const [statPopup, setStatPopup] = useState<StatPopupKind | null>(null);
  // Dialog para "+ Agregar cuenta" — solo se abre desde el grid cuando
  // viewMode === "mine" (un LG/admin agregando una cuenta propia).
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Agrupar por handle — cuando varios spammers usan la misma cuenta,
  // se muestra UNA sola card con la lista de operators (los user_id
  // de la fila se resuelven contra profiles.full_name).
  //
  // Cuando viewMode === "mine", filtramos primero a las rows donde
  // user_id === current user. Esto sobreescribe lo que RLS devolvió
  // (que para managers puede ser todo el equipo) — el LG / admin que
  // entra desde "Mis Cuentas IG" en LeadGen siempre ve solo las suyas.
  const aggregated = useMemo<AggregatedAccount[]>(() => {
    const allRows = accountsQ.data ?? [];
    const list = viewMode === "mine" && user?.id
      ? allRows.filter((a) => a.user_id === user.id)
      : allRows;
    const profileNameById = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p) => {
      if (p.full_name) profileNameById.set(p.id, p.full_name);
    });
    const byHandle = new Map<string, SpammerAccount[]>();
    list.forEach((a) => {
      const arr = byHandle.get(a.instagram_handle) ?? [];
      arr.push(a);
      byHandle.set(a.instagram_handle, arr);
    });
    const aggArr: AggregatedAccount[] = [];
    byHandle.forEach((rows, handle) => {
      // Representative: la fila con scan_status="done" más reciente, o
      // la primera (más reciente) si ninguna escaneó.
      const sorted = [...rows].sort((a, b) => {
        if (a.scan_status === "done" && b.scan_status !== "done") return -1;
        if (b.scan_status === "done" && a.scan_status !== "done") return 1;
        return (b.last_scanned_at ?? b.created_at).localeCompare(
          a.last_scanned_at ?? a.created_at,
        );
      });
      const operators = Array.from(
        new Map(
          rows
            .filter((r) => r.user_id)
            .map((r) => [r.user_id, { id: r.user_id, name: profileNameById.get(r.user_id) ?? t("leadgen.noNameParens") }]),
        ).values(),
      );
      aggArr.push({
        representative: sorted[0],
        operators,
        rowCount: rows.length,
      });
      // Avoid lint about unused `handle`
      void handle;
    });
    // Ordenar por score desc (más altos primero), luego por handle.
    aggArr.sort((a, b) => {
      const sa = a.representative.ai_score ?? -1;
      const sb = b.representative.ai_score ?? -1;
      if (sa !== sb) return sb - sa;
      return a.representative.instagram_handle.localeCompare(b.representative.instagram_handle);
    });
    return aggArr;
  }, [accountsQ.data, profilesQ.data, viewMode, user?.id, t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter((a) => {
      const r = a.representative;
      return (
        r.instagram_handle.includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        a.operators.some((o) => o.name.toLowerCase().includes(q))
      );
    });
  }, [aggregated, search]);

  // Listas para los popups de stat boxes.
  const pendingList = useMemo(
    () =>
      aggregated.filter(
        (a) => a.representative.scan_status === "pending" || a.representative.scan_status === "scanning",
      ),
    [aggregated],
  );
  const failedList = useMemo(
    () => aggregated.filter((a) => a.representative.scan_status === "failed"),
    [aggregated],
  );
  const popupTitle =
    statPopup === "all" ? t("leadgen.igAccounts.allAccounts") :
    statPopup === "pending" ? t("leadgen.igAccounts.waitingScan") :
    statPopup === "failed" ? t("leadgen.igAccounts.failed") : "";
  const popupList: AggregatedAccount[] =
    statPopup === "all" ? aggregated :
    statPopup === "pending" ? pendingList :
    statPopup === "failed" ? failedList : [];

  const stats = useMemo(() => {
    const list = aggregated;
    const scanned = list.filter((a) => a.representative.ai_score != null);
    const avgScore =
      scanned.length === 0
        ? 0
        : Math.round(
            scanned.reduce((s, a) => s + (a.representative.ai_score ?? 0), 0) / scanned.length,
          );
    return {
      totalUnique: list.length,
      avgScore,
      pending: list.filter((a) => a.representative.scan_status === "pending" || a.representative.scan_status === "scanning").length,
      failed: list.filter((a) => a.representative.scan_status === "failed").length,
    };
  }, [aggregated]);

  const openAcc = openHandle
    ? aggregated.find((a) => a.representative.instagram_handle === openHandle)
    : null;

  const handleRescan = async (id: string) => {
    try {
      await rescan.mutateAsync(id);
      toast.success(t("leadgen.igAccounts.rescanStarted"), {
        description: t("leadgen.igAccounts.rescanStartedDesc"),
      });
    } catch (err) {
      toast.error(t("leadgen.igAccounts.rescanError"), {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header compacto en una sola fila — title + hint + search.
          Antes tenía un avatar grande + descripción de 3 líneas que
          quitaba espacio cuando había cards. Ahora es una sola línea. */}
      <div className="flex flex-wrap items-center gap-2">
        <Instagram className="h-4 w-4 text-instagram-pink shrink-0" />
        <h2 className="text-sm font-semibold">
          {viewMode === "mine" ? t("leadgen.igAccounts.titleMine") : t("leadgen.igAccounts.titleAll")}
        </h2>
        <span
          className="text-[11px] text-muted-foreground"
          title={
            viewMode === "mine" ? t("leadgen.igAccounts.hintMine") : t("leadgen.igAccounts.hintAll")
          }
        >
          {t("leadgen.igAccounts.hintShort")}
        </span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={viewMode === "mine" ? t("leadgen.igAccounts.searchMine") : t("leadgen.igAccounts.searchAll")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label={t("leadgen.igAccounts.uniqueAccounts")}
          value={stats.totalUnique}
          icon={UsersIcon}
          color="indigo"
          onClick={() => setStatPopup("all")}
        />
        <StatBox
          label={t("leadgen.igAccounts.avgScore")}
          value={stats.avgScore || "—"}
          icon={TrendingUp}
          color={
            stats.avgScore >= 65 ? "emerald" :
            stats.avgScore >= 45 ? "amber" :
            stats.avgScore > 0   ? "rose" : "sky"
          }
        />
        <StatBox
          label={t("leadgen.igAccounts.waitingScan")}
          value={stats.pending}
          icon={Loader2}
          color="amber"
          onClick={() => setStatPopup("pending")}
          spinning={stats.pending > 0}
        />
        <StatBox
          label={t("leadgen.igAccounts.failed")}
          value={stats.failed}
          icon={XCircle}
          color="rose"
          onClick={() => setStatPopup("failed")}
        />
      </div>

      {accountsQ.isLoading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("leadgen.igAccounts.loading")}
        </Card>
      ) : filtered.length === 0 ? (
        // Empty state. Cuando es viewMode='mine' mostramos un CTA directo
        // a agregar cuenta (en vez del mensaje genérico "completá el
        // asistente"). Para Panel de Control general (viewMode='all') sin
        // resultados, dejamos el copy original.
        <Card>
          <EmptyState
            seed="spammer-cuentas"
            title={
              aggregated.length === 0
                ? viewMode === "mine"
                  ? t("leadgen.igAccounts.emptyMine")
                  : t("leadgen.igAccounts.emptyAll")
                : t("leadgen.igAccounts.noSearchResults")
            }
            description={
              aggregated.length === 0
                ? viewMode === "mine"
                  ? t("leadgen.igAccounts.emptyMineDesc")
                  : t("leadgen.igAccounts.emptyAllDesc")
                : t("leadgen.igAccounts.noSearchResultsDesc")
            }
            action={
              viewMode === "mine" && aggregated.length === 0 ? (
                <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("leadgen.igAccounts.addFirst")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Card "+" — solo en viewMode='mine'. Va PRIMERA para que sea
              el primer elemento que ven los LGs cuando abren el modal. */}
          {viewMode === "mine" && (
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              className="group flex min-h-[212px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 p-4 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 transition-colors group-hover:bg-primary/15">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">{t("leadgen.igAccounts.addAccount")}</span>
              <span className="max-w-[180px] text-center text-[11px] leading-tight">
                {t("leadgen.igAccounts.addAccountHint")}
              </span>
            </button>
          )}
          {filtered.map((a) => (
            <SpammerCard
              key={a.representative.instagram_handle}
              account={a}
              hideOperators={viewMode === "mine"}
              onClick={() => setOpenHandle(a.representative.instagram_handle)}
            />
          ))}
        </div>
      )}

      {/* Dialog de agregar cuenta — solo se abre desde la card "+" en
          viewMode='mine'. Si lo van a necesitar también en Panel de
          Control, hay que sumar un botón en el header. */}
      <AddSpammerAccountDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      <SpammerDetailDialog
        open={!!openAcc}
        onOpenChange={(o) => !o && setOpenHandle(null)}
        account={openAcc ?? null}
        onRescan={handleRescan}
        rescanning={rescan.isPending}
      />

      <StatListDialog
        open={!!statPopup}
        onOpenChange={(o) => !o && setStatPopup(null)}
        kind={statPopup}
        title={popupTitle}
        items={popupList}
        onRescan={handleRescan}
        onOpenDetail={(handle) => {
          setStatPopup(null);
          setOpenHandle(handle);
        }}
        rescanning={rescan.isPending}
      />
    </div>
  );
};

// ─── Card ───────────────────────────────────────────────────────────

const SpammerCard = ({
  account,
  onClick,
  hideOperators = false,
}: {
  account: AggregatedAccount;
  onClick: () => void;
  hideOperators?: boolean;
}) => {
  const f = useFormato();
  const { t } = useLanguage();
  const r = account.representative;
  const cfg = scoreCfg(r.ai_score);
  const isScanning = r.scan_status === "pending" || r.scan_status === "scanning";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteAccount = useDeleteSpammerAccount();

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-lg cursor-pointer"
    >
      {/* Botón eliminar — arriba a la derecha. stopPropagation para no
          disparar el onClick de la card (que abre el detalle). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(true);
        }}
        title={t("leadgen.igAccounts.deleteThis")}
        aria-label={t("leadgen.igAccounts.deleteThis")}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* Header: avatar + score circle */}
      <div className="flex items-start gap-3 p-4 pr-10">
        <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate font-mono text-sm font-semibold">@{r.instagram_handle}</span>
            {r.is_verified && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            {r.is_restricted && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-bold bg-destructive/20 text-destructive"
                title={t("leadgen.igAccounts.restrictedHint")}
              >
                <Lock className="h-2.5 w-2.5" />
                {t("leadgen.igAccounts.restricted")}
              </span>
            )}
            {!r.is_restricted && r.scan_status === "awaiting_screenshot" && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-bold bg-warning/20 text-warning"
                title={t("leadgen.igAccounts.notReadHint")}
              >
                <AlertCircle className="h-2.5 w-2.5" />
                {t("leadgen.igAccounts.notRead")}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {r.display_name ?? "—"}
          </p>
        </div>
        <ScoreBadge score={r.ai_score} cfg={cfg} />
      </div>

      {/* Métricas IG */}
      <div className="grid grid-cols-3 gap-1 px-4 pb-3 text-center">
        <Metric label="Followers" value={fmtCount(r.followers_count, f.intl("es-ES"))} />
        <Metric label="Following" value={fmtCount(r.following_count, f.intl("es-ES"))} />
        <Metric label="Posts" value={fmtCount(r.posts_count, f.intl("es-ES"))} />
      </div>

      {/* Summary IA + estado */}
      <div className="border-t border-border/60 bg-muted/20 p-3">
        {isScanning ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("leadgen.igAccounts.scanning")}
          </div>
        ) : r.scan_status === "failed" ? (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{r.scan_error ?? t("leadgen.igAccounts.scanFailed")}</span>
          </div>
        ) : !r.is_restricted && r.scan_status === "awaiting_screenshot" ? (
          <div className="flex items-start gap-1.5 text-xs text-warning">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              {t("leadgen.igAccounts.couldNotRead")}
            </span>
          </div>
        ) : r.ai_analysis ? (
          <p className="line-clamp-2 text-xs leading-snug text-foreground/85">
            {r.ai_analysis.summary}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">{t("leadgen.igAccounts.noAnalysisYet")}</p>
        )}
      </div>

      {/* Footer: operators — escondido en viewMode='mine' (sería
          redundante: el único operator que ves eres tú). */}
      {!hideOperators && (
        <div className="flex items-center gap-1.5 border-t border-border/60 bg-card px-4 py-2 text-[11px] text-muted-foreground">
          <UserCog className="h-3 w-3" />
          {account.operators.length === 0 ? (
            <span className="italic">{t("leadgen.igAccounts.noScouter")}</span>
          ) : account.operators.length === 1 ? (
            <span className="truncate">{account.operators[0].name}</span>
          ) : (
            <span className="truncate">
              {t("leadgen.igAccounts.scoutersUseIt", { count: account.operators.length })}
            </span>
          )}
        </div>
      )}
    </div>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("leadgen.igAccounts.deleteTitle", { handle: r.instagram_handle })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("leadgen.igAccounts.deleteDesc")}
            <br /><br />
            {t("leadgen.igAccounts.deleteDescShared")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAccount.isPending} />
          <AlertDialogAction
            disabled={deleteAccount.isPending}
            onClick={(e) => {
              e.preventDefault();
              deleteAccount.mutate(r.id, {
                onSuccess: () => setConfirmDelete(false),
              });
            }}
            className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
          >
            {deleteAccount.isPending ? t("leadgen.delete.deleting") : t("leadgen.igAccounts.confirmDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

const Avatar = ({ src, fallback, size = 48 }: { src: string | null; fallback: string; size?: number }) => {
  const initial = fallback.charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-sm ring-2 ring-primary/20"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={fallback}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-base font-semibold">{initial}</span>
      )}
    </span>
  );
};

const ScoreBadge = ({
  score,
  cfg,
}: {
  score: number | null;
  cfg: { bg: string; ring: string; text: string; label: string };
}) => (
  <div
    className={cn(
      "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full ring-2",
      cfg.bg,
      cfg.ring,
    )}
  >
    <span className={cn("text-base font-bold tabular-nums", cfg.text)}>
      {score != null ? score : "—"}
    </span>
    <span className={cn("text-[10px] font-bold", cfg.text)}>
      {score != null ? "Score" : "N/A"}
    </span>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/40 bg-background/40 py-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-xs font-semibold tabular-nums">{value}</div>
  </div>
);

// StatBox — mismo estilo que las hero cards del subtab "Reclutamiento
// modelos" del Panel de control: borde 2px coloreado, blur orb en
// la esquina, hover lift + glow. Si tiene onClick, además es interactivo
// y soporta estado active (highlight más fuerte).
//
// Paletas predefinidas para los 4 colores que usamos.
const COLOR_STYLES: Record<
  "indigo" | "cyan" | "emerald" | "amber" | "rose" | "sky",
  {
    border: string;
    borderActive: string;
    borderHover: string;
    bg: string;
    iconBg: string;
    glow: string;
  }
> = {
  indigo: {
    border: "border-indigo-500/30",
    borderActive: "border-indigo-500/70",
    borderHover: "hover:border-indigo-500/60",
    bg: "bg-indigo-500",
    iconBg: "bg-indigo-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.4)]",
  },
  cyan: {
    border: "border-cyan-500/30",
    borderActive: "border-cyan-500/70",
    borderHover: "hover:border-cyan-500/60",
    bg: "bg-cyan-500",
    iconBg: "bg-cyan-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.4)]",
  },
  emerald: {
    border: "border-emerald-500/30",
    borderActive: "border-emerald-500/70",
    borderHover: "hover:border-emerald-500/60",
    bg: "bg-emerald-500",
    iconBg: "bg-emerald-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.4)]",
  },
  amber: {
    border: "border-amber-500/30",
    borderActive: "border-amber-500/70",
    borderHover: "hover:border-amber-500/60",
    bg: "bg-amber-500",
    iconBg: "bg-amber-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.4)]",
  },
  rose: {
    border: "border-rose-500/30",
    borderActive: "border-rose-500/70",
    borderHover: "hover:border-rose-500/60",
    bg: "bg-rose-500",
    iconBg: "bg-rose-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(244,63,94,0.4)]",
  },
  sky: {
    border: "border-sky-500/30",
    borderActive: "border-sky-500/70",
    borderHover: "hover:border-sky-500/60",
    bg: "bg-sky-500",
    iconBg: "bg-sky-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(14,165,233,0.4)]",
  },
};

const StatBox = ({
  label,
  value,
  icon: Icon,
  color,
  onClick,
  active,
  spinning,
}: {
  label: string;
  value: number | string;
  icon: typeof UsersIcon;
  color: keyof typeof COLOR_STYLES;
  onClick?: () => void;
  active?: boolean;
  spinning?: boolean;
}) => {
  const cfg = COLOR_STYLES[color];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card px-3 py-2.5 text-left transition-all duration-200",
        active ? cfg.borderActive : cfg.border,
        onClick && "cursor-pointer",
        onClick && cfg.borderHover,
        onClick && cfg.glow,
        active && "shadow-[0_0_16px_-4px_rgba(255,255,255,0.15)]",
      )}
    >
      <div className="relative flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
            cfg.iconBg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-foreground/70 font-semibold leading-tight">
            {label}
          </p>
          <p className="text-base font-bold tabular-nums leading-tight">
            {value}
          </p>
        </div>
      </div>
    </Tag>
  );
};

// ─── Restricted recovery guide ────────────────────────────────────
// Guía accionable que aparece cuando is_restricted=true. Reemplaza
// el "subir screenshots" como acción principal — el user dijo que si
// la cuenta está restringida, los DMs caen en spam de la creadora,
// así que no sirve mucho enriquecer el análisis: lo importante es
// recuperar la cuenta o cambiarla.
//
// Pasos basados en research + experiencia operativa. Si la cuenta es
// muy nueva con muchos posts NSFW reportados, lo mejor suele ser
// abandonar y crear una nueva con setup correcto — esto también se
// menciona como opción.

const RestrictedRecoveryGuide = () => {
  const { t } = useLanguage();
  const fuerte = "text-foreground";
  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-success" />
        <h3 className="text-xs font-bold text-success">
          {t("leadgen.igAccounts.guide.title")}
        </h3>
      </div>

      <div className="space-y-3 text-xs">
        <div>
          <p className="font-semibold text-foreground mb-1">
            {t("leadgen.igAccounts.guide.decisionTitle")}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <ConNegrita texto={t("leadgen.igAccounts.guide.decisionBody")} className={fuerte} />
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">
            {t("leadgen.igAccounts.guide.ifRecover")}
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground marker:text-success">
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step1")} className={fuerte} /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step2")} className={fuerte} /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step3")} className={fuerte} /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step4")} className={fuerte} /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step5")} className={fuerte} /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step6")} className="text-foreground text-destructive" /></li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.step7")} className={fuerte} /></li>
          </ol>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">
            {t("leadgen.igAccounts.guide.ifAbandon")}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground marker:text-success">
            <li>{t("leadgen.igAccounts.guide.fresh1")}</li>
            <li>{t("leadgen.igAccounts.guide.fresh2")}</li>
            <li><ConNegrita texto={t("leadgen.igAccounts.guide.fresh3")} className="text-destructive" /></li>
            <li>{t("leadgen.igAccounts.guide.fresh4")}</li>
          </ul>
        </div>

        <div className="rounded-md bg-warning/10 border border-warning/30 p-2 text-[11px] text-warning">
          <ConNegrita texto={t("leadgen.igAccounts.guide.rules")} />
        </div>
      </div>
    </div>
  );
};

// ─── Restricted screenshot zone ────────────────────────────────────
// Para cuentas que IG marcó como restricted (no podemos scrapear bio /
// pic / followers sin cookies), el user sube un screenshot logueado del
// perfil. Claude vision extrae la data y el AI corre el análisis con
// la cuenta real, no con un snapshot vacío.

const RestrictedScreenshotZone = ({ account }: { account: SpammerAccount }) => {
  const { t } = useLanguage();
  const uploadMut = useUploadSpammerScreenshots();
  const removeMut = useRemoveSpammerScreenshot();
  const paths = account.manual_screenshot_paths ?? [];
  const hasScreenshots = paths.length > 0;
  const awaiting = account.scan_status === "awaiting_screenshot";
  // Cache de signed URLs por path. Cada thumbnail necesita una URL
  // firmada porque el bucket scouter-screenshots es privado.
  const [urlsByPath, setUrlsByPath] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) {
      setUrlsByPath({});
      return;
    }
    (async () => {
      const missing = paths.filter((p) => !urlsByPath[p]);
      if (missing.length === 0) return;
      const updates: Record<string, string> = {};
      for (const path of missing) {
        const { data } = await supabase.storage
          .from("scouter-screenshots")
          .createSignedUrl(path, 60 * 60);
        if (data?.signedUrl) updates[path] = data.signedUrl;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setUrlsByPath((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|")]);

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        toast.error(t("leadgen.igAccounts.notAnImage", { name: f.name }));
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(t("leadgen.igAccounts.tooLarge", { name: f.name }));
        return;
      }
    }
    uploadMut.mutate({ accountId: account.id, files, existingPaths: paths });
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-4 transition-colors space-y-3",
        hasScreenshots
          ? "border-success/40 bg-success/5"
          : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles
          className={cn(
            "h-5 w-5 mt-0.5 shrink-0",
            hasScreenshots ? "text-success" : "text-warning",
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-1">
            {hasScreenshots
              ? t(
                  paths.length === 1
                    ? "leadgen.igAccounts.screenshotsLoaded.one"
                    : "leadgen.igAccounts.screenshotsLoaded.other",
                  { count: paths.length },
                )
              : awaiting
              ? t("leadgen.igAccounts.pasteScreenshots")
              : t("leadgen.igAccounts.improveWithScreenshots")}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            {account.is_restricted
              ? t("leadgen.igAccounts.screenshotsRestrictedHint")
              : t("leadgen.igAccounts.screenshotsUnreadHint")}
          </p>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploadMut.isPending}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                handleFiles(files);
                // Limpia el input para que el mismo file pueda re-subirse
                // si el user lo quiere (típico al editar).
                e.target.value = "";
              }}
            />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                uploadMut.isPending
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : hasScreenshots
                  ? "bg-success/20 text-success hover:bg-success/30"
                  : "bg-warning/20 text-warning hover:bg-warning/30",
              )}
            >
              {uploadMut.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("leadgen.igAccounts.uploading")}
                </>
              ) : hasScreenshots ? (
                t("leadgen.igAccounts.addMoreScreenshots")
              ) : (
                t("leadgen.igAccounts.uploadScreenshots")
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Galería de thumbnails con X para remover. Grid responsivo,
          aspect-square para que las miniaturas sean uniformes aunque las
          fuentes sean de aspecto distinto. */}
      {hasScreenshots && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {paths.map((path) => {
            const url = urlsByPath[path];
            const removing =
              removeMut.isPending && removeMut.variables?.path === path;
            return (
              <div
                key={path}
                className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-muted"
              >
                {url ? (
                  <img
                    src={url}
                    alt={t("leadgen.igAccounts.profileScreenshot")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    removeMut.mutate({
                      accountId: account.id,
                      path,
                      existingPaths: paths,
                    })
                  }
                  disabled={removing}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                  aria-label={t("leadgen.igAccounts.removeScreenshot")}
                  title={t("leadgen.igAccounts.removeScreenshot")}
                >
                  {removing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Detail dialog ─────────────────────────────────────────────────

const SEVERITY_STYLE: Record<SpammerAccountAiRedFlag["severity"], string> = {
  low: "bg-warning/15 text-warning",
  medium: "bg-orange-500/15 text-orange-400",
  high: "bg-destructive/15 text-destructive",
};

// La llave (si / tal_vez / no) es lo que devuelve la IA: dato. `label` es la clave.
const WOULD_RESPOND_STYLE: Record<NonNullable<SpammerAccountAiAnalysis["would_respond"]>, { label: TranslationKey; cls: string }> = {
  si: { label: "leadgen.igAccounts.wouldReply", cls: "bg-success/15 text-success" },
  tal_vez: { label: "leadgen.igAccounts.mightReply", cls: "bg-warning/15 text-warning" },
  no: { label: "leadgen.igAccounts.wouldNotReply", cls: "bg-destructive/15 text-destructive" },
};

const SpammerDetailDialog = ({
  open,
  onOpenChange,
  account,
  onRescan,
  rescanning,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AggregatedAccount | null;
  onRescan: (id: string) => void;
  rescanning: boolean;
}) => {
  const f = useFormato();
  const { t } = useLanguage();
  if (!account) return null;
  const r = account.representative;
  const a = r.ai_analysis;
  const cfg = scoreCfg(r.ai_score);
  const wr = a?.would_respond ? WOULD_RESPOND_STYLE[a.would_respond] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={56} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <a
                  href={r.instagram_url || `https://instagram.com/${r.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-base hover:text-instagram-pink transition-colors"
                >
                  @{r.instagram_handle}
                </a>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                {r.is_verified && (
                  <span title={t("leadgen.igAccounts.verified")} aria-label={t("leadgen.igAccounts.verified")}>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {r.display_name ?? t("leadgen.igAccounts.noDisplayName")} · {fmtCount(r.followers_count, f.intl("es-ES"))} followers ·{" "}
                {fmtCount(r.following_count, f.intl("es-ES"))} following · {fmtCount(r.posts_count, f.intl("es-ES"))} posts
              </DialogDescription>
            </div>
            <ScoreBadge score={r.ai_score} cfg={cfg} />
          </div>
        </DialogHeader>

        {/* Restricted banner — deal-breaker para outreach */}
        {r.is_restricted && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-destructive text-xs block mb-1">
                  {t("leadgen.igAccounts.restrictedBannerTitle")}
                </span>
                <span className="text-foreground/80">
                  {t("leadgen.igAccounts.restrictedBannerBody")}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Guía de recuperación — acciones concretas para sacar el flag de IG */}
        {r.is_restricted && <RestrictedRecoveryGuide />}

        {/* Screenshot drop-zone — opcional, para enriquecer el análisis si
            el user quiere subir capturas del perfil logueado. Movido a
            sección secundaria porque ya no es la acción principal. */}
        {r.is_restricted && (
          <details className="rounded-lg border border-border bg-card/40 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
              {t("leadgen.igAccounts.enrichOptional")}
            </summary>
            <div className="mt-3">
              <RestrictedScreenshotZone account={r} />
            </div>
          </details>
        )}

        {/* No pudimos leer (NO es restricción real) — cuenta nueva o IG
            bloqueó la lectura. El closer reintenta el scan o sube un
            screenshot de su propia cuenta logueada para analizarla igual. */}
        {!r.is_restricted && r.scan_status === "awaiting_screenshot" && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-warning text-xs block mb-1">
                  {t("leadgen.igAccounts.unreadBannerTitle")}
                </span>
                <span className="text-foreground/80">
                  <ConNegrita texto={t("leadgen.igAccounts.unreadBannerBody")} />
                </span>
              </div>
            </div>
            <RestrictedScreenshotZone account={r} />
          </div>
        )}

        {/* Bio */}
        {r.bio && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs italic text-foreground/80">
            "{r.bio}"
          </div>
        )}

        {/* Analysis */}
        {a ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {wr && (
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", wr.cls)}>
                  {t(wr.label)}
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", cfg.bg, cfg.text)}>
                <Sparkles className="h-3 w-3" />
                {t(cfg.label)}
              </span>
              {r.last_scanned_at && (
                <span className="text-[11px] text-muted-foreground">
                  {t("leadgen.igAccounts.scannedOn", {
                    date: new Date(r.last_scanned_at).toLocaleDateString(f.intl("es-AR"), { day: "2-digit", month: "short", year: "numeric" }),
                  })}
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed">
              <span className="text-xs font-bold text-primary mr-2">{t("leadgen.perf.summary")}</span>
              {a.summary}
            </p>

            {a.would_respond === "no" && a.why_not && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-xs font-bold text-destructive mb-1">
                  {t("leadgen.igAccounts.whyNot")}
                </div>
                <p className="text-sm">{a.why_not}</p>
              </div>
            )}

            {a.urgent_improvements && a.urgent_improvements.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="text-xs font-bold text-warning mb-2">
                  {t("leadgen.igAccounts.urgentImprovements")}
                </div>
                <ul className="space-y-1 pl-4 list-disc text-sm marker:text-warning">
                  {a.urgent_improvements.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {a.strengths.length > 0 && (
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="text-xs font-bold text-success mb-2">
                    {t("leadgen.igAccounts.strengths")}
                  </div>
                  <ul className="space-y-1 pl-4 list-disc text-xs marker:text-success">
                    {a.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.red_flags.length > 0 && (
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs font-bold text-muted-foreground mb-2">
                    Red flags
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {a.red_flags.map((rf, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold capitalize", SEVERITY_STYLE[rf.severity])}>
                          {rf.severity}
                        </span>
                        <span>{rf.signal}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {a.recommendations.length > 0 && (
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs font-bold text-muted-foreground mb-2">
                  {t("leadgen.igAccounts.recommendations")}
                </div>
                <ul className="space-y-1 pl-4 list-disc text-xs marker:text-muted-foreground">
                  {a.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs italic text-muted-foreground">
            {r.scan_status === "failed"
              ? t("leadgen.igAccounts.scanFailedWith", { error: r.scan_error ?? t("leadgen.igAccounts.unknownError") })
              : r.scan_status === "scanning" || r.scan_status === "pending"
                ? t("leadgen.igAccounts.scanInProgress")
                : t("leadgen.igAccounts.noAiAnalysis")}
          </div>
        )}

        {/* Operators */}
        <div className="rounded-md border border-border/40 p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            {t("leadgen.igAccounts.scoutersUsing", { count: account.operators.length })}
          </div>
          {account.operators.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">{t("leadgen.igAccounts.noScouterDot")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {account.operators.map((op) => (
                <li
                  key={op.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-1 text-xs"
                >
                  <UserCog className="h-3 w-3 text-muted-foreground" />
                  {op.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRescan(r.id)}
            disabled={rescanning || r.scan_status === "scanning"}
            className="gap-1.5"
          >
            {rescanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("leadgen.igAccounts.rescanNow")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// StatListDialog — popup que se abre desde los stat boxes. Muestra un
// listado compacto de las cuentas correspondientes al stat clickeado.
// Para "pending" y "failed" el popup permite re-escanear individual o
// en lote (botón "Re-escanear todas"). Click en una row → cierra el
// popup y abre el detail dialog.
interface StatListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: StatPopupKind | null;
  title: string;
  items: AggregatedAccount[];
  onRescan: (id: string) => void;
  onOpenDetail: (handle: string) => void;
  rescanning: boolean;
}

const StatListDialog = ({
  open,
  onOpenChange,
  kind,
  title,
  items,
  onRescan,
  onOpenDetail,
  rescanning,
}: StatListDialogProps) => {
  const { t } = useLanguage();
  const showRescan = kind === "pending" || kind === "failed";
  const uno = items.length === 1;
  const resumen =
    kind === "pending"
      ? t(uno ? "leadgen.igAccounts.list.pending.one" : "leadgen.igAccounts.list.pending.other", { count: items.length })
      : kind === "failed"
        ? t(uno ? "leadgen.igAccounts.list.failed.one" : "leadgen.igAccounts.list.failed.other", { count: items.length })
        : kind === "all"
          ? t(uno ? "leadgen.igAccounts.list.all.one" : "leadgen.igAccounts.list.all.other", { count: items.length })
          : t(uno ? "leadgen.igAccounts.list.count.one" : "leadgen.igAccounts.list.count.other", { count: items.length });

  const rescanAll = () => {
    items.forEach((a) => onRescan(a.representative.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-xs">
                {resumen}
              </DialogDescription>
            </div>
            {showRescan && items.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={rescanAll}
                disabled={rescanning}
              >
                {rescanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("leadgen.igAccounts.list.rescanAll")}
              </Button>
            )}
          </div>
        </DialogHeader>
        {items.length === 0 ? (
          <EmptyState
            className="rounded-md border border-border/40 bg-muted/20 py-8"
            icon={<Instagram className="h-8 w-8 text-muted-foreground" />}
            title={
              kind === "pending"
                ? t("leadgen.igAccounts.list.emptyPending")
                : kind === "failed"
                  ? t("leadgen.igAccounts.list.emptyFailed")
                  : t("leadgen.igAccounts.list.emptyAll")
            }
          />
        ) : (
          <ul className="divide-y divide-border/40 rounded-md border border-border/40">
            {items.map((a) => {
              const r = a.representative;
              const cfg = scoreCfg(r.ai_score);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenDetail(r.instagram_handle)}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                    title={t("common.viewDetail")}
                  >
                    <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs font-semibold">
                          @{r.instagram_handle}
                        </span>
                        {r.is_verified && (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
                        )}
                        {r.is_restricted && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold bg-destructive/20 text-destructive"
                            title={t("leadgen.igAccounts.restrictedTargetHint")}
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {t("leadgen.igAccounts.restricted")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {r.display_name && <span className="truncate">{r.display_name}</span>}
                        {r.display_name && a.operators.length > 0 && <span>·</span>}
                        {a.operators.length > 0 && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <UserCog className="h-3 w-3" />
                            {a.operators.length === 1
                              ? a.operators[0].name
                              : `${a.operators.length} scouters`}
                          </span>
                        )}
                      </div>
                      {r.scan_status === "failed" && r.scan_error && (
                        <div className="mt-0.5 flex items-start gap-1 text-[10px] text-destructive">
                          <AlertCircle className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{r.scan_error}</span>
                        </div>
                      )}
                    </div>
                  </button>
                  {/* Score badge — solo si tiene scan completo. */}
                  {r.ai_score != null && (
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 text-xs font-bold tabular-nums",
                        cfg.bg,
                        cfg.ring,
                        cfg.text,
                      )}
                    >
                      {r.ai_score}
                    </span>
                  )}
                  {/* Botón rescan individual para pending/failed. */}
                  {showRescan && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      disabled={rescanning || r.scan_status === "scanning"}
                      onClick={() => onRescan(r.id)}
                      title={t("leadgen.igAccounts.list.rescanThis")}
                    >
                      {r.scan_status === "scanning" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="text-[11px]">{t("leadgen.igAccounts.list.scan")}</span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SpammerAccountsTab;
