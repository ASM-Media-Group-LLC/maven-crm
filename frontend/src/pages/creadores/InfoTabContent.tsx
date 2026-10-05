import { useState } from "react";
import { format } from "date-fns";
import { Edit, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { useAgenciaDeCreadoras } from "@/hooks/useAgenciaDeCreadoras";
import { negocioDeLaOpcion } from "@/lib/creadoras/agencia";
import SelectorDeAgencia from "@/components/creadoras/SelectorDeAgencia";
import { ManagerSelect, managerAssignmentPatch, useManagerName } from "./ManagerSelect";
import { useModelCategories } from "@/hooks/useModelCategories";
import { useFormato } from "@/hooks/useFormato";
import { ExternalLink } from "lucide-react";
import { etiquetaEstado } from "./etiquetasCreadora";
import { useLanguage } from "@/hooks/useLanguage";
import { edadDesde } from "@/lib/creadoras/edad";

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
};

// País → código ISO. La lista del select sale de acá (ordenada alfabéticamente).
const countryToCode: Record<string, string> = {
  Alemania: "DE", Andorra: "AD", Argentina: "AR", Australia: "AU", Austria: "AT",
  Bahamas: "BS", Barbados: "BB", Bélgica: "BE", Belice: "BZ", Bolivia: "BO",
  Brasil: "BR", Bulgaria: "BG", Canadá: "CA", Chile: "CL", China: "CN",
  Colombia: "CO", "Corea del Sur": "KR", "Costa Rica": "CR", Croacia: "HR",
  Cuba: "CU", Dinamarca: "DK", Ecuador: "EC", Egipto: "EG",
  "El Salvador": "SV", "Emiratos Árabes Unidos": "AE", Eslovaquia: "SK",
  Eslovenia: "SI", España: "ES", "Estados Unidos": "US", Estonia: "EE",
  Filipinas: "PH", Finlandia: "FI", Francia: "FR", Grecia: "GR",
  Guatemala: "GT", Guyana: "GY", Haití: "HT", Honduras: "HN", Hungría: "HU",
  India: "IN", Indonesia: "ID", Irlanda: "IE", Islandia: "IS", Israel: "IL",
  Italia: "IT", Jamaica: "JM", Japón: "JP", Letonia: "LV", Lituania: "LT",
  Luxemburgo: "LU", Malasia: "MY", Malta: "MT", Marruecos: "MA", México: "MX",
  Nicaragua: "NI", Noruega: "NO", "Nueva Zelanda": "NZ", "Países Bajos": "NL",
  Panamá: "PA", Paraguay: "PY", Perú: "PE", Polonia: "PL", Portugal: "PT",
  "Puerto Rico": "PR", "Reino Unido": "GB", "República Checa": "CZ",
  "República Dominicana": "DO", Rumania: "RO", Rusia: "RU", Singapur: "SG",
  Sudáfrica: "ZA", Suecia: "SE", Suiza: "CH", Surinam: "SR", Tailandia: "TH",
  "Trinidad y Tobago": "TT", Turquía: "TR", Ucrania: "UA", Uruguay: "UY",
  Venezuela: "VE", Vietnam: "VN",
};
const countryOptions = Object.keys(countryToCode).sort((a, b) => a.localeCompare(b, "es"));

// Agencias: lista fija pedida por dirección (07/09). Kash Plus/Massive son las
// cuentas BLU; Unlok la casa. El manager de la creadora es un campo APARTE.
const CATEGORY_OPTIONS_FALLBACK = ["Elite", "A+", "A", "B+", "B", "C+", "C"];

const getFlagEmoji = (code: string | null) => {
  if (!code) return "";
  return code.toUpperCase().split("").map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
};

interface EditData {
  assigned_agency: string;
  category: string;
  // Manager PERSONA (profiles.id de alguien con rol manager). Es la fuente de
  // verdad de "quién maneja a esta modelo" — el bot y los RPCs agrupan por acá.
  manager_profile_id: string;
  // % con agencia (creator_business.agency_percentage) — como string del input.
  agency_percentage: string;
  country: string;
  city: string;
  birth_date: string;
  internal_notes: string;
}

interface InfoTabContentProps {
  creator: any;
  creatorId: string;
}

const InfoField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="py-3">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className="text-sm font-medium">{value || "—"}</p>
  </div>
);

const EditField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="py-3">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    {children}
  </div>
);

