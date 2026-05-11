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
import { useQueryClient } from "@tanstack/react-query";
import { useWhaticketLink } from "@/hooks/useWhaticketLink";
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

const countryOptions = [
  "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Costa Rica", "Cuba",
  "Ecuador", "El Salvador", "España", "Estados Unidos", "Guatemala", "Honduras",
  "México", "Nicaragua", "Panamá", "Paraguay", "Perú", "Puerto Rico",
  "República Dominicana", "Uruguay", "Venezuela",
];

// Fallback estático — la fuente real son scouter_companies (canónica).
const AGENCY_OPTIONS_FALLBACK = ["Kash", "Atomick", "Unlok", "Ora", "Exchange", "PicLink", "LeakHunter", "Trafix", "Proyecto Medellín", "Pagomundo", "BLU"];
const CATEGORY_OPTIONS_FALLBACK = ["Elite", "A+", "A", "B+", "B", "C+", "C"];
const managerOptions = ["Full Management", "Hybrid", "Basic"];

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

interface EditData {
  assigned_agency: string;
  category: string;
  manager_type: string;
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
  const { data: whaticketUrl } = useWhaticketLink(creatorId);
  // Compañías canónicas — fuente única scouter_companies.
  const { data: scouterCompanies = [] } = useScouterCompanies();
  const agencyOptions = scouterCompanies.length > 0
    ? scouterCompanies.map((sc) => sc.name)
    : AGENCY_OPTIONS_FALLBACK;
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
        })
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 rounded-lg border border-border bg-card p-5">
        {/* Agencia Asignada */}
        {isEditing ? (
          <EditField label="Agencia Asignada">
            <Select value={editData.assigned_agency} onValueChange={(v) => updateField("assigned_agency", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {agencyOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
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

        {/* Manager */}
        {isEditing ? (
          <EditField label="Manager">
            <Select value={editData.manager_type} onValueChange={(v) => updateField("manager_type", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {managerOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
        ) : (
          <InfoField label="Manager" value={biz?.manager_type} />
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
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
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

        {/* Whaticket (read-only always) */}
        <InfoField label="Whaticket" value={
          whaticketUrl ? (
            <a href={whaticketUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              Abrir Whaticket <ExternalLink className="h-3 w-3" />
            </a>
          ) : null
        } />

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
