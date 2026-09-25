import { useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { format } from "date-fns";
import { computeAge, getDaysUntilBirthday } from "@/lib/edad";
import { useFormato } from "@/hooks/useFormato";
import { ArrowLeft, Phone, Cake, Download, LogOut, ChevronRight, CheckCircle2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSocialUrl, displayHandle } from "@/lib/utils";
import { useCreadorById } from "./useCreadores";
import ProfilePhotoEditor from "./ProfilePhotoEditor";
import InfoTabContent from "./InfoTabContent";
import LineamientosTabContent from "./LineamientosTabContent";
import LineamientosSoloLectura from "./LineamientosSoloLectura";
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
import { useVistaTrabajo } from "./vistaTrabajo";
import { etiquetaEstado } from "./etiquetasCreadora";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";

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

// Las claves son creator_offboardings.status (DATO); `label` es la clave de su etiqueta.
const STATUS_OFFBOARDING: Record<string, { label: TranslationKey; variant: string }> = {
  en_proceso: { label: "cr.offStatusInProgress", variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { label: "cr.offStatusPendingApprovalShort", variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { label: "cr.offStatusPendingClosureShort", variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { label: "cr.offStatusDone", variant: "bg-muted text-muted-foreground border-border" },
};

function OffboardingSummaryCard({ creatorId }: { creatorId: string }) {
  const { t } = useLanguage();
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
            <Badge variant="outline" className={`text-[10px] ${st.variant}`}>{t(st.label)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("creadores.profile.approvalsChecklist", { a: approvalCount, c: checkDone })}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </Link>
    </div>
  );
}


const CreadorProfileContent = () => {
  const f = useFormato();
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Si el user llegó a este perfil desde otra ruta del CRM (ej. popup
  // de Dashboard v2, tab Creadoras, lista de tickets…), volvemos un
  // step atrás en el history para preservar el contexto (filtros,
  // popup abierto, scroll position). Si entró directo por URL
  // (location.key === "default"), caemos a /creadores como antes.
  const { data: creator, isLoading } = useCreadorById(id ?? "");
  const { isAdmin, isManager } = useUserRole();
  // Chatter que entró por su roster (o el rol legacy `agent`): perfil de
  // trabajo, sin datos de contacto ni gestión. Ver `vistaTrabajo.ts`.
  const { vistaTrabajo, cargando: permisosCargando } = useVistaTrabajo();
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    // Entró por URL directa: el chatter no tiene el tab Creadoras, así que
    // volver a /creadores lo dejaría en una pantalla que no puede ver.
    else navigate(vistaTrabajo ? "/chatters/horarios" : "/creadores");
  };

  if (isLoading || permisosCargando) {
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
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <p className="text-muted-foreground">{t("creadores.profile.notFound")}</p>
      </main>
    );
  }

  const c = creator;
  
  // Privacy logic: la vista de trabajo ve el nombre artístico, la edad a
  // mostrar y la ubicación artística, salvo que la creadora haya dado permiso
  // explícito para el dato real.
  const canSeeAllData = isAdmin || isManager || !vistaTrabajo;
  const showRealName = canSeeAllData || (c as any).permiso_nombre_real === true;
  const showRealAge = canSeeAllData || (c as any).permiso_edad_real === true;
  const showRealLocation = canSeeAllData || (c as any).permiso_ubicacion === true;

  const displayName = showRealName ? c.name : (c.artistic_name || c.name);
  const initials = displayName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const flag = showRealLocation
    ? getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null)
    : "";
  
  // Si la fecha de nacimiento es implausible (hay 18 en prod con años como
  // 2025 o 275760), computeAge da null y se usa la edad cargada a mano.
  const realAge = (c.birth_date ? computeAge(c.birth_date) : null) ?? c.age;
  const displayAge = showRealAge ? realAge : ((c as any).edad_mostrar ?? realAge);
  const birthdayDays = showRealAge && c.birth_date ? getDaysUntilBirthday(c.birth_date) : null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="px-3 pt-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
      </div>

      <div className="mx-3 mt-3 h-24 rounded-xl bg-primary/80 -mb-12 sm:mx-6 sm:h-32 sm:-mb-16" />

      {/* Cabecera. En el teléfono se APILA (foto, nombre, badges): en una sola
          fila la columna derecha (exportar + 3 badges, shrink-0) se dibujaba
          encima del nombre y fuera de la tarjeta (Jhon, iPhone, 07/09/2026). */}
      <div className="mx-3 relative z-10 rounded-xl bg-gradient-to-br from-card to-muted/50 border border-border p-4 sm:mx-6 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <ProfilePhotoEditor
            creatorId={c.id}
            photoUrl={c.profile_photo_url}
            initials={initials}
            instagramHandle={c.instagram_handle}
            canEdit={!vistaTrabajo}
          />

          <div className="w-full min-w-0 flex-1 space-y-2 text-center sm:text-left">
            <h1 className="break-words text-xl font-bold uppercase tracking-wide sm:text-2xl">{displayName}</h1>
            {showRealName && c.artistic_name && (
              <p className="text-muted-foreground text-sm">"{c.artistic_name}"</p>
            )}
            {!showRealName && c.artistic_name && (
              <p className="text-muted-foreground text-sm">"{c.artistic_name}"</p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {/* Contacto: NO en la vista de trabajo. El teléfono ya viene
                  enmascarado de la BD y estos botones son ese mismo número en
                  forma de acción (abren la bandeja / el chat con ella). */}
              {!vistaTrabajo && c.whatsapp_number && (
                <WaChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number })} name={c.name} className="h-7 gap-1.5 px-2 text-xs text-whatsapp hover:text-whatsapp/80" />
              )}
              {!vistaTrabajo && (c.whatsapp_number || c.phone) && (
                <TgChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} className="h-7 gap-1.5 px-2 text-xs text-telegram hover:text-telegram/80" />
              )}
              {c.instagram_handle && (
                <a href={buildSocialUrl("instagram", c.instagram_handle)} target="_blank" rel="noopener noreferrer">
                  <Badge variant="secondary-soft" className="gap-1.5 cursor-pointer hover:bg-muted">
                    <InstagramIcon className="h-3 w-3" /> {displayHandle(c.instagram_handle)}
                  </Badge>
                </a>
              )}
              {displayAge != null && (
                <Badge variant="secondary-soft">{t("creadores.profile.yearsOld", { n: displayAge })}</Badge>
              )}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end">
            {/* La ficha técnica en PDF es un volcado de TODOS los campos:
                queda fuera de la vista de trabajo. Y del teléfono: el PDF se
                genera y se lee en escritorio. */}
            {!vistaTrabajo && (
              <Button variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex" onClick={async () => {
                const { generateCreatorPdf } = await import("./generateCreatorPdf");
                generateCreatorPdf(c);
              }}>
                <Download className="h-4 w-4" /> {t("creadores.profile.exportSheet")}
              </Button>
            )}
            {!vistaTrabajo && (c as any).entered_crm_at && (
              <Badge
                variant="success-soft"
                className="gap-1"
                title={t("creadores.profile.enteredCrmHint")}
              >
                <CheckCircle2 className="h-3 w-3" />
                {t("creadores.profile.enteredCrm", { date: format(new Date((c as any).entered_crm_at), "d MMM yyyy", { locale: f.fechas }) })}
              </Badge>
            )}
            {c.status && (
              <Badge
                variant={statusVariant[c.status] ?? "secondary-soft"}
                className={!vistaTrabajo ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                onClick={!vistaTrabajo ? () => setStatusModalOpen(true) : undefined}
              >
                {etiquetaEstado(t, c.status)}
              </Badge>
            )}
            {birthdayDays != null && (
              <Badge variant="secondary-soft" className="gap-1">
                <Cake className="h-3 w-3" />
                {birthdayDays === 0 ? t("creadores.profile.birthdayToday") : t("creadores.profile.birthdayIn", { n: birthdayDays })}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {c.status && !vistaTrabajo && (
        <VerificationSection creatorId={id!} creatorName={c.name} currentStatus={c.status} />
      )}

      {(c.status === "leaving" || c.status === "terminated") && !vistaTrabajo && (
        <OffboardingSummaryCard creatorId={id!} />
      )}

      <div className="px-6 mt-4 pb-6">
        <Tabs defaultValue="operaciones">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="operaciones">{vistaTrabajo ? t("creadores.profile.tabHowToWrite") : t("creadores.profile.tabOperations")}</TabsTrigger>
            {/* Vista de trabajo: además de la operativa, los lineamientos y las
                redes públicas, las dos en solo lectura. Nada de Información
                (teléfono, dirección, notas internas), Documentos, Monetización,
                Tickets ni Historial. */}
            {vistaTrabajo && (
              <>
                <TabsTrigger value="lineamientos">{t("creadores.profile.tabGuidelines")}</TabsTrigger>
                <TabsTrigger value="redes">{t("creadores.profile.tabSocials")}</TabsTrigger>
              </>
            )}
            {!vistaTrabajo && (
              <>
                <TabsTrigger value="info">{t("creadores.profile.tabInfo")}</TabsTrigger>
                <TabsTrigger value="lineamientos">{t("creadores.profile.tabGuidelines")}</TabsTrigger>
                <TabsTrigger value="redes">{t("creadores.profile.tabSocials")}</TabsTrigger>
                <TabsTrigger value="monetizacion">{t("creadores.profile.tabMonetization")}</TabsTrigger>
                <TabsTrigger value="documentos">{t("creadores.profile.tabDocuments")}</TabsTrigger>
                <TabsTrigger value="notas">{t("creadores.profile.tabNotes")}</TabsTrigger>
                <TabsTrigger value="tickets">{t("creadores.profile.tabTickets")}</TabsTrigger>
                <TabsTrigger value="historial">{t("creadores.profile.tabHistory")}</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="operaciones">
            <OperacionesTabContent creator={c} creatorId={id!} />
          </TabsContent>

          {vistaTrabajo && (
            <>
              <TabsContent value="lineamientos">
                <LineamientosSoloLectura creatorId={id!} />
              </TabsContent>

              <TabsContent value="redes">
                <RedesTabContent creator={c} creatorId={id!} soloLectura />
              </TabsContent>
            </>
          )}

          {!vistaTrabajo && (
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
      {c.status && !vistaTrabajo && (
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
