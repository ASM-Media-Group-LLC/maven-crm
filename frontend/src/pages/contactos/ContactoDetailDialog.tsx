import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Pencil, Sparkles, Trash2, ArrowRight, History, Phone } from "lucide-react";
import ContactHistoryView from "./ContactHistoryView";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { getCountryFlag, getCountryShortDisplay } from "@/lib/country-utils";
import { WaChatButton } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import type { Contacto } from "./ContactosContent";
import type { ContactChannel } from "./useContactSalesChannels";

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
  onEdit?: () => void;
  onConvert?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  // Solo admin: canales de venta por los que se contactó a este contacto.
  salesChannels?: ContactChannel[];
  showSalesChannels?: boolean;
}

// Popup focalizado con los campos pedidos: Creación, Registro, Nombre,
// Instagram, OF URL, Agente, Categoría, Tipo, País, Ciudad, Contacto.
// Mismo patrón que CreatorDetailDialog (Dashboard 2): foto + título + IG
// + grid de stats + botones de acción.
const ContactoDetailDialog = ({ open, onOpenChange, contacto, onEdit, onConvert, onDelete, canDelete, salesChannels = [], showSalesChannels }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { isAdmin } = useUserRole();
  const { permissions } = usePermissions();
  // Teléfono visible: admin, o rol con el permiso EXPLÍCITO Contactos/Ver
  // Teléfonos (mismo criterio default-deny que can_see_contact_phone() en la BD;
  // no usamos canAccess() por su fallback bool_or). El server ya manda el número
  // real solo a estos; para el resto la vista lo enmascara.
  const canSeePhone =
    isAdmin ||
    permissions.some(
      (p) => p.module === "Contactos" && p.submodule === "Ver Teléfonos" && p.can_access,
    );

  // Notas hechas en cada contacto del closer (closer_contact_history), vía el
  // closer_creator vinculado por source_contact_id. Read-only.
  const { data: contactNotes = [] } = useQuery({
    queryKey: ["contacto-contact-notes", contacto?.id],
    enabled: open && !!contacto?.id,
    queryFn: async () => {
      const { data: cr } = await supabase
        .from("closer_creators").select("id").eq("source_contact_id", contacto!.id).maybeSingle();
      if (!cr?.id) return [] as { channel: string | null; notes: string | null; contact_date: string }[];
      const { data } = await supabase
        .from("closer_contact_history").select("channel, notes, contact_date")
        .eq("creator_id", cr.id).order("contact_date", { ascending: true });
      return (data || []) as { channel: string | null; notes: string | null; contact_date: string }[];
    },
  });
  const notesWithText = contactNotes
    .map((n, i) => ({ ...n, idx: i + 1 }))
    .filter((n) => (n.notes || "").trim().length > 0);

  if (!contacto) return null;
  const c = contacto;
  const cleanHandle = c.instagram.replace(/^@/, "");
  const igUrl = cleanHandle ? `https://instagram.com/${cleanHandle}` : null;
  const ofUrl = c.onlyfans_url
    ? c.onlyfans_url.startsWith("http")
      ? c.onlyfans_url
      : `https://onlyfans.com/${c.onlyfans_url}`
    : null;
  const initials = c.nombre
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  const recordType = (c as unknown as { record_type?: string }).record_type;
  const tipo = recordType === "reactivado" ? t("contactos.reactivated") : t("common.new");
  // Número completo (país + teléfono). El "•" indica que la vista lo enmascaró
  // (no privilegiado) → no lo mostramos como si fuera el real.
  const phoneText = (c.whatsapp || c.phone || "").trim();
  const showPhone = canSeePhone && !!phoneText && !phoneText.includes("•");
  // ¿Hay número cargado? Se puede saber SIN verlo: la vista enmascara con "•"
  // pero deja el campo no vacío, así que vacío = no hay teléfono (no es falta de permiso).
  const hasPhone = !!phoneText;
  const phoneDigits = phoneText.replace(/[^0-9+]/g, "");
  const stats: { label: string; value: React.ReactNode; full?: boolean }[] = [
    { label: t("contactos.created"), value: c.creacion || "—" },
    { label: t("contactos.record"), value: c.ticket || "—" },
    { label: t("contactos.agent"), value: c.creadoPor || t("contactos.notAssigned") },
    {
      label: t("common.category"),
      value: (
        <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="font-normal">
          {c.categoria || "—"}
        </Badge>
      ),
    },
    {
      label: t("common.type"),
      value: (
        <Badge variant={recordType === "reactivado" ? "warning-soft" : "success-soft"} className="font-normal">
          {tipo}
        </Badge>
      ),
    },
    {
      label: t("common.country"),
      value: c.pais ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base">{getCountryFlag(c.pais)}</span>
          {getCountryShortDisplay(c.pais)}
        </span>
      ) : "—",
    },
    { label: t("common.city"), value: c.city || t("contactos.notApplicable") },
    {
      label: t("contactos.contact"),
      full: true,
      value: (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Sin teléfono cargado el botón sólo puede fallar (el edge no tiene a
                dónde escribir): 336 agencias y varias ex-creadoras entraron sin
                número. Se avisa en vez de ofrecer un botón que revienta. */}
            {hasPhone ? (
              <WaChatButton contactId={c.id} name={c.nombre} />
            ) : (
              <span className="text-xs text-muted-foreground">{t("contactos.noPhoneOnFile")}</span>
            )}
            <TgChatButton contactId={c.id} name={c.nombre} />
          </div>
          {showPhone && (
            <a
              href={`tel:${phoneDigits}`}
              className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
              title={t("contactos.callCopyNumber")}
            >
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="tabular-nums select-all">{phoneText}</span>
            </a>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20 shrink-0">
              {c.profile_picture_url && <AvatarImage src={c.profile_picture_url} alt={c.nombre} />}
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle
                className={`text-2xl mb-1 truncate ${igUrl ? "cursor-pointer hover:underline decoration-primary/50 underline-offset-4" : ""}`}
                onClick={() => igUrl && window.open(igUrl, "_blank", "noopener,noreferrer")}
                title={igUrl ? t("contactos.openInstagram") : undefined}
              >
                {c.nombre}
              </DialogTitle>
              {cleanHandle && (
                <a
                  href={igUrl ?? `https://instagram.com/${cleanHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                  title={t("contactos.openInstagram")}
                >
                  <InstagramIcon className="h-3.5 w-3.5" />
                  @{cleanHandle}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              )}
              {ofUrl && (
                <a
                  href={ofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                >
                  OF URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-lg border border-border bg-card p-3 ${s.full ? "col-span-2 sm:col-span-3" : ""}`}
            >
              <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              {s.full ? (
                <div className="mt-0.5 text-sm font-medium">{s.value}</div>
              ) : (
                <p className="text-sm font-medium tabular-nums truncate">{s.value}</p>
              )}
            </div>
          ))}
        </div>

        {showSalesChannels && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">
              {t("contactos.salesChannelsContacted")}
            </p>
            {salesChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("contactos.noWhatsappContactYet")}</p>
            ) : (
              <div className="space-y-1.5">
                {salesChannels.map((ch) => (
                  <div
                    key={ch.channelId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <Badge variant="secondary" className="font-normal">{ch.label}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {ch.lastAt
                        ? format(parseISO(ch.lastAt), "dd MMM yy, HH:mm", { locale: f.fechas })
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {notesWithText.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">
              {t("contactos.contactNotes")}
            </p>
            <div className="space-y-1.5">
              {notesWithText.map((n) => (
                <div key={n.idx} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {t("contactos.contactN", { n: n.idx })}{n.channel ? ` · ${n.channel}` : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {n.contact_date ? format(parseISO(n.contact_date), "dd MMM yy", { locale: f.fechas }) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{n.notes}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" />
            {t("contactos.history")}
          </Button>
          {ofUrl && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(ofUrl, "_blank", "noopener,noreferrer")}
            >
              OF URL
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </Button>
          )}
          {onConvert && (
            <Button size="sm" className="gap-1.5" onClick={onConvert}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("contactos.convertToCreator")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && canDelete && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-auto text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <ContactHistoryView
      contactId={c.id}
      contactName={c.nombre}
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
    />
    </>
  );
};

export default ContactoDetailDialog;
