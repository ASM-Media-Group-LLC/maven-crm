import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, Building2, Pencil, Eye, ChevronDown, Globe, LogOut, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreatorWithBusiness } from "./useCreadores";
import { useUpdateCreador } from "./useCreadores";
import { buildSocialUrl } from "@/lib/utils";
import EditCreadorModal from "./EditCreadorModal";
import ViewCreadorModal from "./ViewCreadorModal";
import ChangeStatusModal from "./ChangeStatusModal";
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

const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
  pendiente_verificacion: "En Revisión",
  borrador: "Borrador",
};

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
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
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
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [editingCreator, setEditingCreator] = useState<CreatorWithBusiness | null>(null);
  const [viewingCreator, setViewingCreator] = useState<CreatorWithBusiness | null>(null);
  const [statusChangeCreator, setStatusChangeCreator] = useState<CreatorWithBusiness | null>(null);
  const [deletingCreator, setDeletingCreator] = useState<CreatorWithBusiness | null>(null);
  const updateCreador = useUpdateCreador();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAgent, isAdmin, isManager, role } = useUserRole();
  const isCloser = role === "closer";
  const canSeeAllData = isAdmin || isManager || !isAgent;

  const deleteCreator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creadores"] });
      toast.success("Creator eliminado correctamente");
      setDeletingCreator(null);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar creator", { description: err.message });
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
        va = a.creator_business?.assigned_agency ?? "";
        vb = b.creator_business?.assigned_agency ?? "";
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
    <Table containerClassName="overflow-visible" className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creador" col="name" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Categoría" col="category" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Estado" col="status" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Ubicación" col="country" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agencia" col="agency" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Redes</TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c) => {
          const showRealName = canSeeAllData || (c as any).permiso_nombre_real === true;
          const showRealLocation = canSeeAllData || (c as any).permiso_ubicacion === true;
          const displayName = showRealName ? c.name : (c.artistic_name || c.name);
          const initials = displayName
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase();

          const flag = showRealLocation ? getFlagEmoji(c.country_code) : "";
          const agency = c.creator_business?.assigned_agency;
          const kashType = c.creator_business?.kash_type;
          const agencyLabel = [agency, kashType].filter(Boolean).join(" · ");

          return (
            <TableRow key={c.id}>
              <TableCell className="cursor-pointer" onClick={() => setViewingCreator(c)}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
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
                    {statusLabel[c.status ?? ""] ?? c.status ?? "—"}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
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
                          <TooltipContent>Ver plataformas</TooltipContent>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCreator(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingCreator(c)}>
                    <Eye className="h-4 w-4" />
                  </Button>
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
                                toast("No se encontró proceso de offboarding para esta creadora.");
                              }
                            }}
                          >
                            <LogOut className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ver Offboarding</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                   )}
                  {isAdmin && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeletingCreator(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Eliminar</TooltipContent>
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
              No se encontraron creadores.
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

    <AlertDialog open={!!deletingCreator} onOpenChange={(open) => { if (!open) setDeletingCreator(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar creator?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar a <strong>{deletingCreator?.name}</strong>. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingCreator && deleteCreator.mutate(deletingCreator.id)}
            disabled={deleteCreator.isPending}
          >
            {deleteCreator.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
};

export default CreadoresTable;
