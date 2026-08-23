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
import { toast } from "sonner";
import AddSpammerAccountDialog from "./AddSpammerAccountDialog";

// SpammerAccountsTab — vista del manager: lista de cuentas de IG que
// los spammers/scouters registraron, agrupadas por handle (cuando
// varios usan la misma cuenta, se muestra UNA card con la lista de
// closers que la operan). Cada card es clickeable y abre un popup
// con el análisis IA completo de credibilidad de agencia.

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
  label: string;
  test: (score: number) => boolean;
  bg: string;
  ring: string;
  text: string;
}> = [
  { label: "Alto", test: (s) => s >= 80, bg: "bg-emerald-500/15", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  { label: "Bueno", test: (s) => s >= 65, bg: "bg-sky-500/15", ring: "ring-sky-500/40", text: "text-sky-400" },
  { label: "Medio", test: (s) => s >= 45, bg: "bg-amber-500/15", ring: "ring-amber-500/40", text: "text-amber-400" },
  { label: "Bajo", test: (s) => s >= 25, bg: "bg-orange-500/15", ring: "ring-orange-500/40", text: "text-orange-400" },
  { label: "Muy bajo", test: (_s) => true, bg: "bg-rose-500/15", ring: "ring-rose-500/40", text: "text-rose-400" },
];

const scoreCfg = (score: number | null) => {
  if (score == null) return { label: "Sin scan", bg: "bg-muted/40", ring: "ring-border", text: "text-muted-foreground" };
  return SCORE_BUCKETS.find((b) => b.test(score))!;
};

const fmtCount = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("es");
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
            .map((r) => [r.user_id, { id: r.user_id, name: profileNameById.get(r.user_id) ?? "(sin nombre)" }]),
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
  }, [accountsQ.data, profilesQ.data]);

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
    statPopup === "all" ? "Todas las cuentas" :
    statPopup === "pending" ? "Esperando scan" :
    statPopup === "failed" ? "Fallidas" : "";
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
      toast.success("Re-escaneo en marcha", {
        description: "Vuelve en unos segundos a ver el resultado.",
      });
    } catch (err) {
      toast.error("No se pudo re-escanear", {
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
        <Instagram className="h-4 w-4 text-pink-400 shrink-0" />
        <h2 className="text-sm font-semibold">
          {viewMode === "mine" ? "Mis cuentas IG" : "Salud de Cuentas IG"}
        </h2>
        <span
          className="text-[11px] text-muted-foreground"
          title={
            viewMode === "mine"
              ? "Tus cuentas de IG que usas para outreach. Cada cuenta se escanea con IA que evalúa qué tan creíble se ve para que las creadoras respondan. Click en una card para ver el análisis del scan."
              : "Cuentas de IG que el equipo usa para outreach (LGs/scouters). Cada cuenta se escanea con IA (Sonnet 4.6) que evalúa qué tan creíble se ve para que las creadoras objetivo respondan. Click en una card para ver el detalle del análisis."
          }
        >
          · IA escanea cada cuenta nueva — click en una card para ver el análisis completo
        </span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={viewMode === "mine" ? "Buscar handle o nombre…" : "Buscar handle, nombre, scouter…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="Cuentas únicas"
          value={stats.totalUnique}
          icon={UsersIcon}
          color="indigo"
          onClick={() => setStatPopup("all")}
        />
        <StatBox
          label="Score promedio"
          value={stats.avgScore || "—"}
          icon={TrendingUp}
          color={
            stats.avgScore >= 65 ? "emerald" :
            stats.avgScore >= 45 ? "amber" :
            stats.avgScore > 0   ? "rose" : "sky"
          }
        />
        <StatBox
          label="Esperando scan"
          value={stats.pending}
          icon={Loader2}
          color="amber"
          onClick={() => setStatPopup("pending")}
          spinning={stats.pending > 0}
        />
        <StatBox
          label="Fallidas"
          value={stats.failed}
          icon={XCircle}
          color="rose"
          onClick={() => setStatPopup("failed")}
        />
      </div>

      {accountsQ.isLoading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas…
        </Card>
      ) : filtered.length === 0 ? (
        // Empty state. Cuando es viewMode='mine' mostramos un CTA directo
        // a agregar cuenta (en vez del mensaje genérico "completá el
        // asistente"). Para Panel de Control general (viewMode='all') sin
        // resultados, dejamos el copy original.
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Instagram className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {aggregated.length === 0
              ? viewMode === "mine"
                ? "Todavía no tienes cuentas registradas"
                : "Todavía no hay cuentas registradas"
              : "Sin resultados para esa búsqueda"}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {aggregated.length === 0
              ? viewMode === "mine"
                ? "Agrega tu primera cuenta de Instagram para que la IA evalúe qué tan creíble se ve."
                : "Cuando un scouter agregue su primera cuenta en Scouter Assist > Cuentas, aparecerá acá con su análisis IA."
              : "Prueba con otro handle, nombre o scouter."}
          </p>
          {viewMode === "mine" && aggregated.length === 0 && (
            <Button
              size="sm"
              className="mt-2 gap-1.5"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Agregar mi primera cuenta
            </Button>
          )}
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
              <span className="text-sm font-medium">Agregar cuenta</span>
              <span className="max-w-[180px] text-center text-[11px] leading-tight">
                Suma una cuenta IG. La IA la escanea automático.
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
      className="group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all duration-200 hover:scale-[1.015] hover:border-primary/40 hover:shadow-lg cursor-pointer"
    >
      {/* Botón eliminar — arriba a la derecha. stopPropagation para no
          disparar el onClick de la card (que abre el detalle). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(true);
        }}
        title="Eliminar esta cuenta"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100 focus:opacity-100"
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
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            )}
            {r.is_restricted && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300"
                title="IG marcó la cuenta como restringida — oculta a viewers no-loggeados."
              >
                <Lock className="h-2.5 w-2.5" />
                Restringida
              </span>
            )}
            {!r.is_restricted && r.scan_status === "awaiting_screenshot" && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300"
                title="No pudimos leer el perfil automáticamente. Reintenta el scan o sube un screenshot — no significa que esté restringida."
              >
                <AlertCircle className="h-2.5 w-2.5" />
                Sin leer
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
        <Metric label="Followers" value={fmtCount(r.followers_count)} />
        <Metric label="Following" value={fmtCount(r.following_count)} />
        <Metric label="Posts" value={fmtCount(r.posts_count)} />
      </div>

      {/* Summary IA + estado */}
      <div className="border-t border-border/60 bg-muted/20 p-3">
        {isScanning ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Escaneando con IA…
          </div>
        ) : r.scan_status === "failed" ? (
          <div className="flex items-start gap-1.5 text-xs text-rose-400">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{r.scan_error ?? "Scan fallido"}</span>
          </div>
        ) : !r.is_restricted && r.scan_status === "awaiting_screenshot" ? (
          <div className="flex items-start gap-1.5 text-xs text-amber-400">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              No se pudo leer — reintenta el scan o sube un screenshot.
            </span>
          </div>
        ) : r.ai_analysis ? (
          <p className="line-clamp-2 text-xs leading-snug text-foreground/85">
            {r.ai_analysis.summary}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">Sin análisis todavía.</p>
        )}
      </div>

      {/* Footer: operators — escondido en viewMode='mine' (sería
          redundante: el único operator que ves sos vos). */}
      {!hideOperators && (
        <div className="flex items-center gap-1.5 border-t border-border/60 bg-card px-4 py-2 text-[11px] text-muted-foreground">
          <UserCog className="h-3 w-3" />
          {account.operators.length === 0 ? (
            <span className="italic">Sin scouter asignado</span>
          ) : account.operators.length === 1 ? (
            <span className="truncate">{account.operators[0].name}</span>
          ) : (
            <span className="truncate">
              {account.operators.length} scouters la usan
            </span>
          )}
        </div>
      )}
    </div>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar @{r.instagram_handle}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta cuenta dejará de aparecer en "Mis Cuentas IG" y no se usará más
            para outreach. Si la quemaron en IG y quieres agregar una nueva,
            primero eliminala acá.
            <br /><br />
            Si más de un scouter la tenía registrada, se elimina solo TU
            registro — los demás siguen viéndola.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAccount.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteAccount.isPending}
            onClick={(e) => {
              e.preventDefault();
              deleteAccount.mutate(r.id, {
                onSuccess: () => setConfirmDelete(false),
              });
            }}
            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
          >
            {deleteAccount.isPending ? "Eliminando..." : "Sí, eliminar"}
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
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm ring-2 ring-violet-500/20"
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
    <span className={cn("text-[8px] font-bold uppercase tracking-wider", cfg.text)}>
      {score != null ? "score" : "n/a"}
    </span>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/40 bg-background/40 py-1">
    <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
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
        onClick && "cursor-pointer hover:scale-[1.015]",
        onClick && cfg.borderHover,
        onClick && cfg.glow,
        active && "shadow-[0_0_16px_-4px_rgba(255,255,255,0.15)]",
      )}
    >
      <div
        className={cn(
          "absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl opacity-30 transition-opacity",
          cfg.bg,
          onClick && "group-hover:opacity-50",
          active && "opacity-50",
        )}
      />
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
          <p className="text-[9px] uppercase tracking-wider text-foreground/70 font-semibold leading-tight">
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
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          Cómo recuperar esta cuenta
        </h3>
      </div>

      <div className="space-y-3 text-xs">
        <div>
          <p className="font-semibold text-foreground mb-1">
            Decisión 0 — ¿Recuperar o abandonar?
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Si es cuenta nueva (&lt;3 meses) o con nombre genérico,
            <strong className="text-foreground"> abandonar y crear fresh </strong>
            suele ser más rápido que pelear la restricción (puede tomar semanas).
            Si tiene historial decente, vale la pena recuperar.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">
            Si decides recuperar:
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground marker:text-emerald-400">
            <li>
              <strong className="text-foreground">Verificar email Y teléfono real</strong> (no
              virtual): Settings → Account → Personal information.
            </li>
            <li>
              <strong className="text-foreground">Activar 2FA</strong>: Settings → Security →
              Two-factor authentication.
            </li>
            <li>
              <strong className="text-foreground">Revisar reports/violations</strong>: Settings →
              Help → Account status. Eliminar posts marcados.
            </li>
            <li>
              <strong className="text-foreground">Cambiar a perfil business</strong>: Settings →
              Account type → Switch to Business. Category: "Talent Agency".
            </li>
            <li>
              <strong className="text-foreground">Apelar formalmente</strong>: Settings → Help →
              Report a Problem. Explica que eres una agencia legítima.
            </li>
            <li>
              <strong className="text-foreground text-rose-400">PARAR todo outreach</strong> por 7-14 días.
              Navega normal, like a posts, sigue cuentas, postea 2-3 cosas propias. Si sigues
              spammeando DMs, IG nunca levanta el flag.
            </li>
            <li>
              <strong className="text-foreground">Volver gradual</strong>: 5 DMs/día semana 3, 10
              DMs/día semana 4, máximo 20/día después. Cada DM personalizado.
            </li>
          </ol>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-1">
            Si decides abandonar y crear nueva:
          </p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground marker:text-emerald-400">
            <li>SIM física fresca, email dedicado, dispositivo limpio.</li>
            <li>Día 1: profile completo (foto logo, bio profesional, link al sitio, business).</li>
            <li>Días 1-14: warm-up — browsear, likes, posts propios. <strong className="text-rose-400">CERO DMs</strong>.</li>
            <li>Día 14+: ramp-up gradual de outreach.</li>
          </ul>
        </div>

        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-200/90">
          <strong>Reglas permanentes:</strong> nunca copy-paste el mismo DM ·
          espaciar 2-3 min entre DMs · 1 IP/device por cuenta · profile completo
          ANTES de cualquier outreach · mínimo 5 posts del roster en feed.
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
        toast.error(`"${f.name}" no es una imagen.`);
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" pesa más de 10 MB.`);
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
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles
          className={cn(
            "h-5 w-5 mt-0.5 shrink-0",
            hasScreenshots ? "text-emerald-400" : "text-amber-400",
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1">
            {hasScreenshots
              ? `${paths.length} screenshot${paths.length > 1 ? "s" : ""} cargado${paths.length > 1 ? "s" : ""} — el análisis usa la data real`
              : awaiting
              ? "Pega uno o varios screenshots del perfil"
              : "Mejorar análisis con screenshots"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            {account.is_restricted
              ? "Como IG oculta la cuenta a viewers no-loggeados, el bot no puede leer bio/foto/link. Saca screenshots del perfil desde tu browser (logueado) y subilos acá — puedes agregar varios (bio, posts, link, etc) y Claude vision los lee y enriquece el análisis."
              : "No pudimos leer la cuenta automáticamente (muy nueva o IG bloqueó la lectura). Saca screenshots del perfil desde tu browser (logueado) y subilos acá — puedes agregar varios (bio, posts, link, etc) y Claude vision los lee y arma el análisis con la data real."}
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
                  ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30",
              )}
            >
              {uploadMut.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Subiendo…
                </>
              ) : hasScreenshots ? (
                "Agregar más screenshots"
              ) : (
                "Subir screenshots"
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
                    alt="Screenshot del perfil"
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
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-rose-500 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                  aria-label="Quitar screenshot"
                  title="Quitar screenshot"
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
  low: "bg-amber-500/15 text-amber-400",
  medium: "bg-orange-500/15 text-orange-400",
  high: "bg-rose-500/15 text-rose-400",
};

const WOULD_RESPOND_STYLE: Record<NonNullable<SpammerAccountAiAnalysis["would_respond"]>, { label: string; cls: string }> = {
  si: { label: "Sí respondería", cls: "bg-emerald-500/15 text-emerald-400" },
  tal_vez: { label: "Tal vez respondería", cls: "bg-amber-500/15 text-amber-400" },
  no: { label: "No respondería", cls: "bg-rose-500/15 text-rose-400" },
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
                  className="font-mono text-base hover:text-pink-400 transition-colors"
                >
                  @{r.instagram_handle}
                </a>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                {r.is_verified && (
                  <CheckCircle2 className="h-4 w-4 text-sky-400" title="Verificada" />
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {r.display_name ?? "Sin nombre visible"} · {fmtCount(r.followers_count)} followers ·{" "}
                {fmtCount(r.following_count)} following · {fmtCount(r.posts_count)} posts
              </DialogDescription>
            </div>
            <ScoreBadge score={r.ai_score} cfg={cfg} />
          </div>
        </DialogHeader>

        {/* Restricted banner — deal-breaker para outreach */}
        {r.is_restricted && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-rose-400 uppercase tracking-wider text-[10px] block mb-1">
                  IG marcó la cuenta como restringida
                </span>
                <span className="text-foreground/80">
                  IG la oculta a viewers no-loggeados. Cuando esta cuenta le mande DM a una creadora, lo más
                  probable es que el perfil le aparezca con muro de login o aviso de cuenta restringida —
                  no van a poder validar quién manda el mensaje. Típicamente pasa por contenido NSFW, patrones
                  de spam previos, reportes de usuarios, o cuenta sin verificar mail/teléfono.
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
              ¿Quieres enriquecer el análisis con screenshots? (opcional)
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
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-amber-400 uppercase tracking-wider text-[10px] block mb-1">
                  No pudimos leer el perfil automáticamente
                </span>
                <span className="text-foreground/80">
                  Suele pasar con cuentas muy nuevas (todavía sin indexar) o cuando IG bloquea la lectura
                  desde el servidor. <strong>No</strong> significa que la cuenta esté restringida. Reintenta
                  el scan con el botón de abajo, o sube un screenshot del perfil (logueado) para analizarla igual.
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
                  {wr.label}
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", cfg.bg, cfg.text)}>
                <Sparkles className="h-3 w-3" />
                {cfg.label}
              </span>
              {r.last_scanned_at && (
                <span className="text-[11px] text-muted-foreground">
                  Escaneado {new Date(r.last_scanned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mr-2">Resumen</span>
              {a.summary}
            </p>

            {a.would_respond === "no" && a.why_not && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                  Por qué NO respondería
                </div>
                <p className="text-sm">{a.why_not}</p>
              </div>
            )}

            {a.urgent_improvements && a.urgent_improvements.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                  Mejoras urgentes
                </div>
                <ul className="space-y-1 pl-4 list-disc text-sm marker:text-amber-400">
                  {a.urgent_improvements.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {a.strengths.length > 0 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Fortalezas
                  </div>
                  <ul className="space-y-1 pl-4 list-disc text-xs marker:text-emerald-400">
                    {a.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.red_flags.length > 0 && (
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Red flags
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {a.red_flags.map((rf, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", SEVERITY_STYLE[rf.severity])}>
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
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Recomendaciones a mediano plazo
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
              ? `Scan fallido: ${r.scan_error ?? "error desconocido"}`
              : r.scan_status === "scanning" || r.scan_status === "pending"
                ? "Escaneo en curso… vuelve en unos segundos."
                : "Sin análisis IA disponible para esta cuenta."}
          </div>
        )}

        {/* Operators */}
        <div className="rounded-md border border-border/40 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Scouters que la usan ({account.operators.length})
          </div>
          {account.operators.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Sin scouter asignado.</p>
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
            Re-escanear ahora
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
  const showRescan = kind === "pending" || kind === "failed";

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
                {items.length} {items.length === 1 ? "cuenta" : "cuentas"}
                {kind === "pending" && " esperando o ejecutando scan IA"}
                {kind === "failed" && " — el scan falló (cuenta privada, baneada, o IG bloqueó la API)"}
                {kind === "all" && " registradas en este tenant"}
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
                Re-escanear todas
              </Button>
            )}
          </div>
        </DialogHeader>
        {items.length === 0 ? (
          <div className="rounded-md border border-border/40 bg-muted/20 p-6 text-center text-sm italic text-muted-foreground">
            {kind === "pending" && "No hay cuentas en cola de scan."}
            {kind === "failed" && "No hay cuentas con scan fallido."}
            {kind === "all" && "No hay cuentas registradas todavía."}
          </div>
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
                    title="Ver detalle"
                  >
                    <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs font-semibold">
                          @{r.instagram_handle}
                        </span>
                        {r.is_verified && (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-sky-400" />
                        )}
                        {r.is_restricted && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300"
                            title="IG marcó la cuenta como restringida — las creators target no pueden verla sin login."
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Restringida
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
                        <div className="mt-0.5 flex items-start gap-1 text-[10px] text-rose-400">
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
                      title="Re-escanear esta cuenta"
                    >
                      {r.scan_status === "scanning" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="text-[11px]">Escanear</span>
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
