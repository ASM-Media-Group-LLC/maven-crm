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
    onboarding_video_key?: string | null;
    onboarding_video_at?: string | null;
  };
  creatorId: string;
}

export const priceLabels: Record<string, string> = {
  cat1: "Contenido X",
  cat2: "Contenido XX",
  cat3: "Contenido XXX",
  cat4: "Backdoor",
  custom: "Contenido Personalizado",
  drating: "D-Rating",
  videocalls: "Videollamadas",
  underwear: "Venta de Ropa Interior",
  zings: "Zings",
  saludos: "Saludos a Medida",
  colaboraciones: "Colaboraciones con Terceros",
  sesiones_acompanamiento: "Sesiones de Acompañamiento",
  videollamada_amistad: "Videollamada Amistad",
  videollamada_otro: "Videollamada Otro",
  material_cortesia: "Material de Cortesía",
  material_sensual: "Material Sensual",
};

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parsePricing(raw: unknown): { service: string; price: number; notes: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = Object.entries(raw as Record<string, { price?: number; notes?: string }>);
  return entries
    .filter(([, v]) => v && typeof v.price === "number" && v.price > 0)
    .map(([key, v]) => ({
      service: priceLabels[key] ?? key,
      price: v.price!,
      notes: v.notes ?? "",
    }));
}

const NoData = () => <span className="text-sm text-muted-foreground italic">Sin configurar</span>;

