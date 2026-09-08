import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { useScouterCompanies } from "@/hooks/useScouterLeads";
import { useModelCategories } from "@/hooks/useModelCategories";
import { ExternalLink } from "lucide-react";

const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
};

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
const AGENCY_OPTIONS = ["Kash Massive", "Kash Plus", "Unlok"];
const CATEGORY_OPTIONS_FALLBACK = ["Elite", "A+", "A", "B+", "B", "C+", "C"];
const managerTypeOptions = ["Full Management", "Hybrid", "Basic"];

const getFlagEmoji = (code: string | null) => {
  if (!code) return "";
  return code.toUpperCase().split("").map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
};

interface EditData {
  assigned_agency: string;
  category: string;
  manager_type: string;
  // Manager PERSONA (profiles.id de alguien con rol manager). Es la fuente de
  // verdad de "quién maneja a esta modelo" — el bot y los RPCs agrupan por acá.
  manager_profile_id: string;
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
  const queryClient = useQueryClient();
  const c = creator;
  const biz = c.creator_business;
  // scouter_companies solo para resolver company_id si el nombre matchea.
  const { data: scouterCompanies = [] } = useScouterCompanies();
  // Personas con rol manager — vía RPC SECURITY DEFINER (RLS de user_roles solo
  // deja leer la fila propia; mismo patrón que get_assignable_closers).
  const { data: managers = [] } = useQuery({
    queryKey: ["assignable-managers"],
    queryFn: async (): Promise<Array<{ id: string; full_name: string | null }>> => {
      const { data, error } = await supabase.rpc("get_assignable_managers" as any);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
    staleTime: 5 * 60_000,
  });
  const managerName = c.assigned_manager_profile_id
    ? (managers.find((m) => m.id === c.assigned_manager_profile_id)?.full_name ?? "(fuera del rol manager)")
    : null;
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
    manager_type: "",
    manager_profile_id: "",
    country: "",
    city: "",
    birth_date: "",
    internal_notes: "",
  });

  const flag = getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null);

  const startEditing = () => {
    setEditData({
      // Lee del FK joined; fallback al texto si la FK no está poblada.
      assigned_agency: (biz as any)?.company?.name ?? biz?.assigned_agency ?? "",
      category: c.category ?? "",
      manager_type: biz?.manager_type ?? "",
      manager_profile_id: c.assigned_manager_profile_id ?? "",
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
          internal_notes: editData.internal_notes || null,
          // Manager persona: se escriben LAS DOS columnas (profile_id es la
          // canónica del bot/RPCs; assigned_manager_id la usan ManagerDashboard
          // y ventas_tops — mantenerlas iguales evita el split-brain).
          assigned_manager_profile_id: editData.manager_profile_id || null,
          assigned_manager_id: editData.manager_profile_id || null,
        } as any)
        .eq("id", creatorId);

      if (biz?.id) {
        // Dual-write: resolvemos company_id desde el name elegido (la
        // lista viene de scouter_companies) y guardamos AMBOS — la FK
        // canónica y el texto por backwards-compat.
        const matchedCompany = scouterCompanies.find(
          (sc) => sc.name === editData.assigned_agency,
        );
        await supabase
          .from("creator_business")
          .update({
            assigned_agency: editData.assigned_agency || null,
            company_id: matchedCompany?.id ?? null,
            manager_type: editData.manager_type || null,
          } as any)
          .eq("id", biz.id);
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
        <h2 className="text-lg font-semibold">Información General</h2>
        {!isEditing ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 rounded-xl border border-white/10 bg-white/5 p-5">
        {/* Agencia Asignada */}
        {isEditing ? (
          <EditField label="Agencia Asignada">
            <Select value={editData.assigned_agency} onValueChange={(v) => updateField("assigned_agency", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {/* Un valor guardado fuera de la lista fija sigue visible/elegible. */}
                {(editData.assigned_agency && !AGENCY_OPTIONS.includes(editData.assigned_agency)
                  ? [editData.assigned_agency, ...AGENCY_OPTIONS]
                  : AGENCY_OPTIONS
                ).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="Agencia Asignada" value={
            ((biz as any)?.company?.name || biz?.assigned_agency) ? (
              <span className="text-primary cursor-pointer hover:underline">{(biz as any)?.company?.name ?? biz?.assigned_agency}</span>
            ) : null
          } />
        )}

        {/* Categoría */}
        {isEditing ? (
          <EditField label="Categoría">
            <Select value={editData.category} onValueChange={(v) => updateField("category", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="Categoría" value={c.category} />
        )}

        {/* Estado (read-only always) */}
        <InfoField label="Estado" value={
          c.status ? (
            <Badge variant={statusVariant[c.status] ?? "secondary-soft"} className="font-normal">
              {statusLabel[c.status] ?? c.status}
            </Badge>
          ) : null
        } />

        {/* Fecha de Registro (read-only always) */}
        <InfoField label="Fecha de Registro" value={
          c.registration_date ? format(new Date(c.registration_date), "dd 'de' MMMM 'de' yyyy", { locale: es }) : null
        } />

        {/* Manager (PERSONA con rol manager — fuente de verdad de quién maneja
            a esta modelo; el bot de WhatsApp y los reportes agrupan por acá) */}
        {isEditing ? (
          <EditField label="Manager">
            <Select
              value={editData.manager_profile_id || "__none__"}
              onValueChange={(v) => updateField("manager_profile_id", v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin manager</SelectItem>
                {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="Manager" value={managerName} />
        )}

        {/* Tipo de management (Full/Hybrid/Basic — concepto aparte del manager persona) */}
        {isEditing ? (
          <EditField label="Tipo de management">
            <Select value={editData.manager_type} onValueChange={(v) => updateField("manager_type", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {managerTypeOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="Tipo de management" value={biz?.manager_type} />
        )}

        {/* País */}
        {isEditing ? (
          <EditField label="País">
            <Select value={editData.country} onValueChange={(v) => updateField("country", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {countryOptions.map((co) => <SelectItem key={co} value={co}>{co}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="País" value={
            c.country ? (
              <span>{flag && <span className="mr-1">{flag}</span>}{c.country}</span>
            ) : null
          } />
        )}

        {/* Ciudad */}
        {isEditing ? (
          <EditField label="Ciudad">
            <Input className="h-9 text-sm" value={editData.city} onChange={(e) => updateField("city", e.target.value)} placeholder="Ciudad" />
          </EditField>
        ) : (
          <InfoField label="Ciudad" value={c.city} />
        )}

        {/* Fecha de Nacimiento */}
        {isEditing ? (
          <EditField label="Fecha de Nacimiento">
            <DateInput value={editData.birth_date} onChange={(v) => updateField("birth_date", v)} toYear={new Date().getFullYear()} />
          </EditField>
        ) : (
          <InfoField label="Fecha de Nacimiento" value={
            c.birth_date ? format(new Date(c.birth_date), "dd 'de' MMMM 'de' yyyy", { locale: es }) : null
          } />
        )}

        {/* Porcentaje con Agencia (read-only always) */}
        {biz?.commission_type === "tiered" && Array.isArray(biz?.commission_tiers) && (biz.commission_tiers as any[]).length > 0 ? (
          <div className="py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Comisión por Rangos</p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              {(biz.commission_tiers as any[]).map((t: any, i: number) => (
                <p key={i} className="text-sm">
                  ${t.min_revenue?.toLocaleString()} – {t.max_revenue != null ? `$${t.max_revenue.toLocaleString()}` : "∞"}: <span className="font-semibold">{t.percentage}%</span>
                </p>
              ))}
            </div>
          </div>
        ) : (
          <InfoField label="Porcentaje con Agencia" value={biz?.agency_percentage != null ? `${biz.agency_percentage}%` : null} />
        )}

        {/* WhatsApp: abre el chat en la bandeja de Maven (sin exponer el número) */}
        <InfoField label="WhatsApp" value={<WaChatButton phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} />} />

        {/* Telegram: abre el chat en la bandeja de Maven contactando por el TELÉFONO del
            creador (importContacts server-side), como WhatsApp. NO usa telegram_handle (promo). */}
        <InfoField label="Telegram" value={(c.whatsapp_number || c.phone) ? <TgChatButton creatorId={creatorId} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} /> : null} />

        {/* Notas Internas */}
        {isEditing ? (
          <div className="py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Notas Internas</p>
            <Textarea
              className="text-sm min-h-[80px]"
              value={editData.internal_notes}
              onChange={(e) => updateField("internal_notes", e.target.value)}
              placeholder="Notas internas…"
            />
          </div>
        ) : (
          <InfoField label="Notas Internas" value={c.internal_notes} />
        )}
      </div>
    </>
  );
};

export default InfoTabContent;
