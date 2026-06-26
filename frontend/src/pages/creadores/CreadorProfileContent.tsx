import { useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { differenceInCalendarDays, setYear, format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Phone, Cake, Download, LogOut, ChevronRight, CheckCircle2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSocialUrl, displayHandle } from "@/lib/utils";
import { useCreadorById } from "./useCreadores";
import InfoTabContent from "./InfoTabContent";
import LineamientosTabContent from "./LineamientosTabContent";
import RedesTabContent from "./RedesTabContent";
import MonetizacionTabContent from "./MonetizacionTabContent";
import NotasTabContent from "./NotasTabContent";
import DocumentosTabContent from "./DocumentosTabContent";
import TicketsTabContent from "./TicketsTabContent";
import HistorialTabContent from "./HistorialTabContent";
import OperacionesTabContent from "./OperacionesTabContent";
// generateCreatorPdf pulls jspdf — loaded on demand below.
import ChangeStatusModal from "./ChangeStatusModal";
import VerificationSection from "./VerificationSection";
import { useOffboarding } from "./useOffboarding";
import { useUserRole } from "@/hooks/useUserRole";

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

const countryToCode: Record<string, string> = {
  Argentina: "AR", Bolivia: "BO", Brasil: "BR", Chile: "CL", Colombia: "CO",
  "Costa Rica": "CR", Cuba: "CU", Ecuador: "EC", "El Salvador": "SV",
  España: "ES", "Estados Unidos": "US", Guatemala: "GT", Honduras: "HN",
  México: "MX", Nicaragua: "NI", Panamá: "PA", Paraguay: "PY", Perú: "PE",
  "Puerto Rico": "PR", "República Dominicana": "DO", Uruguay: "UY", Venezuela: "VE",
};

const getFlagEmoji = (code: string | null) => {
  if (!code) return "";
  return code.toUpperCase().split("").map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
};

function getDaysUntilBirthday(birthDate: string): number | null {
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let next = setYear(bd, today.getFullYear());
  if (next < today) next = setYear(bd, today.getFullYear() + 1);
  return differenceInCalendarDays(next, today);
}

function computeAge(birthDate: string): number | null {
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}
const STATUS_OFFBOARDING: Record<string, { label: string; variant: string }> = {
  en_proceso: { label: "En Proceso", variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { label: "Pend. Aprobación", variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { label: "Pend. Cierre", variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { label: "Finalizado", variant: "bg-muted text-muted-foreground border-border" },
};

function OffboardingSummaryCard({ creatorId }: { creatorId: string }) {
  const { offboarding, approvals } = useOffboarding(creatorId);
  if (!offboarding) return null;
  const st = STATUS_OFFBOARDING[offboarding.status] ?? STATUS_OFFBOARDING.en_proceso;
  const approvalCount = approvals.filter((a) => a.approved).length;
  const checkDone = [offboarding.check_pagos, offboarding.check_material, offboarding.check_campanas, offboarding.check_accesos, offboarding.check_documentacion].filter(Boolean).length;

  return (
    <div className="mx-6 mt-4">
      <Link
        to={`/creadores/offboarding/${offboarding.id}`}
        className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors group"
      >
        <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
          <LogOut className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Offboarding</span>
            <Badge variant="outline" className={`text-[10px] ${st.variant}`}>{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aprobaciones: {approvalCount}/2 · Checklist: {checkDone}/5
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </Link>
    </div>
  );
}


const CreadorProfileContent = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Si el user llegó a este perfil desde otra ruta del CRM (ej. popup
  // de Dashboard v2, tab Creadoras, lista de tickets…), volvemos un
  // step atrás en el history para preservar el contexto (filtros,
  // popup abierto, scroll position). Si entró directo por URL
  // (location.key === "default"), caemos a /creadores como antes.
  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/creadores");
  };
  const { data: creator, isLoading } = useCreadorById(id ?? "");
  const { isAgent, isAdmin, isManager } = useUserRole();
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  if (isLoading) {
    return (
      <main className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!creator) {
    return (
      <main className="flex-1 p-6">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 mb-4">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <p className="text-muted-foreground">Creadora no encontrada.</p>
      </main>
    );
  }

  const c = creator;
  
  // Privacy logic: agents see restricted data unless privacy flags are ON
  const canSeeAllData = isAdmin || isManager || !isAgent;
  const showRealName = canSeeAllData || (c as any).permiso_nombre_real === true;
  const showRealAge = canSeeAllData || (c as any).permiso_edad_real === true;
  const showRealLocation = canSeeAllData || (c as any).permiso_ubicacion === true;

  const displayName = showRealName ? c.name : (c.artistic_name || c.name);
  const initials = displayName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const flag = showRealLocation
    ? getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null)
    : "";
  
  const realAge = c.birth_date ? computeAge(c.birth_date) : c.age;
  const displayAge = showRealAge ? realAge : ((c as any).edad_mostrar ?? realAge);
  const birthdayDays = showRealAge && c.birth_date ? getDaysUntilBirthday(c.birth_date) : null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>

      <div className="mx-6 mt-3 h-32 rounded-xl bg-primary/80 -mb-16" />

      <div className="mx-6 relative z-10 rounded-xl bg-gradient-to-br from-card to-muted/50 border border-border p-6">
        <div className="flex items-start gap-6">
          <Avatar className="h-24 w-24 shrink-0">
            {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-wide uppercase">{displayName}</h1>
            {showRealName && c.artistic_name && (
              <p className="text-muted-foreground text-sm">"{c.artistic_name}"</p>
            )}
            {!showRealName && c.artistic_name && (
              <p className="text-muted-foreground text-sm">"{c.artistic_name}"</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {c.whatsapp_number && (
                <WaChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number })} name={c.name} className="h-7 gap-1.5 px-2 text-xs text-emerald-600 hover:text-emerald-700" />
              )}
              {c.instagram_handle && (
                <a href={buildSocialUrl("instagram", c.instagram_handle)} target="_blank" rel="noopener noreferrer">
                  <Badge variant="secondary-soft" className="gap-1.5 cursor-pointer hover:bg-muted">
                    <InstagramIcon className="h-3 w-3" /> {displayHandle(c.instagram_handle)}
                  </Badge>
                </a>
              )}
              {displayAge != null && (
                <Badge variant="secondary-soft">{displayAge} años</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
              const { generateCreatorPdf } = await import("./generateCreatorPdf");
              generateCreatorPdf(c);
            }}>
              <Download className="h-4 w-4" /> Exportar Ficha Técnica
            </Button>
            {!isAgent && (c as any).entered_crm_at && (
              <Badge
                variant="success-soft"
                className="gap-1"
                title={`Detectada automáticamente al completar onboarding (status ≠ borrador)`}
              >
                <CheckCircle2 className="h-3 w-3" />
                Ingresada al CRM · {format(new Date((c as any).entered_crm_at), "d MMM yyyy", { locale: es })}
              </Badge>
            )}
            {c.status && (
              <Badge
                variant={statusVariant[c.status] ?? "secondary-soft"}
                className={!isAgent ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                onClick={!isAgent ? () => setStatusModalOpen(true) : undefined}
              >
                {statusLabel[c.status] ?? c.status}
              </Badge>
            )}
            {birthdayDays != null && (
              <Badge variant="secondary-soft" className="gap-1">
                <Cake className="h-3 w-3" />
                {birthdayDays === 0 ? "¡Hoy!" : `${birthdayDays} días para su cumpleaños`}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {c.status && !isAgent && (
        <VerificationSection creatorId={id!} creatorName={c.name} currentStatus={c.status} />
      )}

      {(c.status === "leaving" || c.status === "terminated") && !isAgent && (
        <OffboardingSummaryCard creatorId={id!} />
      )}

      <div className="px-6 mt-4 pb-6">
        <Tabs defaultValue="operaciones">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="operaciones">{isAgent ? "Insights" : "Operaciones"}</TabsTrigger>
            {!isAgent && (
              <>
                <TabsTrigger value="info">Información</TabsTrigger>
                <TabsTrigger value="lineamientos">Lineamientos</TabsTrigger>
                <TabsTrigger value="redes">Redes</TabsTrigger>
                <TabsTrigger value="monetizacion">Monetización</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="notas">Notas</TabsTrigger>
                <TabsTrigger value="tickets">Tickets</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="operaciones">
            <OperacionesTabContent creator={c} />
          </TabsContent>

          {!isAgent && (
            <>
              <TabsContent value="info">
                <InfoTabContent creator={c} creatorId={id!} />
              </TabsContent>

              <TabsContent value="lineamientos">
                <LineamientosTabContent creatorId={id!} />
              </TabsContent>

              <TabsContent value="redes">
                <RedesTabContent creator={c} creatorId={id!} />
              </TabsContent>

              <TabsContent value="monetizacion">
                <MonetizacionTabContent creatorId={id!} />
              </TabsContent>

              <TabsContent value="documentos">
                <DocumentosTabContent creatorId={id!} />
              </TabsContent>

              <TabsContent value="notas">
                <NotasTabContent creatorId={id!} />
              </TabsContent>

              <TabsContent value="tickets">
                <TicketsTabContent creatorId={id!} />
              </TabsContent>

              <TabsContent value="historial">
                <HistorialTabContent creatorId={id!} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
      {c.status && (
        <ChangeStatusModal
          creatorId={id!}
          creatorName={c.name}
          currentStatus={c.status}
          open={statusModalOpen}
          onOpenChange={setStatusModalOpen}
        />
      )}
    </main>
  );
};

export default CreadorProfileContent;