const InfoTabContent = ({ creator, creatorId }: InfoTabContentProps) => {
  const f = useFormato();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const c = creator;
  const biz = c.creator_business;
  // La agencia: las opciones de MI agencia (Kash: Kash Plus, Kash Massive,
  // Atomick) o, si no tiene, su nombre fijo. Ver lib/creadoras/agencia.ts.
  const agencia = useAgenciaDeCreadoras();
  const agenciaActual = agencia.agenciaDe(biz);
  // Manager: misma pieza que el lápiz del Listado (ManagerSelect) — un solo
  // pool, un solo payload, un solo historial.
  const managerName = useManagerName(c.assigned_manager_profile_id);
  // Categorías canónicas — fuente única model_categories.
  const { data: modelCats = [] } = useModelCategories();
  const categoryOptions = modelCats.length > 0
    ? modelCats.map((c) => c.code)
    : CATEGORY_OPTIONS_FALLBACK;

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<EditData>({
    assigned_agency: "",
    category: "",
    manager_profile_id: "",
    agency_percentage: "",
    country: "",
    city: "",
    birth_date: "",
    internal_notes: "",
  });

  const flag = getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null);

  const startEditing = () => {
    setEditData({
      assigned_agency: agenciaActual,
      category: c.category ?? "",
      manager_profile_id: c.assigned_manager_profile_id ?? "",
      agency_percentage: biz?.agency_percentage != null ? String(biz.agency_percentage) : "",
      country: c.country ?? "",
      city: c.city ?? "",
      birth_date: c.birth_date ?? "",
      internal_notes: c.internal_notes ?? "",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const countryCode = countryToCode[editData.country] ?? null;

      await supabase
        .from("creators")
        .update({
          category: editData.category || null,
          country: editData.country || null,
          country_code: countryCode,
          city: editData.city || null,
          birth_date: editData.birth_date || null,
          // La edad sigue a la fecha (Jhon, 06/10): sin fecha, la edad que hubiera queda.
          ...(edadDesde(editData.birth_date) !== null ? { age: edadDesde(editData.birth_date) } : {}),
          internal_notes: editData.internal_notes || null,
          ...managerAssignmentPatch(editData.manager_profile_id),
        } as any)
        .eq("id", creatorId);

      // La agencia solo se escribe si se cambió: una ficha vieja («Kash» sin
      // tier, Unlok…) que se guarda sin tocarla no pierde su compañía. Al
      // elegir una opción, el texto, la compañía y (si la línea lo dice) el
      // tier, juntos. El porcentaje se acota a 0-100 (vacío = null).
      const pctRaw = editData.agency_percentage.trim();
      const pctNum = pctRaw === "" ? null : Math.min(100, Math.max(0, Number(pctRaw)));
      const bizPayload = {
        ...(editData.assigned_agency && editData.assigned_agency !== agenciaActual
          ? negocioDeLaOpcion(editData.assigned_agency, agencia.lineas, agencia.propia)
          : {}),
        agency_percentage: pctNum != null && Number.isFinite(pctNum) ? pctNum : null,
      };
      if (biz?.id) {
        await supabase.from("creator_business").update(bizPayload as any).eq("id", biz.id);
      } else if ("assigned_agency" in bizPayload || bizPayload.agency_percentage != null) {
        // La creadora aún no tiene fila de negocio: crearla en vez de perder
        // el dato en silencio.
        await supabase.from("creator_business").insert({ creator_id: creatorId, ...bizPayload } as any);
      }

      await queryClient.invalidateQueries({ queryKey: ["creator", creatorId] });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof EditData, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };


  return (
    <>
      <div className="flex items-center justify-between mt-4 mb-2">
        <h2 className="text-lg font-semibold">{t("creadores.info.title")}</h2>
        {!isEditing ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5" /> {t("common.edit")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> {t("common.cancel")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? t("creadores.savingEllipsis") : t("common.save")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 rounded-xl border border-white/10 bg-white/5 p-5">
        {/* Agencia Asignada */}
        {isEditing ? (
          <EditField label={t("creadores.info.agency")}>
            <SelectorDeAgencia value={editData.assigned_agency} onChange={(v) => updateField("assigned_agency", v)} />
          </EditField>
        ) : (
          <InfoField label={t("creadores.info.agency")} value={
            agenciaActual ? <span className="text-primary">{agenciaActual}</span> : null
          } />
        )}

        {/* Categoría */}
        {isEditing ? (
          <EditField label={t("common.category")}>
            <Select value={editData.category} onValueChange={(v) => updateField("category", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("common.select")} /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label={t("common.category")} value={c.category} />
        )}

        {/* Estado (read-only always) */}
        <InfoField label={t("common.status")} value={
          c.status ? (
            <Badge variant={statusVariant[c.status] ?? "secondary-soft"} className="font-normal">
              {etiquetaEstado(t, c.status)}
            </Badge>
          ) : null
        } />

        {/* Fecha de Registro (read-only always) */}
        <InfoField label={t("creadores.info.registrationDate")} value={
          c.registration_date ? format(new Date(c.registration_date), f.idioma === "en" ? "MMMM dd, yyyy" : "dd 'de' MMMM 'de' yyyy", { locale: f.fechas }) : null
        } />

        {/* Manager (PERSONA con rol manager — fuente de verdad de quién maneja
            a esta modelo; el bot de WhatsApp y los reportes agrupan por aquí) */}
        {isEditing ? (
          <EditField label="Manager">
            <ManagerSelect
              value={editData.manager_profile_id}
              onChange={(v) => updateField("manager_profile_id", v)}
              className="h-9 text-sm"
            />
          </EditField>
        ) : (
          <InfoField label="Manager" value={managerName} />
        )}

        {/* País */}
        {isEditing ? (
          <EditField label={t("common.country")}>
            <Select value={editData.country} onValueChange={(v) => updateField("country", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("common.select")} /></SelectTrigger>
              <SelectContent>
                {countryOptions.map((co) => <SelectItem key={co} value={co}>{co}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label={t("common.country")} value={
            c.country ? (
              <span>{flag && <span className="mr-1">{flag}</span>}{c.country}</span>
            ) : null
          } />
        )}

        {/* Ciudad */}
        {isEditing ? (
          <EditField label={t("common.city")}>
            <Input className="h-9 text-sm" value={editData.city} onChange={(e) => updateField("city", e.target.value)} placeholder={t("common.city")} />
          </EditField>
        ) : (
          <InfoField label={t("common.city")} value={c.city} />
        )}

        {/* Fecha de Nacimiento */}
        {isEditing ? (
          <EditField label={t("common.birthDate")}>
            <DateInput value={editData.birth_date} onChange={(v) => updateField("birth_date", v)} toYear={new Date().getFullYear()} />
          </EditField>
        ) : (
          <InfoField label={t("common.birthDate")} value={
            c.birth_date ? format(new Date(c.birth_date), f.idioma === "en" ? "MMMM dd, yyyy" : "dd 'de' MMMM 'de' yyyy", { locale: f.fechas }) : null
          } />
        )}

        {/* Porcentaje con Agencia */}
        {isEditing ? (
          <EditField label={t("creadores.info.agencyPct")}>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 text-sm w-28"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={editData.agency_percentage}
                onChange={(e) => updateField("agency_percentage", e.target.value)}
                placeholder="30"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </EditField>
        ) : biz?.commission_type === "tiered" && Array.isArray(biz?.commission_tiers) && (biz.commission_tiers as any[]).length > 0 ? (
          <div className="py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">{t("creadores.info.tieredCommission")}</p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              {(biz.commission_tiers as any[]).map((tier: any, i: number) => (
                <p key={i} className="text-sm">
                  ${tier.min_revenue?.toLocaleString()} – {tier.max_revenue != null ? `$${tier.max_revenue.toLocaleString()}` : "∞"}: <span className="font-semibold">{tier.percentage}%</span>
                </p>
              ))}
            </div>
          </div>
        ) : (
          <InfoField label={t("creadores.info.agencyPct")} value={biz?.agency_percentage != null ? `${biz.agency_percentage}%` : null} />
        )}

        {/* WhatsApp: abre el chat en la bandeja de Maven (sin exponer el número) */}
        <InfoField label="WhatsApp" value={<WaChatButton phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} />} />

        {/* Telegram: abre el chat en la bandeja de Maven contactando por el TELÉFONO del
            creador (importContacts server-side), como WhatsApp. NO usa telegram_handle (promo). */}
        <InfoField label="Telegram" value={(c.whatsapp_number || c.phone) ? <TgChatButton creatorId={creatorId} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} /> : null} />

        {/* Notas Internas */}
        {isEditing ? (
          <div className="py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">{t("creadores.info.internalNotes")}</p>
            <Textarea
              className="text-sm min-h-[80px]"
              value={editData.internal_notes}
              onChange={(e) => updateField("internal_notes", e.target.value)}
              placeholder={t("creadores.info.internalNotesPh")}
            />
          </div>
        ) : (
          <InfoField label={t("creadores.info.internalNotes")} value={c.internal_notes} />
        )}
      </div>
    </>
  );
};

export default InfoTabContent;