const crisisScripts: { key: string; label: string }[] = [
  { key: "respuesta_sexo_en_persona", label: "Si pide encuentro en persona" },
  { key: "respuesta_usuario_grosero", label: "Si el usuario es grosero" },
  { key: "respuesta_pedir_desnudos", label: "Si pide material gratis" },
  { key: "respuesta_cuanto_cobra_encuentro", label: "Si pregunta cuánto cobra por encuentro" },
  { key: "respuesta_muestra_intimas", label: "Si pide muestras íntimas" },
  { key: "estrategia_material_gratis", label: "Estrategia para material gratis" },
  { key: "estrategia_problemas_personales", label: "Si tiene problemas personales" },
  { key: "estrategia_rechazo", label: "Estrategia de rechazo" },
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
      toast.success("Ficha operativa guardada");
    } catch (e: any) {
      toast.error(`No se pudo guardar: ${e.message}`);
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
  const pricing = parsePricing(creator.precios_contenido);
  const currencySymbol = creator.currency === "EUR" ? "€" : "$";

  const hasCrisisData = crisisScripts.some(
    (s) => !!(creator as Record<string, unknown>)[s.key]
  );

  return (
    <div className="space-y-5 mt-2">
      {/* El video va PRIMERO: si existe, es la forma más rápida de aprender su
          voz, y leer treinta campos de texto antes de verlo es al revés.
          Subir/reemplazar aparece solo en modo edición, como el resto del tab. */}
      <VideoOnboarding
        creatorId={creatorId}
        videoKey={creator.onboarding_video_key ?? null}
        videoAt={creator.onboarding_video_at ?? null}
        puedeEditar={isEditing}
        onCambio={() => { void queryClient.invalidateQueries({ queryKey: ["creator", creatorId] }); }}
      />

      {/* Editar/Guardar — mismo patrón que el tab Información */}
      <div className="flex items-center justify-end -mb-2">
        {!isEditing ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        )}
      </div>

      {/* 1. Ficha de Personaje */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Ficha de Personaje
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tono de voz</p>
              {isEditing ? <EIn field="tono_voz" placeholder="dulce, coqueta…" /> : creator.tono_voz ? (
                <p className="text-lg font-semibold capitalize">{creator.tono_voz}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tono emocional</p>
              {isEditing ? <EIn field="tono_emocional" /> : creator.tono_emocional ? (
                <p className="text-sm font-medium">{creator.tono_emocional}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Cómo quiere que la llamen</p>
              {isEditing ? <EIn field="como_quieres_que_te_llamen" /> : creator.como_quieres_que_te_llamen ? (
                <p className="text-sm font-medium">{creator.como_quieres_que_te_llamen}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Emojis frecuentes</p>
              {isEditing ? <EIn field="emoji_frecuente" placeholder="😏💦🔥" /> : creator.emoji_frecuente ? (
                <p className="text-lg">{creator.emoji_frecuente}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Personalidad de marca</p>
              {isEditing ? <ETx field="personalidad_marca" /> : creator.personalidad_marca ? (
                <p className="text-sm">{creator.personalidad_marca}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Términos de afecto preferidos</p>
              {isEditing ? <EIn field="terminos_afecto" placeholder="bebé, mi amor…" /> : creator.terminos_afecto ? (
                <p className="text-sm">{creator.terminos_afecto}</p>
              ) : <NoData />}
            </div>
          </div>

          {(isEditing || creator.frases_venta) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Frases de venta
              </p>
              {isEditing ? <ETx field="frases_venta" /> : (
                <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{creator.frases_venta}"</p>
              )}
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1.5">Apodos permitidos</p>
            {isEditing ? <EIn field="apodos_permitidos" placeholder="separados por coma: nena, princesa…" /> : apodos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {apodos.map((a) => (
                  <Badge key={a} variant="primary-soft">{a}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Palabras prohibidas</p>
            {isEditing ? <EIn field="palabras_prohibidas" placeholder="separadas por coma" /> : prohibidas.length > 0 ? (
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
        <AlertTitle className="text-sm font-bold uppercase tracking-wide">
          Esta modelo jamás hará:
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
            <Shield className="h-4 w-4 text-primary" /> Protocolo de Crisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              {crisisScripts.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                  <ETx field={key as TextField} />
                </div>
              ))}
            </div>
          ) : hasCrisisData ? (
            <div className="space-y-4">
              {crisisScripts.map(({ key, label }) => {
                const value = (creator as Record<string, unknown>)[key] as string | null;
                if (!value) return null;
                return (
                  <div key={key} className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-sm">{value}</p>
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
          <CardTitle className="text-base">Ganchos de Conversación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Heart className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Hobbies</p>
              {isEditing ? <EIn field="hobbies" /> : creator.hobbies ? <p className="text-sm">{creator.hobbies}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Dog className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Mascotas</p>
              {isEditing ? <EIn field="mascotas_nombres" /> : creator.mascotas_nombres ? <p className="text-sm">{creator.mascotas_nombres}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UtensilsCrossed className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Comida favorita</p>
              {isEditing ? <EIn field="comida_favorita" /> : creator.comida_favorita ? <p className="text-sm">{creator.comida_favorita}</p> : <NoData />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Resumen Comercial (Tabla de Precios mejorada) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Resumen Comercial</span>
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
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p) => (
                  <TableRow key={p.service}>
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
            <Star className="h-4 w-4 text-primary" /> Información Estratégica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Disponibilidad GFE</p>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Switch checked={editData.gfe_disponible} onCheckedChange={(v) => setEditData((p) => ({ ...p, gfe_disponible: v }))} />
                  <span className="text-sm">{editData.gfe_disponible ? "Disponible" : "No disponible"}</span>
                </div>
              ) : (
                <Badge variant={creator.gfe_disponible ? "success-soft" : "secondary-soft"}>
                  {creator.gfe_disponible ? "Disponible" : "No disponible"}
                </Badge>
              )}
            </div>
            <div className="flex items-start gap-2">
              <Video className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Plataforma de videollamada</p>
                {isEditing ? <EIn field="plataforma_videollamada" /> : creator.plataforma_videollamada ? (
                  <p className="text-sm font-medium">{creator.plataforma_videollamada}</p>
                ) : <NoData />}
              </div>
            </div>
          </div>

          {(isEditing || creator.usuarios_vip) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Usuarios VIP</p>
              {isEditing ? <ETx field="usuarios_vip" /> : (
                <p className="text-sm bg-muted/50 rounded-lg p-3">{creator.usuarios_vip}</p>
              )}
            </div>
          )}

          {(isEditing || creator.estrategia_recuperacion) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Estrategia de recuperación</p>
              {isEditing ? <ETx field="estrategia_recuperacion" /> : (
                <p className="text-sm">{creator.estrategia_recuperacion}</p>
              )}
            </div>
          )}

          {(isEditing || creator.restricciones_seguridad) && (
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Restricciones de seguridad</p>
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
