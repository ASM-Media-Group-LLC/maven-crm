import { useState } from "react";
import { AlertTriangle, Heart, Dog, UtensilsCrossed, MessageCircle, Shield, Sparkles, Video, Star, Lock, Edit, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import VideoOnboarding from "@/components/creadores/VideoOnboarding";
import ChatterOperationalView from "./ChatterOperationalView";
import { useVistaTrabajo } from "./vistaTrabajo";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { etiquetaTono, etiquetaRechazo, etiquetaPlataformaVideollamada } from "./etiquetasCreadora";

interface OperacionesTabContentProps {
  creator: {
    tono_voz?: string | null;
    apodos_permitidos?: string | null;
    palabras_prohibidas?: string | null;
    contenido_jamas_haria?: string | null;
    hobbies?: string | null;
    mascotas_nombres?: string | null;
    comida_favorita?: string | null;
    precios_contenido?: unknown;
    emoji_frecuente?: string | null;
    como_quieres_que_te_llamen?: string | null;
    personalidad_marca?: string | null;
    tono_emocional?: string | null;
    terminos_afecto?: string | null;
    frases_venta?: string | null;
    respuesta_sexo_en_persona?: string | null;
    respuesta_usuario_grosero?: string | null;
    respuesta_pedir_desnudos?: string | null;
    respuesta_cuanto_cobra_encuentro?: string | null;
    respuesta_muestra_intimas?: string | null;
    estrategia_material_gratis?: string | null;
    estrategia_problemas_personales?: string | null;
    estrategia_rechazo?: string | null;
    currency?: string | null;
    gfe_disponible?: boolean | null;
    plataforma_videollamada?: string | null;
    usuarios_vip?: string | null;
    estrategia_recuperacion?: string | null;
    restricciones_seguridad?: string | null;
  };
  creatorId: string;
}

// Las claves (cat1, custom…) son las de creators.precios_contenido: DATO. Acá solo
// se elige cómo se llama cada servicio en pantalla.
const PRICE_LABEL_KEYS: Record<string, TranslationKey> = {
  cat1: "cr.svcContentX",
  cat2: "cr.svcContentXX",
  cat3: "cr.svcContentXXX",
  cat4: "cr.svcBackdoor",
  custom: "cr.svcCustomContent",
  drating: "cr.svcDRating",
  videocalls: "creadores.ops.svcVideocalls",
  underwear: "cr.svcUnderwear",
  zings: "cr.svcZings",
  saludos: "cr.svcGreetings",
  colaboraciones: "cr.svcCollabs",
  sesiones_acompanamiento: "cr.svcCompanionship",
  videollamada_amistad: "cr.svcVideocallFriend",
  videollamada_otro: "cr.svcVideocallOther",
  material_cortesia: "creadores.ops.svcCourtesy",
  material_sensual: "creadores.ops.svcSensual",
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parsePricing(raw: unknown, t: T): { key: string; service: string; price: number; notes: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = Object.entries(raw as Record<string, { price?: number; notes?: string }>);
  return entries
    .filter(([, v]) => v && typeof v.price === "number" && v.price > 0)
    .map(([key, v]) => ({
      key,
      service: PRICE_LABEL_KEYS[key] ? t(PRICE_LABEL_KEYS[key]) : key,
      price: v.price!,
      notes: v.notes ?? "",
    }));
}

export const NoData = () => {
  const { t } = useLanguage();
  return <span className="text-sm text-muted-foreground italic">{t("creadores.notConfigured")}</span>;
};

// `key` es la columna de creators; `label` la clave de su título. `etiqueta`, si
// está, traduce las opciones guardadas del select del onboarding (lo demás es
// texto libre y se muestra tal cual).
type Etiquetador = (t: (k: TranslationKey) => string, valor: string) => string;
const crisisScripts: { key: string; label: TranslationKey; etiqueta?: Etiquetador }[] = [
  { key: "respuesta_sexo_en_persona", label: "creadores.ops.crisisMeetInPerson" },
  { key: "respuesta_usuario_grosero", label: "creadores.ops.crisisRude" },
  { key: "respuesta_pedir_desnudos", label: "creadores.ops.crisisFreeMaterial" },
  { key: "respuesta_cuanto_cobra_encuentro", label: "creadores.ops.crisisMeetPrice" },
  { key: "respuesta_muestra_intimas", label: "creadores.ops.crisisIntimate" },
  { key: "estrategia_material_gratis", label: "creadores.ops.crisisFreeStrategy" },
  { key: "estrategia_problemas_personales", label: "creadores.ops.crisisPersonal" },
  { key: "estrategia_rechazo", label: "creadores.ops.crisisRejection", etiqueta: etiquetaRechazo },
];

// Campos de texto editables (todos columnas planas de creators).
const TEXT_FIELDS = [
  "tono_voz", "tono_emocional", "como_quieres_que_te_llamen", "emoji_frecuente",
  "personalidad_marca", "terminos_afecto", "frases_venta",
  "apodos_permitidos", "palabras_prohibidas", "contenido_jamas_haria",
  "respuesta_sexo_en_persona", "respuesta_usuario_grosero", "respuesta_pedir_desnudos",
  "respuesta_cuanto_cobra_encuentro", "respuesta_muestra_intimas",
  "estrategia_material_gratis", "estrategia_problemas_personales", "estrategia_rechazo",
  "hobbies", "mascotas_nombres", "comida_favorita",
  "plataforma_videollamada", "usuarios_vip", "estrategia_recuperacion", "restricciones_seguridad",
] as const;
type TextField = typeof TEXT_FIELDS[number];
type EditData = Record<TextField, string> & { gfe_disponible: boolean };

const OperacionesTabContent = ({ creator, creatorId }: OperacionesTabContentProps) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  // La vista operativa (personaje, precios, protocolo de respuesta) es la que
  // ve quien abre el perfil como vista de trabajo: el chatter que llega por su
  // roster de Horarios y el rol legacy `agent`. Ver `vistaTrabajo.ts`.
  const { vistaTrabajo } = useVistaTrabajo();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<EditData>({} as EditData);

  if (vistaTrabajo) {
    return <ChatterOperationalView creator={creator} creatorId={creatorId} />;
  }

  const startEditing = () => {
    const base = Object.fromEntries(
      TEXT_FIELDS.map((f) => [f, ((creator as Record<string, unknown>)[f] as string | null) ?? ""]),
    ) as Record<TextField, string>;
    setEditData({ ...base, gfe_disponible: !!creator.gfe_disponible });
    setIsEditing(true);
  };

  const set = (field: TextField, value: string) => setEditData((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { gfe_disponible: editData.gfe_disponible };
      for (const f of TEXT_FIELDS) payload[f] = editData[f].trim() || null;
      const { error } = await supabase.from("creators").update(payload as any).eq("id", creatorId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["creator", creatorId] });
      setIsEditing(false);
      toast.success(t("creadores.ops.saved"));
    } catch (e: any) {
      toast.error(t("creadores.couldNotSaveMsg", { msg: e.message }));
    } finally {
      setSaving(false);
    }
  };

  // Helpers de edición: input o textarea con el label chiquito de la vista.
  const EIn = ({ field, placeholder }: { field: TextField; placeholder?: string }) => (
    <Input className="h-9 text-sm" value={editData[field] ?? ""} onChange={(e) => set(field, e.target.value)} placeholder={placeholder} />
  );
  const ETx = ({ field, placeholder }: { field: TextField; placeholder?: string }) => (
    <Textarea className="text-sm min-h-[64px]" value={editData[field] ?? ""} onChange={(e) => set(field, e.target.value)} placeholder={placeholder} />
  );

  const apodos = parseCsv(creator.apodos_permitidos);
  const prohibidas = parseCsv(creator.palabras_prohibidas);
  const pricing = parsePricing(creator.precios_contenido, t);
  const currencySymbol = creator.currency === "EUR" ? "€" : "$";

  const hasCrisisData = crisisScripts.some(
    (s) => !!(creator as Record<string, unknown>)[s.key]
  );

  return (
    <div className="space-y-5 mt-2">
      {/* Editar/Guardar ARRIBA DE TODO: este botón gobierna el tab entero,
          incluido el video, así que tenerlo debajo de la primera tarjeta
          hacía parecer que solo afectaba a lo de abajo. */}
      <div className="flex items-center justify-end">
        {!isEditing ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5" /> {t("common.edit")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> {t("common.cancel")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? t("creadores.savingEllipsis") : t("common.save")}
            </Button>
          </div>
        )}
      </div>

      {/* El video, primero del contenido: si existe, es la forma más rápida de aprender su
          voz, y leer treinta campos de texto antes de verlo es al revés.
          Subir/reemplazar aparece solo en modo edición, como el resto del tab. */}
      <VideoOnboarding creatorId={creatorId} puedeEditar={isEditing} />


      {/* 1. Ficha de Personaje */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> {t("creadores.ops.characterSheet")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("cr.toneOfVoice")}</p>
              {isEditing ? <EIn field="tono_voz" placeholder={t("creadores.ops.toneOfVoicePh")} /> : creator.tono_voz ? (
                <p className="text-lg font-semibold capitalize">{etiquetaTono(t, creator.tono_voz)}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.emotionalTone")}</p>
              {isEditing ? <EIn field="tono_emocional" /> : creator.tono_emocional ? (
                <p className="text-sm font-medium">{creator.tono_emocional}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.whatToCallHer")}</p>
              {isEditing ? <EIn field="como_quieres_que_te_llamen" /> : creator.como_quieres_que_te_llamen ? (
                <p className="text-sm font-medium">{creator.como_quieres_que_te_llamen}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.frequentEmojis")}</p>
              {isEditing ? <EIn field="emoji_frecuente" placeholder="😏💦🔥" /> : creator.emoji_frecuente ? (
                <p className="text-lg">{creator.emoji_frecuente}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.brandPersonality")}</p>
              {isEditing ? <ETx field="personalidad_marca" /> : creator.personalidad_marca ? (
                <p className="text-sm">{etiquetaTono(t, creator.personalidad_marca)}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.affectionTerms")}</p>
              {isEditing ? <EIn field="terminos_afecto" placeholder={t("creadores.ops.affectionTermsPh")} /> : creator.terminos_afecto ? (
                <p className="text-sm">{creator.terminos_afecto}</p>
              ) : <NoData />}
            </div>
          </div>

          {(isEditing || creator.frases_venta) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> {t("creadores.ops.salesLines")}
              </p>
              {isEditing ? <ETx field="frases_venta" /> : (
                <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{creator.frases_venta}"</p>
              )}
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1.5">{t("creadores.ops.allowedNicknames")}</p>
            {isEditing ? <EIn field="apodos_permitidos" placeholder={t("creadores.ops.allowedNicknamesPh")} /> : apodos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {apodos.map((a) => (
                  <Badge key={a} variant="primary-soft">{a}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">{t("creadores.ops.bannedWords")}</p>
            {isEditing ? <EIn field="palabras_prohibidas" placeholder={t("creadores.ops.commaSeparated")} /> : prohibidas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prohibidas.map((p) => (
                  <Badge key={p} variant="destructive">{p}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>
        </CardContent>
      </Card>

      {/* 2. Muro de Contención */}
      <Alert variant="destructive" className="border-2">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-sm font-bold">
          {t("creadores.ops.willNeverDo")}
        </AlertTitle>
        <AlertDescription className="mt-1">
          {isEditing ? <ETx field="contenido_jamas_haria" /> : creator.contenido_jamas_haria ? (
            <p className="font-medium">{creator.contenido_jamas_haria}</p>
          ) : <NoData />}
        </AlertDescription>
      </Alert>

      {/* 3. Protocolo de Crisis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> {t("creadores.ops.crisisProtocol")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              {crisisScripts.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs font-bold text-muted-foreground">{t(label)}</p>
                  <ETx field={key as TextField} />
                </div>
              ))}
            </div>
          ) : hasCrisisData ? (
            <div className="space-y-4">
              {crisisScripts.map(({ key, label, etiqueta }) => {
                const value = (creator as Record<string, unknown>)[key] as string | null;
                if (!value) return null;
                return (
                  <div key={key} className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs font-bold text-muted-foreground">{t(label)}</p>
                    <p className="text-sm">{etiqueta ? etiqueta(t, value) : value}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <NoData />
          )}
        </CardContent>
      </Card>

      {/* 4. Ganchos de Conversación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("creadores.ops.conversationHooks")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Heart className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{t("creadores.ops.hobbies")}</p>
              {isEditing ? <EIn field="hobbies" /> : creator.hobbies ? <p className="text-sm">{creator.hobbies}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Dog className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{t("creadores.ops.pets")}</p>
              {isEditing ? <EIn field="mascotas_nombres" /> : creator.mascotas_nombres ? <p className="text-sm">{creator.mascotas_nombres}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UtensilsCrossed className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{t("creadores.ops.favoriteFood")}</p>
              {isEditing ? <EIn field="comida_favorita" /> : creator.comida_favorita ? <p className="text-sm">{creator.comida_favorita}</p> : <NoData />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Resumen Comercial (Tabla de Precios mejorada) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t("creadores.ops.commercialSummary")}</span>
            {creator.currency && (
              <Badge variant="secondary-soft" className="text-xs">{creator.currency}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("creadores.ops.service")}</TableHead>
                  <TableHead className="text-right">{t("creadores.ops.price")}</TableHead>
                  <TableHead>{t("creadores.ops.notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-medium">{p.service}</TableCell>
                    <TableCell className="text-right">{currencySymbol}{p.price}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <NoData />}
        </CardContent>
      </Card>

      {/* 6. Información Estratégica */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" /> {t("creadores.ops.strategicInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.gfeAvailability")}</p>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Switch checked={editData.gfe_disponible} onCheckedChange={(v) => setEditData((p) => ({ ...p, gfe_disponible: v }))} />
                  <span className="text-sm">{editData.gfe_disponible ? t("creadores.ops.available") : t("creadores.ops.notAvailable")}</span>
                </div>
              ) : (
                <Badge variant={creator.gfe_disponible ? "success-soft" : "secondary-soft"}>
                  {creator.gfe_disponible ? t("creadores.ops.available") : t("creadores.ops.notAvailable")}
                </Badge>
              )}
            </div>
            <div className="flex items-start gap-2">
              <Video className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("creadores.ops.videocallPlatform")}</p>
                {isEditing ? <EIn field="plataforma_videollamada" /> : creator.plataforma_videollamada ? (
                  <p className="text-sm font-medium">{etiquetaPlataformaVideollamada(t, creator.plataforma_videollamada)}</p>
                ) : <NoData />}
              </div>
            </div>
          </div>

          {(isEditing || creator.usuarios_vip) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.vipUsers")}</p>
              {isEditing ? <ETx field="usuarios_vip" /> : (
                <p className="text-sm bg-muted/50 rounded-lg p-3">{creator.usuarios_vip}</p>
              )}
            </div>
          )}

          {(isEditing || creator.estrategia_recuperacion) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("creadores.ops.winbackStrategy")}</p>
              {isEditing ? <ETx field="estrategia_recuperacion" /> : (
                <p className="text-sm">{creator.estrategia_recuperacion}</p>
              )}
            </div>
          )}

          {(isEditing || creator.restricciones_seguridad) && (
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("creadores.ops.safetyRestrictions")}</p>
                {isEditing ? <ETx field="restricciones_seguridad" /> : (
                  <p className="text-sm font-medium">{creator.restricciones_seguridad}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OperacionesTabContent;
