import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, Building2, Pencil, Eye, ChevronDown, Globe, LogOut, Trash2, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreatorWithBusiness } from "./useCreadores";
import { useUpdateCreador } from "./useCreadores";
import { buildSocialUrl } from "@/lib/utils";
import EditCreadorModal from "./EditCreadorModal";
import ViewCreadorModal from "./ViewCreadorModal";
import ChangeStatusModal from "./ChangeStatusModal";
import SellPlatformDialog from "./SellPlatformDialog";
import { etiquetaEstado, conNombre } from "./etiquetasCreadora";
import { useUserRole } from "@/hooks/useUserRole";
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
import { useLanguage } from "@/hooks/useLanguage";
import { useAgenciaDeCreadoras } from "@/hooks/useAgenciaDeCreadoras";

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
  pendiente_verificacion: "warning-soft",
  borrador: "secondary-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  Elite: "success-soft",
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  "C+": "destructive-soft",
  C: "destructive-soft",
};

const getFlagEmoji = (countryCode: string | null) => {
  if (!countryCode) return "";
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
};

type SortKey = "name" | "category" | "status" | "country" | "agency";

interface Props {
  creators: CreatorWithBusiness[];
}

const CreadoresTable = ({ creators }: Props) => {
  const { t } = useLanguage();
  // La agencia de cada una: la regla única (lib/creadoras/agencia.ts).
  const { agenciaDe: canonicalAgency } = useAgenciaDeCreadoras();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [editingCreator, setEditingCreator] = useState<CreatorWithBusiness | null>(null);
  const [viewingCreator, setViewingCreator] = useState<CreatorWithBusiness | null>(null);
  const [statusChangeCreator, setStatusChangeCreator] = useState<CreatorWithBusiness | null>(null);
  const [deletingCreator, setDeletingCreator] = useState<CreatorWithBusiness | null>(null);
  // Creadora a la que se le va a vender una plataforma (deal_type=venta_plataforma).
  const [sellingCreator, setSellingCreator] = useState<CreatorWithBusiness | null>(null);
  // Toggle de Blu/Infloww: { creator, nextState } — modal confirma en
  // ambas direcciones (marcar y desmarcar).
  const [bluToggleTarget, setBluToggleTarget] = useState<{ creator: CreatorWithBusiness; nextState: boolean } | null>(null);
  const updateCreador = useUpdateCreador();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAgent, isAdmin, isManager, role } = useUserRole();
  const { canAccess } = usePermissions();
  const isCloser = role === "closer";
  const canSeeAllData = isAdmin || isManager || !isAgent;
  // Por default solo admin puede tocar el toggle de Blu/Infloww. Admin
  // habilita el permiso por rol desde Settings → Roles ("Creadores" /
  // "Editar Blu CRM"); canAccess devuelve true para admin sin requerir
  // la fila.
  const canEditBlu = canAccess("Creadores", "Editar Blu CRM");
  // "Eliminar Creator" — acción destructiva propia. Default heredado
  // del padre Creadores (sembrado en DB) → preservamos accesos
  // existentes; admin la puede revocar a roles específicos.
  const canDeleteCreator = canAccess("Creadores", "Eliminar Creator");
  // "Vender plataforma": manda a la creadora al pipeline de closers como deal de
  // venta. Mismo permiso que asignar en Closers (lo exige el RPC).
  const canSellPlatform = canAccess("Closers", "Asignar Closer");

  const toggleBluMutation = useMutation({
    mutationFn: async ({ id, nextState }: { id: string; nextState: boolean }) => {
      const { error } = await supabase
        .from("creators")
        .update({ blu_infloww_active: nextState } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      queryClient.invalidateQueries({ queryKey: ["ops-dashboard"] });
      toast.success(
        bluToggleTarget?.nextState
          ? t("creadores.table.bluMarked")
          : t("creadores.table.bluUnmarked"),
      );
      setBluToggleTarget(null);
    },
    onError: (err: any) => {
      toast.error(t("creadores.table.bluError"), { description: err.message });
    },
  });

  const deleteCreator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      toast.success(t("creadores.table.deleted"));
      setDeletingCreator(null);
    },
    onError: (err: any) => {
      toast.error(t("creadores.table.deleteError"), { description: err.message });
    },
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...creators].sort((a, b) => {
    let va = "";
    let vb = "";
    switch (sortKey) {
      case "name":
        va = a.name;
        vb = b.name;
        break;
      case "category":
        va = a.category ?? "";
        vb = b.category ?? "";
        break;
      case "status":
        va = a.status ?? "";
        vb = b.status ?? "";
        break;
      case "country":
        va = `${a.country ?? ""} ${a.city ?? ""}`;
        vb = `${b.country ?? ""} ${b.city ?? ""}`;
        break;
      case "agency":
        va = canonicalAgency(a.creator_business);
        vb = canonicalAgency(b.creator_business);
        break;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <>
    <Table containerClassName="overflow-visible max-md:overflow-x-auto" className="md:min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label={t("creadores.table.colCreator")} col="name" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label={t("common.category")} col="category" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label={t("common.status")} col="status" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] text-center">Blu/Infloww</TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label={t("common.location")} col="country" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label={t("creadores.table.colAgency")} col="agency" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">{t("creadores.profile.tabSocials")}</TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">{t("common.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c) => {
          const showRealName = canSeeAllData || (c as any).permiso_nombre_real === true;
          const showRealLocation = canSeeAllData || (c as any).permiso_ubicacion === true;
          const displayName = showRealName ? c.name : (c.artistic_name || c.name);

          const flag = showRealLocation ? getFlagEmoji(c.country_code) : "";
          const agencyLabel = canonicalAgency(c.creator_business);

          return (
            <TableRow key={c.id}>
              <TableCell className="cursor-pointer" onClick={() => setViewingCreator(c)}>
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={displayName}
                    src={c.profile_photo_url}
                    className="h-10 w-10"
                  />
                  <div>
                    <p className="text-sm font-medium leading-none">{showRealName ? (c.artistic_name || c.name) : displayName}</p>
                    {showRealName && c.artistic_name && (
                      <p className="text-xs text-muted-foreground">{c.name}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {c.category && (
                  <Badge variant={categoryVariant[c.category] ?? "secondary-soft"} className="font-normal">
                    {c.category}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <button
                  onClick={() => setStatusChangeCreator(c)}
                  className="flex items-center gap-1 focus:outline-none cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Badge
                    variant={statusVariant[c.status ?? ""] ?? "secondary-soft"}
                    className={c.status === "pendiente_verificacion" ? "badge-pending-verification" : ""}
                  >
                    {etiquetaEstado(t, c.status)}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </TableCell>
              <TableCell className="text-center">
                {(() => {
                  const isActive = ((c as any).blu_infloww_active ?? false) as boolean;
                  const interactive = canEditBlu;
                  return (
                    <div className="flex justify-center">
                      <Switch
                        checked={isActive}
                        disabled={!interactive}
                        onCheckedChange={(checked) => {
                          if (!interactive) return;
                          setBluToggleTarget({ creator: c, nextState: checked });
                        }}
                        title={
                          interactive
                            ? isActive ? t("creadores.table.bluActiveClick") : t("creadores.table.bluInactiveClick")
                            : isActive ? t("creadores.table.bluActive") : t("creadores.table.bluInactive")
                        }
                        className="data-[state=checked]:bg-success"
                      />
                    </div>
                  );
                })()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {showRealLocation ? (
                  <>
                    {flag && <span className="mr-1">{flag}</span>}
                    {c.city || c.country || "—"}
                  </>
                ) : (
                  (c as any).ubicacion_artistica || "—"
                )}
              </TableCell>
              <TableCell className="text-sm">
                {agencyLabel ? (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[140px]">{agencyLabel}</span>
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell>
                <TooltipProvider>
                <div className="flex gap-2">
                  {c.instagram_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("instagram", c.instagram_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-destructive hover:text-destructive/80"
                        >
                          <InstagramIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Instagram</TooltipContent>
                    </Tooltip>
                  )}
                  {c.tiktok_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("tiktok", c.tiktok_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:text-muted-foreground"
                        >
                          <TikTokIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>TikTok</TooltipContent>
                    </Tooltip>
                  )}
                  {c.twitter_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("twitter", c.twitter_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:text-muted-foreground"
                        >
                          <XIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>X</TooltipContent>
                    </Tooltip>
                  )}
                  {(() => {
                    const externalLinks = [
                      c.onlyfans_url && { label: "OnlyFans", url: c.onlyfans_url },
                      c.piclink_url && { label: "Piclink", url: c.piclink_url },
                      c.linkedin_handle && { label: "LinkedIn", url: buildSocialUrl("linkedin", c.linkedin_handle) },
                      c.youtube_handle && { label: "YouTube", url: buildSocialUrl("youtube", c.youtube_handle) },
                      c.chat_url && { label: "Chat", url: c.chat_url },
                    ].filter(Boolean) as { label: string; url: string }[];
                    if (externalLinks.length === 0) return null;
                    if (externalLinks.length === 1) {
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={externalLinks[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Globe className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>{externalLinks[0].label}</TooltipContent>
                        </Tooltip>
                      );
                    }
                    return (
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <button className="text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer">
                                <Globe className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>{t("creadores.table.viewPlatforms")}</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="start">
                          {externalLinks.map((link) => (
                            <DropdownMenuItem key={link.label} asChild>
                              <a href={link.url} target="_blank" rel="noopener noreferrer">
                                {link.label}
                              </a>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
                </div>
                </TooltipProvider>
              </TableCell>
              <TableCell className="sticky right-0 bg-card">
                <div className="flex gap-1">
                  {!isCloser && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCreator(c)} aria-label={t("creadores.table.edit")} title={t("creadores.table.edit")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingCreator(c)} aria-label={t("creadores.table.view")} title={t("creadores.table.view")}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canSellPlatform && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => setSellingCreator(c)}
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("creadores.table.sellPlatform")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isCloser && (c.status === "leaving" || c.status === "terminated") && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-warning"
                            onClick={async () => {
                              const { data } = await supabase
                                .from("creator_offboardings")
                                .select("id")
                                .eq("creator_id", c.id)
                                .order("created_at", { ascending: false })
                                .limit(1)
                                .maybeSingle();
                              if (data?.id) {
                                navigate(`/creadores/offboarding/${data.id}`);
                              } else {
                                toast(t("creadores.table.noOffboarding"));
                              }
                            }}
                          >
                            <LogOut className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("creadores.table.viewOffboarding")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                   )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              {t("creadores.table.empty")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {editingCreator && (
      <EditCreadorModal
        open={!!editingCreator}
        onOpenChange={(open) => { if (!open) setEditingCreator(null); }}
        creator={editingCreator}
      />
    )}

    {viewingCreator && (
      <ViewCreadorModal
        open={!!viewingCreator}
        onOpenChange={(open) => { if (!open) setViewingCreator(null); }}
        creator={viewingCreator}
      />
    )}

    {statusChangeCreator && (
      <ChangeStatusModal
        creatorId={statusChangeCreator.id}
        creatorName={statusChangeCreator.name}
        currentStatus={statusChangeCreator.status ?? ""}
        open={!!statusChangeCreator}
        onOpenChange={(open) => {
          if (!open) setStatusChangeCreator(null);
        }}
      />
    )}

    {sellingCreator && (
      <SellPlatformDialog
        open={!!sellingCreator}
        onOpenChange={(open) => { if (!open) setSellingCreator(null); }}
        creatorId={sellingCreator.id}
        instagramHandle={sellingCreator.instagram_handle ?? ""}
        creatorName={sellingCreator.name}
      />
    )}

    {/* Confirmación de toggle Blu/Infloww (marcar o desmarcar).
        El estado cambia automáticamente en creators, el trigger logea
        la transición en creator_blu_history, y eso es lo que alimenta
        Movimientos del CRM en Panel de Control. */}
    <AlertDialog open={!!bluToggleTarget} onOpenChange={(open) => { if (!open) setBluToggleTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bluToggleTarget?.nextState
              ? t("creadores.table.bluMarkQ")
              : t("creadores.table.bluUnmarkQ")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {bluToggleTarget?.nextState
              ? conNombre(t("creadores.table.bluMarkDesc"), bluToggleTarget.creator.name)
              : conNombre(t("creadores.table.bluUnmarkDesc"), bluToggleTarget?.creator.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            onClick={() =>
              bluToggleTarget &&
              toggleBluMutation.mutate({
                id: bluToggleTarget.creator.id,
                nextState: bluToggleTarget.nextState,
              })
            }
            disabled={toggleBluMutation.isPending}
          >
            {toggleBluMutation.isPending
              ? t("creadores.saving")
              : bluToggleTarget?.nextState
                ? t("creadores.table.yesMark")
                : t("creadores.table.yesUnmark")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingCreator} onOpenChange={(open) => { if (!open) setDeletingCreator(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("creadores.table.deleteQ")}</AlertDialogTitle>
          <AlertDialogDescription>
            {conNombre(t("creadores.table.deleteDesc"), deletingCreator?.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              // Guard de permiso. El AlertDialog puede abrirse desde
              // otros componentes (ViewCreadorModal); gatear acá evita
              // que se ejecute la mutation si el rol perdió permiso.
              if (!canDeleteCreator) {
                toast.error(t("creadores.table.noDeletePermission"));
                setDeletingCreator(null);
                return;
              }
              if (deletingCreator) deleteCreator.mutate(deletingCreator.id);
            }}
            disabled={deleteCreator.isPending || !canDeleteCreator}
          >
            {deleteCreator.isPending ? t("cr.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
};

export default CreadoresTable;
